import * as path from "path";
import * as vscode from "vscode";
import { AiProviderFactory } from "../ai/AiProviderFactory";
import { buildCommitSummaryPrompt, buildSecurityReviewPrompt } from "../ai/prompts";
import { parseGeneratedMessage, parseSecurityReview } from "../ai/AiProvider";
import { SecretService } from "../config/SecretService";
import { SettingsService } from "../config/SettingsService";
import { UsageStore } from "../analytics/UsageStore";
import { JiraService } from "../jira/JiraService";
import { HISTORY_LIMIT, PROVIDER_IDS, ProviderId, VIEW_ID } from "../constants";
import { VsCodeGitService } from "../git/VsCodeGitService";
import { RebaseState, RepoChanges, StashEntry } from "../git/models";
import { DiffLimiter } from "../utils/DiffLimiter";
import { Logger } from "../utils/Logger";

type TabName = "changes" | "history" | "settings";
type BranchSwitchChoice = "bring" | "keep";
type SelectedCommit = { hash: string; subject: string };
const MIN_STAGE_BUSY_VISIBLE_MS = 2000;

/**
 * Backs the Gitable sidebar webview. Owns the bidirectional message protocol,
 * orchestrates the Git and AI services, and pushes a single immutable `state`
 * object to the webview after every operation.
 */
export class GitableViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private busyKind = "";
  private busyText = "";
  private syncAction = "";
  private lastFetchedAt = 0;
  private pendingTagPushes = new Set<string>();
  /** Summary of the last commit made via Gitable; cleared on push or undo. */
  private lastCommitSummary = "";
  private pendingError = "";
  private pendingNotice = "";
  private pendingTab: TabName | undefined;
  private modelsPreloaded = false;
  private stateRenderSeq = 0;
  private readonly pendingStateRenders = new Map<number, () => void>();
  private readonly modelsCache: Partial<Record<ProviderId, string[]>> = {};

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly git: VsCodeGitService,
    private readonly secrets: SecretService,
    private readonly settings: SettingsService,
    private readonly usage: UsageStore,
    private readonly jira: JiraService,
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
        void this.silentFetchAndRefresh();
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

  async pushCommand(): Promise<void> {
    await this.pushCurrentBranch();
  }

  async pullCommand(): Promise<void> {
    await this.pullWithLocalChangesCheck();
  }

  async createBranchCommand(): Promise<void> {
    await this.createBranchFromInput();
  }

  async switchBranchCommand(): Promise<void> {
    const branches = await this.git.getBranches().catch(() => []);
    if (!branches.length) {
      vscode.window.showInformationMessage("Gitable: no branches found.");
      return;
    }
    const pick = await vscode.window.showQuickPick(branches, { placeHolder: "Switch to branch" });
    if (pick) {
      await this.switchBranch(pick);
    }
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
        void this.preloadModels();
        break;
      case "stateRendered": {
        const renderId = Number(message.renderId);
        const resolve = this.pendingStateRenders.get(renderId);
        if (resolve) {
          this.pendingStateRenders.delete(renderId);
          resolve();
        }
        break;
      }
      case "refresh":
        await this.refresh();
        break;
      case "selectRepo":
        this.git.setActiveRoot(message.root);
        await this.refresh();
        break;
      case "stageFile": {
        const fp = String(message.filePath ?? "");
        if (fp) {
          await this.runGit(() => this.git.stageFiles([fp]), "stage", "Staging file...");
        }
        break;
      }
      case "unstageFile": {
        const fp = String(message.filePath ?? "");
        if (fp) {
          await this.runGit(() => this.git.unstageFiles([fp]), "unstage", "Unstaging file...");
        }
        break;
      }
      case "stageFiles":
        await this.runGit(
          () => this.git.stageFiles(message.filePaths ?? []),
          "stage",
          this.countFilesText(message.filePaths, "Staging")
        );
        break;
      case "unstageFiles":
        await this.runGit(
          () => this.git.unstageFiles(message.filePaths ?? []),
          "unstage",
          this.countFilesText(message.filePaths, "Unstaging")
        );
        break;
      case "stageAll":
        await this.runGit(() => this.git.stageAll(), "stage", this.countFilesText(message.count, "Staging"));
        break;
      case "unstageAll":
        await this.runGit(() => this.git.unstageAll(), "unstage", this.countFilesText(message.count, "Unstaging"));
        break;
      case "commit":
        await this.runCommit(message.summary, message.description);
        break;
      case "amend":
        await this.runAmend(message.summary, message.description);
        break;
      case "generateCommitMessage":
        await this.runGenerate(Number(message.maxChars) || undefined);
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
      case "saveAndValidate":
        if (message.apiKey) {
          await this.saveApiKey(message.provider, message.apiKey);
        }
        await this.runValidate(message.provider);
        break;
      case "saveModel":
        await this.saveModel(message.model);
        break;
      case "fetchModels":
        await this.fetchModels(message.provider);
        break;
      case "push":
        await this.pushCurrentBranch();
        break;
      case "pull":
        await this.pullWithLocalChangesCheck();
        break;
      case "fetchOrigin":
        await this.runSyncOp("Fetching origin", false, async () => {
          await this.git.fetchOrigin();
          this.lastFetchedAt = Date.now();
        });
        break;
      case "switchBranch":
        await this.switchBranch(message.name);
        break;
      case "openFile":
        await this.openFileDiff(message.filePath, !!message.staged, String(message.status ?? ""));
        break;
      case "commitFiles":
        await this.sendCommitFiles(message.hash);
        break;
      case "openCommitFile":
        await this.openCommitFile(message.hash, message.filePath, String(message.status ?? ""));
        break;
      case "discardFiles":
        await this.discardFiles(message.filePaths ?? [], !!message.staged);
        break;
      case "copyFilePath":
        await this.copyFilePath(message.filePath, false);
        break;
      case "copyRelativePath":
        await this.copyFilePath(message.filePath, true);
        break;
      case "revealFile":
        await this.revealFile(message.filePath);
        break;
      case "copySha": {
        const sha = String(message.hash ?? "");
        await vscode.env.clipboard.writeText(sha);
        this.pendingNotice = `SHA copied: ${sha.slice(0, 7)}`;
        await this.postState();
        break;
      }
      case "copyTag": {
        const tag = String(message.tag ?? "");
        await vscode.env.clipboard.writeText(tag);
        this.pendingNotice = `Tag copied: ${tag}`;
        await this.postState();
        break;
      }
      case "revertCommit": {
        const short = String(message.hash ?? "").slice(0, 7);
        await this.runBusyGit("git", `Reverting ${short}…`, () =>
          this.git.revertCommit(message.hash), `Reverted ${short}.`
        );
        break;
      }
      case "cherryPickCommit": {
        const short = String(message.hash ?? "").slice(0, 7);
        await this.runBusyGit("git", `Cherry-picking ${short}…`, () =>
          this.git.cherryPickCommit(message.hash), `Cherry-picked ${short}.`
        );
        break;
      }
      case "createBranch":
        if (message.name) {
          await this.createBranchNamed(message.name);
        } else {
          await this.createBranchFromInput();
        }
        break;
      case "summarizeCommit":
        await this.handleSummarizeCommit(String(message.hash ?? ""), String(message.subject ?? ""), Number(message.maxChars) || undefined);
        break;
      case "summarizeCommits":
        await this.handleSummarizeCommits(this.parseSelectedCommits(message.commits), Number(message.maxChars) || undefined);
        break;
      case "securityReview":
        await this.handleSecurityReview(!!message.staged, Number(message.maxChars) || undefined);
        break;
      case "securityReviewCommits":
        await this.handleSecurityReviewCommits(this.parseSelectedCommits(message.commits), Number(message.maxChars) || undefined);
        break;
      case "getReports":
        this.view?.webview.postMessage({ type: "reports", entries: this.usage.getLast30Days() });
        break;
      case "copySummaryText": {
        const text = String(message.text ?? "");
        await vscode.env.clipboard.writeText(text);
        this.pendingNotice = "Summary copied to clipboard.";
        await this.postState();
        break;
      }
      case "renameBranch":
        await this.renameBranch(String(message.name ?? ""));
        break;
      case "deleteBranch":
        await this.deleteBranch(String(message.name ?? ""));
        break;
      case "mergeBranch":
        await this.mergeBranch(String(message.name ?? ""));
        break;
      case "rebaseBranch":
        await this.rebaseBranch(String(message.name ?? ""));
        break;
      case "rebaseContinue":
        await this.rebaseContinue();
        break;
      case "rebaseAbort":
        await this.rebaseAbort();
        break;
      case "setUpstream":
        await this.setUpstreamForBranch(String(message.name ?? ""));
        break;
      case "stashStaged":
        await this.runBusyGit("git", "Stashing staged changes…", () => this.git.stashStaged(), "Changes stashed.");
        break;
      case "stashPop": {
        const ref = String(message.ref ?? "");
        await this.runBusyGit("git", "Restoring stash…", () => this.git.stashPop(ref), "Stash applied and removed.");
        break;
      }
      case "stashApply": {
        const ref = String(message.ref ?? "");
        await this.runBusyGit("git", "Applying stash…", () => this.git.stashApply(ref), "Stash applied.");
        break;
      }
      case "stashDrop": {
        const ref = String(message.ref ?? "");
        await this.runBusyGit("git", "Dropping stash…", () => this.git.stashDrop(ref), "Stash dropped.");
        break;
      }
      case "copyBranchName": {
        const name = String(message.name ?? "");
        await vscode.env.clipboard.writeText(name);
        this.pendingNotice = `Branch name copied: ${name}`;
        await this.postState();
        break;
      }
      case "openMergeEditor": {
        const filePath = String(message.filePath ?? "");
        if (filePath) {
          try {
            await this.git.openMergeEditor(filePath);
          } catch (error) {
            this.fail(error);
            await this.postState();
          }
        }
        break;
      }
      case "markResolved":
        await this.runGit(
          () => this.git.stageFiles([String(message.filePath ?? "")]),
          "stage",
          "Marking as resolved…"
        );
        break;
      case "createTag": {
        const tagHash = String(message.hash ?? "").trim();
        if (!tagHash) break;
        const tagName = await vscode.window.showInputBox({
          title: "Create tag",
          prompt: `Tag name for commit ${tagHash.slice(0, 7)}`,
          placeHolder: "e.g. v1.2.0",
          validateInput: (v) => {
            const t = v.trim();
            if (!t) return "Tag name cannot be empty.";
            if (/\s/.test(t)) return "Tag name cannot contain spaces.";
            if (t.includes("..")) return 'Tag name cannot contain "..".';
            return null;
          }
        });
        if (!tagName) break;
        await this.runGit(
          async () => {
            await this.git.createTag(tagName.trim(), tagHash);
            this.pendingTagPushes.add(tagName.trim());
            this.pendingNotice = `Tag "${tagName.trim()}" created.`;
          },
          "git",
          `Creating tag "${tagName.trim()}"…`
        );
        break;
      }
      case "deleteTag": {
        const tagName = String(message.name ?? "").trim();
        if (!tagName) break;
        const choice = await vscode.window.showWarningMessage(
          `Delete tag "${tagName}"?`,
          { modal: true },
          "Local only",
          "Local + origin"
        );
        if (!choice) break;
        await this.runGit(
          async () => {
            await this.git.deleteTag(tagName);
            this.pendingTagPushes.delete(tagName);
            if (choice === "Local + origin") {
              await this.git.deleteTagFromOrigin(tagName);
              this.pendingNotice = `Tag "${tagName}" deleted locally and from origin.`;
            } else {
              this.pendingNotice = `Tag "${tagName}" deleted locally.`;
            }
          },
          "git",
          `Deleting tag "${tagName}"…`
        );
        break;
      }
      case "pushTags":
        await this.runSyncOp("Pushing tags", false, async () => {
          await this.git.pushAllTags();
          this.pendingTagPushes.clear();
          this.pendingNotice = "Tags pushed to origin.";
        });
        break;
      case "addToGitignore": {
        const fp = String(message.filePath ?? "").trim();
        if (!fp) break;
        await this.runGit(async () => {
          await this.git.addToGitignore(fp);
          this.pendingNotice = `Added "${fp}" to .gitignore.`;
        });
        break;
      }
      case "undoLastCommit":
        await this.runBusyGit("git", "Undoing last commit…", async () => {
          await this.git.undoLastCommit();
          this.lastCommitSummary = "";
        }, "Last commit moved back to staged.");
        break;
      case "saveJiraConfig":
        await this.handleSaveJiraConfig(
          String(message.baseUrl ?? ""),
          String(message.email ?? ""),
          String(message.token ?? "")
        );
        break;
      case "fetchJiraIssues":
        await this.handleJiraFetch(String(message.query ?? ""));
        break;
      case "createBranchFromJira":
        await this.handleCreateBranchFromJira(String(message.key ?? ""), String(message.summary ?? ""));
        break;
      case "openJiraIssue": {
        const key = String(message.key ?? "");
        const { baseUrl } = this.jira.getConfig();
        if (key && baseUrl) {
          await vscode.env.openExternal(vscode.Uri.parse(`${baseUrl}/browse/${key}`));
        }
        break;
      }
      default:
        break;
    }
  }

  // ---- Git operations ----

  private async runGit(action: () => Promise<void>, kind = "", text = ""): Promise<void> {
    const startedAt = Date.now();
    if (kind || text) {
      this.setBusy(kind, text);
      await this.postState(true);
    }
    try {
      await action();
    } catch (error) {
      this.fail(error);
    } finally {
      if (kind || text) {
        await this.postState(true);
        await this.waitForMinimumElapsed(startedAt, MIN_STAGE_BUSY_VISIBLE_MS);
        this.clearBusy();
        await this.postState();
        return;
      }
    }
    await this.refresh();
  }

  private countFilesText(paths: unknown, verb: string): string {
    const count = Array.isArray(paths)
      ? paths.length
      : typeof paths === "number" && Number.isFinite(paths)
        ? paths
        : 0;
    if (count <= 1) {
      return `${verb} file...`;
    }
    return `${verb} ${count} files...`;
  }

  private async waitForMinimumElapsed(startedAt: number, minimumMs: number): Promise<void> {
    const remaining = minimumMs - (Date.now() - startedAt);
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }
  }

  private async runCommit(summary: string, description?: string): Promise<void> {
    if (!summary || !summary.trim()) {
      this.fail("Commit summary is required.");
      await this.postState();
      return;
    }
    const changes = await this.git.getChanges().catch(() => ({ staged: [], unstaged: [], conflicts: [] }));
    if (changes.conflicts.length > 0) {
      this.fail(`Resolve ${changes.conflicts.length} conflict${changes.conflicts.length === 1 ? "" : "s"} before committing.`);
      await this.postState();
      return;
    }
    try {
      await this.git.commit(summary.trim(), description?.trim());
      this.lastCommitSummary = summary.trim();
      this.pendingNotice = "Commit created.";
      vscode.window.showInformationMessage("Gitable: commit created.");
      this.view?.webview.postMessage({ type: "clearCommitFields" });
      this.view?.webview.postMessage({ type: "changesSubTab", tab: "working" });
    } catch (error) {
      this.fail(error);
    }
    await this.refresh();
  }

  private async runAmend(summary: string, description?: string): Promise<void> {
    if (!summary || !summary.trim()) {
      this.fail("Commit summary is required.");
      await this.postState();
      return;
    }
    try {
      await this.git.amend(summary.trim(), description?.trim());
      this.lastCommitSummary = summary.trim();
      this.pendingNotice = "Commit amended.";
      vscode.window.showInformationMessage("Gitable: commit amended.");
      this.view?.webview.postMessage({ type: "clearCommitFields" });
    } catch (error) {
      this.fail(error);
    }
    await this.refresh();
  }

  private async discardFiles(filePaths: unknown, staged: boolean): Promise<void> {
    const paths = Array.isArray(filePaths)
      ? filePaths.map((item) => String(item).trim()).filter(Boolean)
      : [];
    if (!paths.length) {
      return;
    }
    const label = paths.length === 1 ? paths[0] : `${paths.length} files`;
    const picked = await vscode.window.showWarningMessage(
      `Discard changes to ${label}?`,
      {
        modal: true,
        detail: "This permanently removes the selected local Git changes and cannot be undone."
      },
      "Discard"
    );
    if (picked !== "Discard") {
      await this.refresh();
      return;
    }
    await this.runBusyGit(
      "git",
      `Discarding ${paths.length === 1 ? "file" : "files"}…`,
      () => this.git.discardFiles(paths, staged),
      `Discarded changes to ${label}.`
    );
  }

  private async copyFilePath(filePath: string, relative: boolean): Promise<void> {
    const text = relative ? filePath : this.absolutePath(filePath);
    if (!text) {
      return;
    }
    await vscode.env.clipboard.writeText(text);
    this.pendingNotice = relative ? "Relative path copied." : "File path copied.";
    await this.postState();
  }

  private async revealFile(filePath: string): Promise<void> {
    const fullPath = this.absolutePath(filePath);
    if (!fullPath) {
      return;
    }
    let uri = vscode.Uri.file(fullPath);
    try {
      await vscode.workspace.fs.stat(uri);
    } catch {
      uri = vscode.Uri.file(path.dirname(fullPath));
    }
    await vscode.commands.executeCommand("revealFileInOS", uri);
  }

  private absolutePath(filePath: string): string | undefined {
    const root = this.git.getActiveRoot();
    const relativePath = String(filePath ?? "").trim();
    if (!root || !relativePath) {
      return undefined;
    }
    return path.join(root, relativePath);
  }

  /** Runs a slower git op (network/branch) with a busy indicator + notice. */
  private async runBusyGit(
    kind: string,
    text: string,
    action: () => Promise<void>,
    successMessage: string
  ): Promise<void> {
    this.setBusy(kind, text);
    await this.postState();
    try {
      await action();
      this.pendingNotice = successMessage;
      vscode.window.showInformationMessage(`Gitable: ${successMessage}`);
    } catch (error) {
      this.fail(error);
    } finally {
      this.clearBusy();
      await this.refresh();
    }
  }

  private async switchBranch(name: string): Promise<void> {
    const targetBranch = String(name ?? "").trim();
    if (!targetBranch) {
      return;
    }
    const summary = await this.git.getRepoSummary().catch(() => undefined);
    const currentBranch = summary?.branch ?? "";
    if (currentBranch === targetBranch) {
      return;
    }

    const changes = await this.git.getChanges().catch(() => ({ staged: [], unstaged: [] }));
    const hasLocalChanges = changes.staged.length > 0 || changes.unstaged.length > 0;
    const choice = hasLocalChanges
      ? await this.pickBranchSwitchChoice(currentBranch, targetBranch)
      : undefined;
    if (hasLocalChanges && !choice) {
      await this.refresh();
      return;
    }

    await this.runBranchSwitch(targetBranch, async () => {
      if (choice === "bring") {
        await this.git.checkoutBranchWithLocalChanges(targetBranch);
        return `Switched to ${targetBranch} with your changes.`;
      }
      if (choice === "keep" && currentBranch) {
        await this.git.checkoutBranchKeepingLocalChanges(currentBranch, targetBranch);
        return `Switched to ${targetBranch}. Changes stayed on ${currentBranch}.`;
      }

      await this.git.checkoutBranch(targetBranch);
      const restored = await this.git.restoreSavedBranchChanges(targetBranch);
      return restored
        ? `Switched to ${targetBranch} and restored saved changes.`
        : `Switched to ${targetBranch}.`;
    });
  }

  private async pickBranchSwitchChoice(
    currentBranch: string,
    targetBranch: string
  ): Promise<BranchSwitchChoice | undefined> {
    const bring = `Bring changes to ${targetBranch}`;
    const keep = currentBranch ? `Keep changes on ${currentBranch}` : "Keep changes on current branch";
    const picked = await vscode.window.showWarningMessage(
      `You have local changes. What should happen when switching to ${targetBranch}?`,
      {
        modal: true,
        detail: currentBranch
          ? `Bring your changes to ${targetBranch}, or save them for ${currentBranch} and switch with a clean working tree.`
          : `Bring your changes to ${targetBranch}, or save them for the current branch and switch with a clean working tree.`
      },
      bring,
      keep
    );
    if (picked === bring) {
      return "bring";
    }
    if (picked === keep) {
      return "keep";
    }
    return undefined;
  }

  private async runBranchSwitch(
    targetBranch: string,
    action: () => Promise<string>
  ): Promise<void> {
    this.setBusy("git", `Switching to ${targetBranch}…`);
    await this.postState();
    try {
      const successMessage = await action();
      this.pendingNotice = successMessage;
      vscode.window.showInformationMessage(`Gitable: ${successMessage}`);
    } catch (error) {
      this.fail(error);
    } finally {
      this.clearBusy();
      await this.refresh();
    }
  }

  private async createBranchNamed(name: string): Promise<void> {
    const branch = String(name).trim();
    if (!branch || /\s/.test(branch)) {
      this.fail("Invalid branch name (no spaces allowed).");
      await this.postState();
      return;
    }
    await this.runBusyGit(
      "git",
      `Creating ${branch}…`,
      () => this.git.createBranch(branch),
      `Created and switched to ${branch}.`
    );
  }

  private async createBranchFromInput(): Promise<void> {
    const name = await vscode.window.showInputBox({
      prompt: "New branch name",
      placeHolder: "feature/my-branch",
      validateInput: (v) => (v && /\s/.test(v) ? "Branch names cannot contain spaces." : undefined)
    });
    if (!name || !name.trim()) {
      return;
    }
    const branch = name.trim();
    await this.runBusyGit(
      "git",
      `Creating ${branch}…`,
      () => this.git.createBranch(branch),
      `Created and switched to ${branch}.`
    );
  }

  private async handleSummarizeCommit(hash: string, subject: string, maxChars?: number): Promise<void> {
    if (!hash || !this.view) return;
    const post = (payload: object) => this.view!.webview.postMessage(payload);
    try {
      const providerId = this.settings.getProvider() as ProviderId;
      const apiKey = await this.secrets.getApiKey(providerId);
      if (!apiKey) {
        post({ type: "commitSummary", hash, error: "No API key saved — go to Settings to add one." });
        return;
      }
      const model = this.settings.getModel(providerId);
      if (!model) {
        post({ type: "commitSummary", hash, error: "No model selected — go to Settings to pick one." });
        return;
      }
      const rawDiff = await this.git.getCommitDiff(hash);
      const { diff } = DiffLimiter.prepare(rawDiff, maxChars);
      const { system, user } = buildCommitSummaryPrompt(subject, diff);
      const provider = AiProviderFactory.create(providerId);
      const text = await provider.generate(system, user, model, apiKey);
      const result = parseGeneratedMessage(text);
      this.usage.record({ provider: providerId, model, type: "commitSummary" });
      post({ type: "commitSummary", hash, summary: result.summary, description: result.description });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to generate summary.";
      this.view?.webview.postMessage({ type: "commitSummary", hash, error: msg });
    }
  }

  private async handleSummarizeCommits(commits: SelectedCommit[], maxChars?: number): Promise<void> {
    if (!commits.length || !this.view) return;
    const label = this.selectedCommitLabel(commits);
    const post = (payload: object) => this.view!.webview.postMessage(payload);
    try {
      const providerId = this.settings.getProvider() as ProviderId;
      const apiKey = await this.secrets.getApiKey(providerId);
      if (!apiKey) {
        post({ type: "commitSummary", hash: label, error: "No API key saved — go to Settings to add one." });
        return;
      }
      const model = this.settings.getModel(providerId);
      if (!model) {
        post({ type: "commitSummary", hash: label, error: "No model selected — go to Settings to pick one." });
        return;
      }
      const prepared = await this.prepareSelectedCommitDiffs(commits, maxChars);
      if (!prepared.diff.trim()) {
        post({ type: "commitSummary", hash: label, error: "No reviewable diff found for the selected commits." });
        return;
      }
      const subject = this.selectedCommitSubject(commits);
      const { system, user } = buildCommitSummaryPrompt(subject, prepared.diff);
      const provider = AiProviderFactory.create(providerId);
      const text = await provider.generate(system, user, model, apiKey);
      const result = parseGeneratedMessage(text);
      this.usage.record({ provider: providerId, model, type: "commitSummary" });
      post({
        type: "commitSummary",
        hash: label,
        summary: result.summary,
        description: result.description,
        note: this.selectedDiffNote(prepared, commits.length)
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to generate summary.";
      post({ type: "commitSummary", hash: label, error: msg });
    }
  }

  private async handleSecurityReview(staged: boolean, maxChars?: number): Promise<void> {
    if (!this.view) return;
    const post = (payload: object) => this.view!.webview.postMessage(payload);
    try {
      const providerId = this.settings.getProvider() as ProviderId;
      const apiKey = await this.secrets.getApiKey(providerId);
      if (!apiKey) {
        post({ type: "securityReview", error: "No API key saved — go to Settings to add one." });
        return;
      }
      const model = this.settings.getModel(providerId);
      if (!model) {
        post({ type: "securityReview", error: "No model selected — go to Settings to pick one." });
        return;
      }
      const diff = staged ? await this.git.getStagedDiff() : await this.git.getUnstagedDiff();
      const diffStat = staged ? await this.git.getStagedDiffStat() : undefined;
      const { diff: limitedDiff } = DiffLimiter.prepare(diff, maxChars);
      const { system, user } = buildSecurityReviewPrompt(limitedDiff, diffStat);
      const provider = AiProviderFactory.create(providerId);
      const text = await provider.generate(system, user, model, apiKey);
      const review = parseSecurityReview(text);
      this.usage.record({ provider: providerId, model, type: "security" });
      post({ type: "securityReview", findings: review.findings, safe: review.safe });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to run security review.";
      this.view?.webview.postMessage({ type: "securityReview", error: msg });
    }
  }

  private async handleSecurityReviewCommits(commits: SelectedCommit[], maxChars?: number): Promise<void> {
    if (!commits.length || !this.view) return;
    const scope = this.selectedCommitLabel(commits);
    const post = (payload: object) => this.view!.webview.postMessage(payload);
    try {
      const providerId = this.settings.getProvider() as ProviderId;
      const apiKey = await this.secrets.getApiKey(providerId);
      if (!apiKey) {
        post({ type: "securityReview", scope, error: "No API key saved — go to Settings to add one." });
        return;
      }
      const model = this.settings.getModel(providerId);
      if (!model) {
        post({ type: "securityReview", scope, error: "No model selected — go to Settings to pick one." });
        return;
      }
      const prepared = await this.prepareSelectedCommitDiffs(commits, maxChars);
      if (!prepared.diff.trim()) {
        post({ type: "securityReview", scope, error: "No reviewable diff found for the selected commits." });
        return;
      }
      const { system, user } = buildSecurityReviewPrompt(prepared.diff, this.selectedCommitSubject(commits));
      const provider = AiProviderFactory.create(providerId);
      const text = await provider.generate(system, user, model, apiKey);
      const review = parseSecurityReview(text);
      this.usage.record({ provider: providerId, model, type: "security" });
      post({
        type: "securityReview",
        scope,
        findings: review.findings,
        safe: review.safe,
        note: this.selectedDiffNote(prepared, commits.length)
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to run security review.";
      post({ type: "securityReview", scope, error: msg });
    }
  }

  private parseSelectedCommits(value: unknown): SelectedCommit[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((item) => {
        const record = item as { hash?: unknown; subject?: unknown };
        return {
          hash: String(record.hash ?? "").trim(),
          subject: String(record.subject ?? "").trim()
        };
      })
      .filter((commit) => /^[a-f0-9]{7,40}$/i.test(commit.hash));
  }

  private async prepareSelectedCommitDiffs(commits: SelectedCommit[], maxChars?: number): Promise<{
    diff: string;
    includedCount: number;
    ignoredFiles: string[];
    safeSubset: boolean;
  }> {
    const chunks: string[] = [];
    let includedCount = 0;
    let safeSubset = false;
    let ignoredFiles: string[] = [];

    for (const commit of commits) {
      const rawDiff = await this.git.getCommitDiff(commit.hash);
      const heading = `# Commit ${commit.hash.slice(0, 7)}${commit.subject ? `: ${commit.subject}` : ""}`;
      const chunk = `${heading}\n${rawDiff}`;
      const candidate = DiffLimiter.prepare([...chunks, chunk].join("\n\n"), maxChars);

      if (candidate.truncated && chunks.length > 0) {
        safeSubset = true;
        break;
      }

      chunks.push(chunk);
      includedCount += 1;
      ignoredFiles = candidate.ignoredFiles;

      if (candidate.truncated) {
        safeSubset = true;
        break;
      }
    }

    const prepared = DiffLimiter.prepare(chunks.join("\n\n"), maxChars);
    return {
      diff: prepared.diff,
      includedCount,
      ignoredFiles: prepared.ignoredFiles.length ? prepared.ignoredFiles : ignoredFiles,
      safeSubset: safeSubset || includedCount < commits.length
    };
  }

  private selectedCommitLabel(commits: SelectedCommit[]): string {
    return commits.length === 1 ? commits[0].hash.slice(0, 7) : `${commits.length} commits`;
  }

  private selectedCommitSubject(commits: SelectedCommit[]): string {
    if (commits.length === 1) {
      return commits[0].subject;
    }
    const subjects = commits
      .map((commit) => `- ${commit.hash.slice(0, 7)} ${commit.subject}`.trim())
      .join("\n");
    return `Selected commits (${commits.length}):\n${subjects}`;
  }

  private selectedDiffNote(
    prepared: { includedCount: number; ignoredFiles: string[]; safeSubset: boolean },
    selectedCount: number
  ): string {
    const notes: string[] = [];
    if (prepared.safeSubset) {
      notes.push(`Diff too big; analyzed a safe subset (${prepared.includedCount} of ${selectedCount} selected commits).`);
    }
    if (prepared.ignoredFiles.length) {
      notes.push(`${prepared.ignoredFiles.length} generated/noisy file(s) ignored.`);
    }
    return notes.join(" ");
  }

  private async renameBranch(oldName: string): Promise<void> {
    if (!oldName) return;
    const newName = await vscode.window.showInputBox({
      prompt: "New branch name",
      value: oldName,
      validateInput: (v) =>
        !v || !v.trim() ? "Branch name cannot be empty." : /\s/.test(v) ? "Branch names cannot contain spaces." : undefined
    });
    if (!newName || newName.trim() === oldName) return;
    await this.runBusyGit(
      "git",
      `Renaming branch…`,
      () => this.git.renameBranch(oldName, newName.trim()),
      `Branch renamed to ${newName.trim()}.`
    );
  }

  private async deleteBranch(name: string): Promise<void> {
    if (!name) return;
    const answer = await vscode.window.showWarningMessage(
      `Delete branch "${name}"? This cannot be undone.`,
      { modal: true },
      "Delete"
    );
    if (answer !== "Delete") return;
    await this.runBusyGit(
      "git",
      `Deleting ${name}…`,
      () => this.git.deleteBranch(name),
      `Branch ${name} deleted.`
    );
  }

  private async mergeBranch(name: string): Promise<void> {
    if (!name) return;
    const summary = await this.git.getRepoSummary().catch(() => undefined);
    const current = summary?.branch ?? "current branch";
    this.setBusy("git", `Merging ${name}…`);
    await this.postState();
    try {
      await this.git.mergeBranch(name);
      this.pendingNotice = `Merged ${name} into ${current}.`;
      vscode.window.showInformationMessage(`Gitable: Merged ${name} into ${current}.`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("CONFLICT") || msg.includes("Automatic merge failed")) {
        this.pendingError = "Merge conflict — resolve conflicts, stage all files, and commit.";
      } else {
        this.fail(error);
      }
    } finally {
      this.clearBusy();
      await this.refresh();
    }
  }

  private async rebaseBranch(name: string): Promise<void> {
    if (!name) return;
    const summary = await this.git.getRepoSummary().catch(() => undefined);
    const current = summary?.branch ?? "current branch";
    const picked = await vscode.window.showWarningMessage(
      `Rebase ${current} onto ${name}?`,
      { modal: true, detail: "This rewrites commit history. The current branch's commits will be replayed on top of the target. Conflicts will need to be resolved one by one." },
      "Rebase"
    );
    if (!picked) return;
    this.setBusy("git", `Rebasing onto ${name}…`);
    await this.postState();
    try {
      await this.git.rebase(name);
      this.pendingNotice = `Rebased ${current} onto ${name}.`;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("CONFLICT") || msg.includes("conflict")) {
        this.pendingError = `Rebase paused — resolve conflicts, stage all files, then click Continue Rebase.`;
      } else {
        this.fail(error);
      }
    } finally {
      this.clearBusy();
      await this.refresh();
    }
  }

  private async rebaseContinue(): Promise<void> {
    this.setBusy("git", "Continuing rebase…");
    await this.postState();
    try {
      await this.git.rebaseContinue();
      const rebaseState = await this.git.getRebaseState();
      if (!rebaseState.inProgress) {
        this.pendingNotice = "Rebase completed.";
      } else {
        this.pendingError = "More conflicts to resolve — stage all files, then continue.";
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("CONFLICT") || msg.includes("conflict")) {
        this.pendingError = "More conflicts to resolve — stage all files, then continue.";
      } else {
        this.fail(error);
      }
    } finally {
      this.clearBusy();
      await this.refresh();
    }
  }

  private async rebaseAbort(): Promise<void> {
    const picked = await vscode.window.showWarningMessage(
      "Abort rebase?",
      { modal: true, detail: "This will stop the rebase and restore the branch to its state before the rebase started." },
      "Abort Rebase"
    );
    if (!picked) return;
    this.setBusy("git", "Aborting rebase…");
    await this.postState();
    try {
      await this.git.rebaseAbort();
      this.pendingNotice = "Rebase aborted. Branch restored.";
    } catch (error) {
      this.fail(error);
    } finally {
      this.clearBusy();
      await this.refresh();
    }
  }

  private async pushCurrentBranch(): Promise<void> {
    const summary = await this.git.getRepoSummary().catch(() => undefined);
    const branch = summary?.branch ?? "";
    if (!branch || branch === "(no branch)") {
      this.fail("Cannot push because no branch is checked out.");
      await this.postState();
      return;
    }

    const sync = await this.git.getSyncInfo().catch(() => ({ ahead: 0, behind: 0, hasUpstream: false }));
    if (!sync.hasUpstream) {
      await this.publishCurrentBranch(branch);
      return;
    }

    await this.runSyncOp("Pushing", true, async () => {
      try {
        await this.git.push();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/(rejected|non-fast-forward|fetch first)/i.test(msg)) {
          const choice = await vscode.window.showWarningMessage(
            `Push rejected — the remote has diverged (e.g. after a rebase). Force push with --force-with-lease?`,
            { modal: true },
            "Force Push"
          );
          if (choice !== "Force Push") {
            throw new Error("Push cancelled.");
          }
          await this.git.pushForce();
        } else {
          throw err;
        }
      }
      if (this.pendingTagPushes.size > 0) {
        await this.git.pushAllTags();
        this.pendingTagPushes.clear();
      }
      this.lastCommitSummary = "";
    });
  }

  private async publishCurrentBranch(branch: string): Promise<void> {
    const remote = await this.pickRemote(`Publish ${branch} to remote`);
    if (!remote) {
      return;
    }

    await this.runSyncOp(`Publishing to ${remote}`, true, async () => {
      await this.git.publishBranch(remote, branch);
      if (this.pendingTagPushes.size > 0) {
        await this.git.pushAllTags();
        this.pendingTagPushes.clear();
      }
      this.lastCommitSummary = "";
      this.pendingNotice = `Published ${branch} to ${remote} and set upstream.`;
    });
  }

  private async setUpstreamForBranch(branch: string): Promise<void> {
    const localBranch = branch.trim();
    if (!localBranch) {
      return;
    }

    const remote = await this.pickRemote(`Set upstream for ${localBranch}`);
    if (!remote) {
      return;
    }

    const remoteBranch = await vscode.window.showInputBox({
      prompt: `Remote branch on ${remote}`,
      value: localBranch,
      placeHolder: localBranch
    });
    if (!remoteBranch || !remoteBranch.trim()) {
      return;
    }

    await this.runSyncOp("Setting upstream", true, async () => {
      await this.git.setUpstream(remote, localBranch, remoteBranch.trim());
      this.pendingNotice = `Tracking set to ${remote}/${remoteBranch.trim()}.`;
    });
  }

  private async pickRemote(placeHolder: string): Promise<string | undefined> {
    const remotes = await this.git.getRemotes().catch((error) => {
      this.fail(error);
      return [];
    });
    if (!remotes.length) {
      this.fail("No Git remotes configured. Add a remote first, then publish the branch.");
      await this.postState();
      return undefined;
    }
    if (remotes.length === 1) {
      return remotes[0];
    }
    return vscode.window.showQuickPick(remotes, { placeHolder });
  }

  // ---- AI operations ----

  private async runGenerate(maxChars?: number): Promise<void> {
    const provider = this.settings.getProvider();
    const apiKey = await this.secrets.getApiKey(provider);
    if (!apiKey) {
      this.fail(`No API key set for ${provider}. Open Settings to add one.`);
      await this.focusAndOpenTab("settings");
      await this.postState();
      return;
    }

    const model = this.settings.getModel(provider);
    if (!model) {
      this.fail("Select a model in Settings before generating a commit message.");
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
    const prepared = DiffLimiter.prepare(stagedDiff, maxChars);
    if (!prepared.diff.trim()) {
      this.fail("All staged changes were filtered out as generated/noisy files.");
      await this.postState();
      return;
    }

    this.setBusy("generate", "Generating commit message…");
    await this.postState();
    try {
      const ai = AiProviderFactory.create(provider);
      const result = await ai.generateCommitMessage(
        { diff: prepared.diff, diffStat, provider, model },
        apiKey
      );
      this.usage.record({ provider, model, type: "commitMessage" });
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
      this.clearBusy();
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
    this.setBusy("validate", "Validating API key…");
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
      this.clearBusy();
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
    this.setBusy("models", "Loading models…");
    await this.postState();
    try {
      const ai = AiProviderFactory.create(provider);
      const models = await ai.listModels(apiKey);
      this.modelsCache[provider] = models;
      this.pendingNotice = models.length
        ? `Loaded ${models.length} model(s).`
        : "No models returned for this key.";
    } catch (error) {
      this.fail(error);
    } finally {
      this.clearBusy();
      await this.postState();
    }
  }

  // ---- Jira operations ----

  private async handleSaveJiraConfig(baseUrl: string, email: string, token: string): Promise<void> {
    if (!baseUrl.trim() || !email.trim() || !token.trim()) {
      this.view?.webview.postMessage({ type: "jiraStatus", error: "Base URL, email, and API token are all required." });
      return;
    }
    this.view?.webview.postMessage({ type: "jiraStatus", loading: true });
    try {
      await this.jira.saveConfig(baseUrl, email);
      await this.jira.saveToken(token);
      await this.jira.validate();
      this.view?.webview.postMessage({ type: "jiraStatus", ok: true });
      await this.postState();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.view?.webview.postMessage({ type: "jiraStatus", error: msg });
    }
  }

  private async handleJiraFetch(query = ""): Promise<void> {
    try {
      const issues = await this.jira.getMyIssues(query);
      this.view?.webview.postMessage({ type: "jiraIssues", issues });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.view?.webview.postMessage({ type: "jiraIssues", error: msg });
    }
  }

  private async handleCreateBranchFromJira(key: string, summary: string): Promise<void> {
    if (!key) return;
    const slug = summary
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
    const suggested = slug ? `${key.toLowerCase()}-${slug}` : key.toLowerCase();
    const name = await vscode.window.showInputBox({
      title: `Create branch for ${key}`,
      value: suggested,
      prompt: "Edit the branch name if needed",
      validateInput: (v) => {
        const t = v.trim();
        if (!t) return "Branch name cannot be empty.";
        if (/\s/.test(t)) return "Branch name cannot contain spaces.";
        return null;
      }
    });
    if (!name) return;
    await this.createBranchNamed(name.trim());
  }

  /**
   * On first load, if the (persisted, SecretStorage) key exists for the current
   * provider, fetch its models so the dropdown is ready without re-entering the
   * key after a restart.
   */
  private async preloadModels(): Promise<void> {
    if (this.modelsPreloaded) {
      return;
    }
    this.modelsPreloaded = true;
    const provider = this.settings.getProvider();
    if (this.modelsCache[provider]) {
      return;
    }
    const apiKey = await this.secrets.getApiKey(provider);
    if (!apiKey) {
      return;
    }
    await this.cacheModels(provider, apiKey);
    await this.postState();
  }

  /** Opens a changed file in VS Code's native diff editor. */
  private async openFileDiff(filePath: string, staged: boolean, status: string): Promise<void> {
    try {
      await this.git.openDiff(filePath, staged, status);
    } catch (error) {
      this.fail(error);
      await this.postState();
    }
  }

  /** Sends the files changed by a commit back to the webview (for expansion). */
  private async sendCommitFiles(hash: string): Promise<void> {
    if (!hash || !this.view) {
      return;
    }
    try {
      const [files, stat] = await Promise.all([
        this.git.getCommitFiles(hash),
        this.git.getCommitStat(hash)
      ]);
      this.view.webview.postMessage({ type: "commitFiles", hash, files, stat });
    } catch (error) {
      this.logger.error("Failed to read commit files", error);
      this.view.webview.postMessage({ type: "commitFiles", hash, files: [], stat: null });
    }
  }

  /** Opens a single file's diff for a specific commit. */
  private async openCommitFile(hash: string, filePath: string, status: string): Promise<void> {
    try {
      await this.git.openCommitDiff(hash, filePath, status);
    } catch (error) {
      this.fail(error);
      await this.postState();
    }
  }

  /** Best-effort model fetch; failures fall back silently. */
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

  private setBusy(kind: string, text: string): void {
    this.busyKind = kind;
    this.busyText = text;
  }
  private clearBusy(): void {
    this.busyKind = "";
    this.busyText = "";
  }

  private async pullWithLocalChangesCheck(): Promise<void> {
    const changes = await this.git.getChanges().catch(() => ({ staged: [], unstaged: [], conflicts: [] } as RepoChanges));
    const hasLocalChanges = changes.staged.length > 0 || changes.unstaged.length > 0;

    if (!hasLocalChanges) {
      await this.runSyncOp("Pulling", true, () => this.git.pull());
      return;
    }

    const picked = await vscode.window.showWarningMessage(
      "You have local changes.",
      {
        modal: true,
        detail: "Stash your changes, pull from origin, then restore them? Conflicts will be shown if any arise.",
      },
      "Stash, pull & restore"
    );
    if (!picked) return;

    await this.runSyncOp("Pulling", true, async () => {
      await this.git.stashAll();
      try {
        await this.git.pull();
      } catch (err) {
        // Pull failed — restore changes so nothing is lost
        await this.git.stashPop("stash@{0}").catch(() => {});
        throw err;
      }
      try {
        await this.git.stashPop("stash@{0}");
      } catch {
        // Pop produced conflicts — refresh will surface them in the Conflicts section
        this.pendingError = "Conflicts detected after restoring your stashed changes. Resolve them before committing.";
      }
    });
  }

  /** Runs a sync operation (fetch/pull/push), showing state in the sync button.
   *  When `globalBusy` is true, also sets the general busy flag to disable commit UI. */
  private async runSyncOp(label: string, globalBusy: boolean, op: () => Promise<void>): Promise<void> {
    this.syncAction = label;
    if (globalBusy) this.setBusy("git", label);
    await this.postState();
    try {
      await op();
    } catch (error) {
      this.fail(error);
    } finally {
      this.syncAction = "";
      if (globalBusy) this.clearBusy();
      await this.postState();
    }
  }

  /** Fetches from origin silently when the panel becomes visible, then refreshes state. */
  private async silentFetchAndRefresh(): Promise<void> {
    this.syncAction = "Refreshing repository";
    await this.postState();
    try {
      await this.git.fetchOrigin();
      this.lastFetchedAt = Date.now();
    } catch {
      // no remote, no network — ignore silently
    } finally {
      this.syncAction = "";
      await this.postState();
    }
  }

  private fail(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.pendingError = message;
    this.logger.error("Operation failed", error);
    vscode.window.showErrorMessage(`Gitable: ${message}`);
  }

  private async postState(waitForRender = false): Promise<void> {
    if (!this.view) {
      return;
    }
    const data = await this.buildState();
    const renderId = waitForRender ? ++this.stateRenderSeq : undefined;
    const rendered = renderId ? this.waitForStateRender(renderId) : undefined;
    const delivered = await this.view.webview.postMessage({ type: "state", data, renderId });
    const changes = data.changes as { staged: unknown[]; unstaged: unknown[] } | undefined;
    const count = (changes?.staged?.length ?? 0) + (changes?.unstaged?.length ?? 0);
    this.view.badge = count > 0 ? { value: count, tooltip: `${count} file${count === 1 ? "" : "s"} changed` } : undefined;
    this.pendingError = "";
    this.pendingNotice = "";
    if (rendered && delivered) {
      await rendered;
    }
  }

  private async waitForStateRender(renderId: number): Promise<void> {
    await Promise.race([
      new Promise<void>((resolve) => this.pendingStateRenders.set(renderId, resolve)),
      new Promise<void>((resolve) => setTimeout(resolve, 750))
    ]);
    this.pendingStateRenders.delete(renderId);
  }

  private async buildState(): Promise<Record<string, unknown>> {
    const provider = this.settings.getProvider();
    const model = this.settings.getModel(provider);
    const hasApiKey = await this.secrets.hasApiKey(provider);
    const jiraConfig = this.jira.getConfig();
    const jiraHasToken = await this.jira.hasToken();

    let repositories: Array<{ name: string; root: string }> = [];
    let repositoryName = "No repository";
    let branchName = "";
    let changes: RepoChanges = { staged: [], unstaged: [], conflicts: [] };
    let history: unknown[] = [];
    let branches: string[] = [];
    let stashes: StashEntry[] = [];
    let ahead = 0;
    let behind = 0;
    let hasUpstream = false;
    let rebaseState: RebaseState = { inProgress: false };
    let lastCommit: { summary: string; description: string } | null = null;
    let stateError = this.pendingError;

    try {
      repositories = await this.git.listRepositories();
      const summary = await this.git.getRepoSummary();
      if (summary) {
        repositoryName = summary.name;
        branchName = summary.branch;
        changes = await this.git.getChanges();
        history = await this.git.getHistory(HISTORY_LIMIT);
        branches = await this.git.getBranches();
        stashes = await this.git.stashList();
        const sync = await this.git.getSyncInfo();
        ahead = sync.ahead;
        behind = sync.behind;
        hasUpstream = sync.hasUpstream;
        rebaseState = await this.git.getRebaseState();
        lastCommit = await this.git.getLastCommitMessage();
      }
    } catch (error) {
      if (!stateError) {
        stateError = error instanceof Error ? error.message : String(error);
      }
      this.logger.error("Failed to read Git state", error);
    }

    // Models are never hardcoded — only what the provider's API returned.
    const models = this.modelsCache[provider] ?? [];

    return {
      repositoryName,
      branchName,
      activeRoot: this.git.getActiveRoot(),
      repositories,
      changes,
      stashes,
      history,
      provider,
      model,
      models,
      hasApiKey,
      providerIcons: this.providerIcons(),
      branches,
      ahead,
      behind,
      hasUpstream,
      syncAction: this.syncAction,
      lastFetchedAt: this.lastFetchedAt,
      pendingTagCount: this.pendingTagPushes.size,
      canUndoCommit: !!this.lastCommitSummary,
      lastCommitSummary: this.lastCommitSummary,
      lastCommit,
      busyKind: this.busyKind,
      busyText: this.busyText,
      isLoading: !!this.busyKind,
      hasConflicts: changes.conflicts.length > 0,
      rebaseState,
      jiraConfig,
      jiraHasToken,
      error: stateError,
      notice: this.pendingNotice
    };
  }

  /** Webview-safe URIs for the provider brand icons (computed once). */
  private providerIcons(): Record<string, string> {
    if (!this.view) {
      return {};
    }
    const webview = this.view.webview;
    const uri = (file: string) =>
      webview
        .asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", "providers", file))
        .toString();
    return { openai: uri("openai.svg"), gemini: uri("gemini.svg"), claude: uri("claude.svg") };
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
