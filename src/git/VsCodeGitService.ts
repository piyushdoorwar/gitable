import * as path from "path";
import * as vscode from "vscode";
import { Logger } from "../utils/Logger";
import { GitCliService } from "./GitCliService";
import { GitService, GitServiceError } from "./GitService";
import { CommitInfo, FileChange, RepoChanges, RepoSummary, vscodeStatusToLetter } from "./models";

// ---- Minimal typings for the built-in `vscode.git` extension API ----
// We only declare the members Gitable uses, to avoid depending on the full
// (unpublished) git.d.ts. Field names/values match the documented public API.
interface GitApiChange {
  uri: vscode.Uri;
  originalUri: vscode.Uri;
  renameUri?: vscode.Uri;
  status: number;
}
interface GitApiRepositoryState {
  HEAD?: { name?: string };
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
}
interface GitApi {
  repositories: GitApiRepository[];
  onDidOpenRepository: vscode.Event<GitApiRepository>;
  onDidCloseRepository: vscode.Event<GitApiRepository>;
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

  async stageFiles(paths: string[]): Promise<void> {
    const repo = this.getActiveRepository();
    if (!repo) {
      return this.cli.stageFiles(paths);
    }
    const uris = paths.map((rel) => vscode.Uri.file(path.join(repo.rootUri.fsPath, rel)));
    await repo.add(uris);
  }

  unstageFiles(paths: string[]): Promise<void> {
    // The stable Git API has no reliable "unstage"; use the CLI (`git reset HEAD`).
    return this.cli.unstageFiles(paths);
  }

  stageAll(): Promise<void> {
    return this.cli.stageAll();
  }

  unstageAll(): Promise<void> {
    return this.cli.unstageAll();
  }

  async commit(summary: string, description?: string): Promise<void> {
    const message = description && description.trim() ? `${summary}\n\n${description}` : summary;
    const repo = this.getActiveRepository();
    if (!repo) {
      return this.cli.commit(summary, description);
    }
    try {
      await repo.commit(message);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new GitServiceError(detail || "Commit failed.", error);
    }
  }

  getHistory(limit: number): Promise<CommitInfo[]> {
    return this.cli.getHistory(limit);
  }

  // ---- internals ----

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
