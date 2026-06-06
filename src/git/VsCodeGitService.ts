import * as path from "path";
import * as vscode from "vscode";
import { Logger } from "../utils/Logger";
import { GitCliService } from "./GitCliService";
import { GitService } from "./GitService";
import { CommitInfo, FileChange, RepoChanges, RepoSummary, SyncInfo, vscodeStatusToLetter } from "./models";

// ---- Minimal typings for the built-in `vscode.git` extension API ----
// We only declare the members Gitable uses, to avoid depending on the full
// (unpublished) git.d.ts. Field names/values match the documented public API.
interface GitApiChange {
  uri: vscode.Uri;
  originalUri: vscode.Uri;
  renameUri?: vscode.Uri;
  status: number;
}
interface GitApiRef {
  name?: string;
  type: number; // 0 = local head, 1 = remote head, 2 = tag
}
interface GitApiRepositoryState {
  HEAD?: { name?: string; ahead?: number; behind?: number; upstream?: { name?: string } };
  refs: GitApiRef[];
  indexChanges: GitApiChange[];
  workingTreeChanges: GitApiChange[];
  mergeChanges: GitApiChange[];
  onDidChange: vscode.Event<void>;
}
interface GitApiRepository {
  rootUri: vscode.Uri;
  state: GitApiRepositoryState;
  add(resources: vscode.Uri[]): Promise<void>;
  commit(message: string, opts?: { all?: boolean }): Promise<void>;
  push(): Promise<void>;
  pull(): Promise<void>;
  checkout(treeish: string): Promise<void>;
  createBranch(name: string, checkout: boolean): Promise<void>;
}
interface GitApi {
  repositories: GitApiRepository[];
  onDidOpenRepository: vscode.Event<GitApiRepository>;
  onDidCloseRepository: vscode.Event<GitApiRepository>;
  toGitUri?(uri: vscode.Uri, ref: string): vscode.Uri;
}
interface GitExtensionExports {
  enabled: boolean;
  getAPI(version: 1): GitApi;
}

/**
 * Primary GitService. Prefers the built-in VS Code Git extension API for reading
 * repository state, staging, committing, and change notifications. Operations the
 * stable API does not expose cleanly (diffs, `--stat`, unstaging, history) are
 * delegated to an injected {@link GitCliService}.
 *
 * If the Git API is unavailable, every method transparently falls back to the CLI.
 */
export class VsCodeGitService implements GitService {
  private api: GitApi | undefined;
  private activeRoot: string | undefined;

  constructor(private readonly cli: GitCliService, private readonly logger: Logger) {}

  /** Activates and captures the built-in Git API. Safe to call once at startup. */
  async initialize(): Promise<void> {
    try {
      const ext = vscode.extensions.getExtension<GitExtensionExports>("vscode.git");
      if (!ext) {
        this.logger.warn("Built-in Git extension not found; using CLI fallback.");
        return;
      }
      const exports = ext.isActive ? ext.exports : await ext.activate();
      if (exports?.enabled) {
        this.api = exports.getAPI(1);
      }
    } catch (error) {
      this.logger.error("Failed to acquire Git API; using CLI fallback.", error);
    }
    this.ensureActiveRoot();
  }

  getActiveRoot(): string | undefined {
    return this.activeRoot;
  }

  setActiveRoot(root: string): void {
    this.activeRoot = root;
    this.cli.setActiveRoot(root);
  }

  /** Subscribes to repository open/close and per-repo state changes. */
  registerChangeListener(callback: () => void): vscode.Disposable {
    if (!this.api) {
      return new vscode.Disposable(() => undefined);
    }
    const disposables: vscode.Disposable[] = [];
    const subscribeRepo = (repo: GitApiRepository) => {
      disposables.push(repo.state.onDidChange(() => callback()));
    };
    this.api.repositories.forEach(subscribeRepo);
    disposables.push(
      this.api.onDidOpenRepository((repo) => {
        subscribeRepo(repo);
        callback();
      })
    );
    disposables.push(this.api.onDidCloseRepository(() => callback()));
    return new vscode.Disposable(() => disposables.forEach((d) => d.dispose()));
  }

  async listRepositories(): Promise<RepoSummary[]> {
    if (!this.api) {
      return this.cli.listRepositories();
    }
    return this.api.repositories.map((repo) => ({
      name: path.basename(repo.rootUri.fsPath),
      root: repo.rootUri.fsPath,
      branch: repo.state.HEAD?.name ?? "(no branch)"
    }));
  }

  async getRepoSummary(): Promise<RepoSummary | undefined> {
    this.ensureActiveRoot();
    const repo = this.getActiveRepository();
    if (!repo) {
      return this.activeRoot ? this.cli.getRepoSummary() : undefined;
    }
    return {
      name: path.basename(repo.rootUri.fsPath),
      root: repo.rootUri.fsPath,
      branch: repo.state.HEAD?.name ?? "(no branch)"
    };
  }

  async getChanges(): Promise<RepoChanges> {
    const repo = this.getActiveRepository();
    if (!repo) {
      return this.cli.getChanges();
    }
    const root = repo.rootUri.fsPath;
    const staged = repo.state.indexChanges.map((change) => this.toFileChange(change, root, true));
    const unstaged = repo.state.workingTreeChanges.map((change) => this.toFileChange(change, root, false));
    return { staged, unstaged };
  }

  getStagedDiff(): Promise<string> {
    return this.cli.getStagedDiff();
  }

  getUnstagedDiff(): Promise<string> {
    return this.cli.getUnstagedDiff();
  }

  getStagedDiffStat(): Promise<string> {
    return this.cli.getStagedDiffStat();
  }

  stageFiles(paths: string[]): Promise<void> {
    // The built-in Git extension's command execution can fail ("Failed to
    // execute git") even while its state monitoring works, so local mutations
    // go straight through our own CLI, which is reliable and gives clear errors.
    this.syncCliRoot();
    return this.cli.stageFiles(paths);
  }

  unstageFiles(paths: string[]): Promise<void> {
    this.syncCliRoot();
    return this.cli.unstageFiles(paths);
  }

  stageAll(): Promise<void> {
    this.syncCliRoot();
    return this.cli.stageAll();
  }

  unstageAll(): Promise<void> {
    this.syncCliRoot();
    return this.cli.unstageAll();
  }

  discardFiles(paths: string[], staged = false): Promise<void> {
    this.syncCliRoot();
    return this.cli.discardFiles(paths, staged);
  }

  commit(summary: string, description?: string): Promise<void> {
    this.syncCliRoot();
    return this.cli.commit(summary, description);
  }

  getHistory(limit: number): Promise<CommitInfo[]> {
    return this.cli.getHistory(limit);
  }

  /**
   * Opens the file's changes in VS Code's native diff editor (like the built-in
   * Git view): index↔working-tree for unstaged, HEAD↔index for staged.
   */
  async openDiff(filePath: string, staged: boolean, status: string): Promise<void> {
    const repo = this.getActiveRepository();
    const root = repo ? repo.rootUri.fsPath : this.getActiveRoot();
    if (!root) {
      return;
    }
    const fileUri = vscode.Uri.file(path.join(root, filePath));
    const name = path.basename(filePath);
    const api = this.api;
    const toGit =
      api && typeof api.toGitUri === "function"
        ? (ref: string) => api.toGitUri!(fileUri, ref)
        : undefined;

    // Untracked, or no git URI helper available -> just open the file.
    if (status === "U" || !toGit) {
      await vscode.commands.executeCommand("vscode.open", fileUri);
      return;
    }
    // Deleted -> show the previous version read-only.
    if (status === "D") {
      await vscode.commands.executeCommand("vscode.open", toGit(staged ? "HEAD" : "~"));
      return;
    }
    if (staged) {
      await vscode.commands.executeCommand("vscode.diff", toGit("HEAD"), toGit("~"), `${name} (Staged)`);
    } else {
      await vscode.commands.executeCommand("vscode.diff", toGit("~"), fileUri, `${name} (Working Tree)`);
    }
  }

  async getBranches(): Promise<string[]> {
    this.syncCliRoot();
    try {
      return await this.cli.getBranches();
    } catch (error) {
      this.logger.warn(`Git CLI branch list failed; using Git API refs: ${(error as Error).message}`);
    }
    const repo = this.getActiveRepository();
    return (repo?.state.refs ?? [])
      .filter((ref) => ref.type === 0 && !!ref.name)
      .map((ref) => ref.name as string);
  }

  async getSyncInfo(): Promise<SyncInfo> {
    const repo = this.getActiveRepository();
    if (!repo) {
      return this.cli.getSyncInfo();
    }
    const head = repo.state.HEAD;
    return {
      ahead: head?.ahead ?? 0,
      behind: head?.behind ?? 0,
      hasUpstream: !!head?.upstream
    };
  }

  createBranch(name: string): Promise<void> {
    const repo = this.getActiveRepository();
    return this.apiOrCli(
      repo ? () => repo.createBranch(name, true) : undefined,
      () => this.cli.createBranch(name)
    );
  }

  checkoutBranch(name: string): Promise<void> {
    const repo = this.getActiveRepository();
    return this.apiOrCli(repo ? () => repo.checkout(name) : undefined, () =>
      this.cli.checkoutBranch(name)
    );
  }

  checkoutBranchWithLocalChanges(name: string): Promise<void> {
    this.syncCliRoot();
    return this.cli.checkoutBranchWithLocalChanges(name);
  }

  checkoutBranchKeepingLocalChanges(sourceBranch: string, targetBranch: string): Promise<void> {
    this.syncCliRoot();
    return this.cli.checkoutBranchKeepingLocalChanges(sourceBranch, targetBranch);
  }

  restoreSavedBranchChanges(branch: string): Promise<boolean> {
    this.syncCliRoot();
    return this.cli.restoreSavedBranchChanges(branch);
  }

  push(): Promise<void> {
    const repo = this.getActiveRepository();
    return this.apiOrCli(repo ? () => repo.push() : undefined, () => this.cli.push());
  }

  pull(): Promise<void> {
    const repo = this.getActiveRepository();
    return this.apiOrCli(repo ? () => repo.pull() : undefined, () => this.cli.pull());
  }

  // ---- internals ----

  /**
   * Prefers the Git API (it integrates credentials/UI for push/pull) but falls
   * back to our CLI when the API call fails — the built-in extension's command
   * execution is unreliable on some setups.
   */
  private async apiOrCli(
    apiAction: (() => Promise<void>) | undefined,
    cliAction: () => Promise<void>
  ): Promise<void> {
    this.syncCliRoot();
    if (apiAction) {
      try {
        await apiAction();
        return;
      } catch (error) {
        this.logger.warn(`Git API op failed; falling back to CLI: ${(error as Error).message}`);
      }
    }
    await cliAction();
  }

  /** Keeps the CLI service pointed at the same repository as the API. */
  private syncCliRoot(): void {
    this.ensureActiveRoot();
    if (this.activeRoot) {
      this.cli.setActiveRoot(this.activeRoot);
    }
  }

  private toFileChange(change: GitApiChange, root: string, staged: boolean): FileChange {
    const target = change.renameUri ?? change.uri;
    const relativePath = path.relative(root, target.fsPath).split(path.sep).join("/");
    const original = change.renameUri
      ? path.relative(root, change.originalUri.fsPath).split(path.sep).join("/")
      : undefined;
    return {
      path: relativePath,
      displayPath: relativePath,
      status: vscodeStatusToLetter(change.status),
      staged,
      originalPath: original
    };
  }

  private getActiveRepository(): GitApiRepository | undefined {
    if (!this.api || this.api.repositories.length === 0) {
      return undefined;
    }
    this.ensureActiveRoot();
    return (
      this.api.repositories.find((repo) => repo.rootUri.fsPath === this.activeRoot) ??
      this.api.repositories[0]
    );
  }

  /** Picks a sensible default repository the first time one is needed. */
  private ensureActiveRoot(): void {
    if (this.activeRoot) {
      return;
    }
    const first = this.api?.repositories[0];
    if (first) {
      this.setActiveRoot(first.rootUri.fsPath);
    }
  }
}
