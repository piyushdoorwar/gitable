import { CommitInfo, RepoChanges, RepoSummary, SyncInfo } from "./models";

/**
 * Error raised by Git operations. Carries a user-friendly message that can be
 * shown directly in the webview or a notification.
 */
export class GitServiceError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "GitServiceError";
  }
}

/**
 * Contract for reading and mutating Git state. Implemented by
 * {@link VsCodeGitService} (primary, prefers the built-in Git API) and
 * {@link GitCliService} (fallback, shells out via `git`).
 */
export interface GitService {
  /** Returns all open repositories. */
  listRepositories(): Promise<RepoSummary[]>;

  /** Returns the absolute root path of the active repository, if any. */
  getActiveRoot(): string | undefined;

  /** Chooses which repository subsequent operations act on. */
  setActiveRoot(root: string): void;

  /** High-level summary (name + branch) for the active repository. */
  getRepoSummary(): Promise<RepoSummary | undefined>;

  /** Staged and unstaged file changes for the active repository. */
  getChanges(): Promise<RepoChanges>;

  /** Unified diff of staged (index) changes. */
  getStagedDiff(): Promise<string>;

  /** Unified diff of unstaged (working tree) changes. */
  getUnstagedDiff(): Promise<string>;

  /** `git diff --staged --stat` summary. */
  getStagedDiffStat(): Promise<string>;

  stageFiles(paths: string[]): Promise<void>;
  unstageFiles(paths: string[]): Promise<void>;
  stageAll(): Promise<void>;
  unstageAll(): Promise<void>;

  /** Creates a commit from a summary and optional description. */
  commit(summary: string, description?: string): Promise<void>;

  /** Recent commits on the current branch. */
  getHistory(limit: number): Promise<CommitInfo[]>;

  /** Local branch names for the active repository. */
  getBranches(): Promise<string[]>;

  /** Ahead/behind counts relative to the upstream of the current branch. */
  getSyncInfo(): Promise<SyncInfo>;

  /** Creates a new branch and checks it out. */
  createBranch(name: string): Promise<void>;

  /** Switches to an existing branch. */
  checkoutBranch(name: string): Promise<void>;

  /** Pushes the current branch to its remote. */
  push(): Promise<void>;

  /** Pulls the current branch from its remote. */
  pull(): Promise<void>;
}
