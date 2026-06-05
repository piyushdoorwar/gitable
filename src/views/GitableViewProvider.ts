import * as vscode from "vscode";
import { AiProviderFactory } from "../ai/AiProviderFactory";
import { SecretService } from "../config/SecretService";
import { SettingsService } from "../config/SettingsService";
import {
  FALLBACK_MODELS,
  HISTORY_LIMIT,
  PROVIDER_IDS,
  ProviderId,
  VIEW_ID
} from "../constants";
import { VsCodeGitService } from "../git/VsCodeGitService";
import { RepoChanges } from "../git/models";
import { DiffLimiter } from "../utils/DiffLimiter";
import { Logger } from "../utils/Logger";

type TabName = "changes" | "history" | "settings";

/**
 * Backs the Gitable sidebar webview. Owns the bidirectional message protocol,
 * orchestrates the Git and AI services, and pushes a single immutable `state`
 * object to the webview after every operation.
 */
export class GitableViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private isLoading = false;
  private pendingError = "";
  private pendingNotice = "";
  private pendingTab: TabName | undefined;
  private readonly modelsCache: Partial<Record<ProviderId, string[]>> = {};

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly git: VsCodeGitService,
    private readonly secrets: SecretService,
    private readonly settings: SettingsService,
    private readonly logger: Logger
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "media")]
    };
    view.webview.html = this.getHtml(view.webview);
    view.webview.onDidReceiveMessage((message) => this.handleMessage(message));
    view.onDidDispose(() => {
      this.view = undefined;
    });
    view.onDidChangeVisibility(() => {
      if (view.visible) {
        void this.refresh();
      }
    });
  }

  // ---- Public entry points (used by commands) ----

  async refresh(): Promise<void> {
    await this.postState();
  }

  async focusAndOpenTab(tab: TabName): Promise<void> {
    this.pendingTab = tab;
    await vscode.commands.executeCommand(`${VIEW_ID}.focus`);
    if (this.view) {
      this.view.webview.postMessage({ type: "switchTab", tab });
      this.pendingTab = undefined;
    }
  }

  async generateCommitMessage(): Promise<void> {
    await vscode.commands.executeCommand(`${VIEW_ID}.focus`);
    await this.runGenerate();
  }

  async commitFromCommand(): Promise<void> {
    const summary = await vscode.window.showInputBox({
      prompt: "Commit summary",
      placeHolder: "feat: ..."
    });
    if (!summary) {
      return;
    }
    const description = await vscode.window.showInputBox({
      prompt: "Commit description (optional)"
    });
    await this.runCommit(summary, description ?? "");
  }

  async stageAll(): Promise<void> {
    await this.runGit(() => this.git.stageAll());
  }

  async unstageAll(): Promise<void> {
    await this.runGit(() => this.git.unstageAll());
  }

  async validateActiveProviderKey(): Promise<void> {
    await this.runValidate(this.settings.getProvider());
  }

  // ---- Message handling ----

  private async handleMessage(message: any): Promise<void> {
    if (!message || typeof message.type !== "string") {
      return;
    }
    switch (message.type) {
      case "ready":
        if (this.pendingTab) {
          this.view?.webview.postMessage({ type: "switchTab", tab: this.pendingTab });
          this.pendingTab = undefined;
        }
        await this.refresh();
        break;
      case "refresh":
        await this.refresh();
        break;
      case "selectRepo":
        this.git.setActiveRoot(message.root);
        await this.refresh();
        break;
      case "stageFile":
        await this.runGit(() => this.git.stageFiles([message.filePath]));
        break;
      case "unstageFile":
        await this.runGit(() => this.git.unstageFiles([message.filePath]));
        break;
      case "stageFiles":
        await this.runGit(() => this.git.stageFiles(message.filePaths ?? []));
        break;
      case "unstageFiles":
        await this.runGit(() => this.git.unstageFiles(message.filePaths ?? []));
        break;
      case "stageAll":
        await this.runGit(() => this.git.stageAll());
        break;
      case "unstageAll":
        await this.runGit(() => this.git.unstageAll());
        break;
      case "commit":
        await this.runCommit(message.summary, message.description);
        break;
      case "generateCommitMessage":
        await this.runGenerate();
        break;
      case "saveProvider":
        await this.saveProvider(message.provider);
        break;
      case "saveApiKey":
        await this.saveApiKey(message.provider, message.apiKey);
        break;
      case "validateApiKey":
        await this.runValidate(message.provider);
        break;
      case "saveModel":
        await this.saveModel(message.model);
        break;
      case "fetchModels":
        await this.fetchModels(message.provider);
        break;
      default:
        break;
    }
  }

  // ---- Git operations ----

  private async runGit(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      this.fail(error);
    }
    await this.refresh();
  }

  private async runCommit(summary: string, description?: string): Promise<void> {
    if (!summary || !summary.trim()) {
      this.fail("Commit summary is required.");
      await this.postState();
      return;
    }
    try {
      await this.git.commit(summary.trim(), description?.trim());
      this.pendingNotice = "Commit created.";
      vscode.window.showInformationMessage("Gitable: commit created.");
      this.view?.webview.postMessage({ type: "clearCommitFields" });
    } catch (error) {
      this.fail(error);
    }
    await this.refresh();
  }

  // ---- AI operations ----

  private async runGenerate(): Promise<void> {
    const provider = this.settings.getProvider();
    const apiKey = await this.secrets.getApiKey(provider);
    if (!apiKey) {
      this.fail(`No API key set for ${provider}. Open Settings to add one.`);
      await this.focusAndOpenTab("settings");
      await this.postState();
      return;
    }

    let stagedDiff: string;
    try {
      stagedDiff = await this.git.getStagedDiff();
    } catch (error) {
      this.fail(error);
      await this.refresh();
      return;
    }
    if (!stagedDiff.trim()) {
      this.fail("No staged changes. Stage files before generating a commit message.");
      await this.postState();
      return;
    }

    const diffStat = await this.git.getStagedDiffStat().catch(() => "");
    const prepared = DiffLimiter.prepare(stagedDiff);
    if (!prepared.diff.trim()) {
      this.fail("All staged changes were filtered out as generated/noisy files.");
      await this.postState();
      return;
    }

    this.setLoading(true);
    await this.postState();
    try {
      const model = this.settings.getModel(provider);
      const ai = AiProviderFactory.create(provider);
      const result = await ai.generateCommitMessage(
        { diff: prepared.diff, diffStat, provider, model },
        apiKey
      );
      this.view?.webview.postMessage({
        type: "setCommitFields",
        summary: result.summary,
        description: result.description ?? ""
      });
      const notes: string[] = [];
      if (prepared.truncated) {
        notes.push("diff truncated");
      }
      if (prepared.ignoredFiles.length) {
        notes.push(`${prepared.ignoredFiles.length} generated file(s) ignored`);
      }
      this.pendingNotice = notes.length
        ? `Commit message generated (${notes.join(", ")}).`
        : "Commit message generated.";
    } catch (error) {
      this.fail(error);
    } finally {
      this.setLoading(false);
      await this.postState();
    }
  }

  private async runValidate(provider: ProviderId): Promise<void> {
    const apiKey = await this.secrets.getApiKey(provider);
    if (!apiKey) {
      this.fail(`No API key saved for ${provider}.`);
      await this.postState();
      return;
    }
    this.setLoading(true);
    await this.postState();
    try {
      const ai = AiProviderFactory.create(provider);
      const ok = await ai.validateApiKey(apiKey);
      if (ok) {
        vscode.window.showInformationMessage(`Gitable: ${provider} API key is valid.`);
        this.pendingNotice = "API key validated.";
        await this.cacheModels(provider, apiKey);
      } else {
        this.fail(`The ${provider} API key was rejected.`);
      }
    } catch (error) {
      this.fail(error);
    } finally {
      this.setLoading(false);
      await this.postState();
    }
  }

  // ---- Settings operations ----

  private async saveProvider(provider: ProviderId): Promise<void> {
    if (!this.isProviderId(provider)) {
      return;
    }
    await this.settings.setProvider(provider);
    if (!this.modelsCache[provider]) {
      const apiKey = await this.secrets.getApiKey(provider);
      if (apiKey) {
        await this.cacheModels(provider, apiKey);
      }
    }
    await this.postState();
  }

  private async saveApiKey(provider: ProviderId, apiKey: string): Promise<void> {
    if (!this.isProviderId(provider)) {
      return;
    }
    if (!apiKey || !apiKey.trim()) {
      this.fail("API key is empty.");
      await this.postState();
      return;
    }
    await this.secrets.setApiKey(provider, apiKey.trim());
    vscode.window.showInformationMessage(`Gitable: ${provider} API key saved.`);
    this.pendingNotice = "API key saved securely (SecretStorage).";
    await this.cacheModels(provider, apiKey.trim());
    await this.postState();
  }

  private async saveModel(model: string): Promise<void> {
    const provider = this.settings.getProvider();
    if (!model) {
      this.fail("Select a model first.");
      await this.postState();
      return;
    }
    await this.settings.setModel(provider, model);
    vscode.window.showInformationMessage(`Gitable: model set to ${model}.`);
    this.pendingNotice = "Model saved.";
    await this.postState();
  }

  private async fetchModels(provider: ProviderId): Promise<void> {
    if (!this.isProviderId(provider)) {
      return;
    }
    const apiKey = await this.secrets.getApiKey(provider);
    if (!apiKey) {
      this.fail(`No API key saved for ${provider}.`);
      await this.postState();
      return;
    }
    this.setLoading(true);
    await this.postState();
    try {
      const ai = AiProviderFactory.create(provider);
      const models = await ai.listModels(apiKey);
      this.modelsCache[provider] = models.length ? models : FALLBACK_MODELS[provider];
      this.pendingNotice = `Loaded ${models.length} model(s).`;
    } catch (error) {
      this.fail(error);
    } finally {
      this.setLoading(false);
      await this.postState();
    }
  }

  /** Best-effort model fetch; failures fall back silently to the static list. */
  private async cacheModels(provider: ProviderId, apiKey: string): Promise<void> {
    try {
      const models = await AiProviderFactory.create(provider).listModels(apiKey);
      if (models.length) {
        this.modelsCache[provider] = models;
      }
    } catch (error) {
      this.logger.warn(`Could not list ${provider} models: ${(error as Error).message}`);
    }
  }

  // ---- State ----

  private setLoading(value: boolean): void {
    this.isLoading = value;
  }

  private fail(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.pendingError = message;
    this.logger.error("Operation failed", error);
    vscode.window.showErrorMessage(`Gitable: ${message}`);
  }

  private async postState(): Promise<void> {
    if (!this.view) {
      return;
    }
    const data = await this.buildState();
    this.view.webview.postMessage({ type: "state", data });
    this.pendingError = "";
    this.pendingNotice = "";
  }

  private async buildState(): Promise<Record<string, unknown>> {
    const provider = this.settings.getProvider();
    const model = this.settings.getModel(provider);
    const hasApiKey = await this.secrets.hasApiKey(provider);

    let repositories: Array<{ name: string; root: string }> = [];
    let repositoryName = "No repository";
    let branchName = "";
    let changes: RepoChanges = { staged: [], unstaged: [] };
    let history: unknown[] = [];
    let stateError = this.pendingError;

    try {
      repositories = await this.git.listRepositories();
      const summary = await this.git.getRepoSummary();
      if (summary) {
        repositoryName = summary.name;
        branchName = summary.branch;
        changes = await this.git.getChanges();
        history = await this.git.getHistory(HISTORY_LIMIT);
      }
    } catch (error) {
      if (!stateError) {
        stateError = error instanceof Error ? error.message : String(error);
      }
      this.logger.error("Failed to read Git state", error);
    }

    const models = this.modelsCache[provider] ?? FALLBACK_MODELS[provider];

    return {
      repositoryName,
      branchName,
      activeRoot: this.git.getActiveRoot(),
      repositories,
      changes,
      history,
      provider,
      model,
      models,
      hasApiKey,
      isLoading: this.isLoading,
      error: stateError,
      notice: this.pendingNotice
    };
  }

  private isProviderId(value: unknown): value is ProviderId {
    return typeof value === "string" && (PROVIDER_IDS as string[]).includes(value);
  }

  // ---- HTML ----

  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "main.js")
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "main.css")
    );
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource}`,
      `style-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`
    ].join("; ");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp};" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link href="${styleUri}" rel="stylesheet" />
  <title>Gitable</title>
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let text = "";
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
