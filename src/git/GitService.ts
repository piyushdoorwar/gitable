import { CommitInfo, CommitStat, RepoChanges, RepoSummary, StashEntry, SyncInfo } from "./models";

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
  discardFiles(paths: string[], staged?: boolean): Promise<void>;

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

  /** Switches branches by stashing, checking out, then applying local changes on the target. */
  checkoutBranchWithLocalChanges(name: string): Promise<void>;

  /** Saves local changes for the source branch, then switches to the target branch. */
  checkoutBranchKeepingLocalChanges(sourceBranch: string, targetBranch: string): Promise<void>;

  /** Restores local changes previously saved for the named branch. */
  restoreSavedBranchChanges(branch: string): Promise<boolean>;

  /** Pushes the current branch to its remote. */
  push(): Promise<void>;

  /** Local remote names such as origin/upstream. */
  getRemotes(): Promise<string[]>;

  /** Pushes the local branch to the chosen remote and sets upstream tracking. */
  publishBranch(remote: string, branch: string): Promise<void>;

  /** Sets upstream tracking for a local branch to remote/remoteBranch. */
  setUpstream(remote: string, localBranch: string, remoteBranch: string): Promise<void>;

  /** Pulls the current branch from its remote. */
  pull(): Promise<void>;

  /** Fetches from origin without merging. */
  fetchOrigin(): Promise<void>;

  /** Creates a revert commit that undoes the changes introduced by the given commit. */
  revertCommit(hash: string): Promise<void>;

  /** Applies the changes from the given commit onto the current branch. */
  cherryPickCommit(hash: string): Promise<void>;

  /** Files-changed / insertion / deletion counts for a single commit. */
  getCommitStat(hash: string): Promise<CommitStat>;

  /** Renames a local branch. */
  renameBranch(oldName: string, newName: string): Promise<void>;

  /** Deletes a local branch (safe delete — fails if unmerged). */
  deleteBranch(name: string): Promise<void>;

  /** Merges the given branch into the currently checked-out branch. */
  mergeBranch(name: string): Promise<void>;

  /** Opens the conflicted file in VS Code's 3-way merge editor (falls back to plain open). */
  openMergeEditor(filePath: string): Promise<void>;

  /** Full unified diff of a single commit (vs its parent). */
  getCommitDiff(hash: string): Promise<string>;

  /** Stashes only the currently staged files (git stash push --staged). */
  stashStaged(): Promise<void>;

  /** Stashes all local changes including untracked files. */
  stashAll(): Promise<void>;

  /** Returns all stash entries, newest first. Empty array when there are none. */
  stashList(): Promise<StashEntry[]>;

  /** Applies the stash and removes it from the stash list (pop). */
  stashPop(ref: string): Promise<void>;

  /** Applies the stash without removing it. */
  stashApply(ref: string): Promise<void>;

  /** Removes the stash without applying it. */
  stashDrop(ref: string): Promise<void>;

  /** Creates a lightweight tag at the given commit hash. */
  createTag(name: string, hash: string): Promise<void>;

  /** Deletes a local tag. */
  deleteTag(name: string): Promise<void>;

  /** Pushes a single tag to origin. */
  pushTag(name: string): Promise<void>;

  /** Deletes a tag from origin (remote ref delete). */
  deleteTagFromOrigin(name: string): Promise<void>;

  /** Pushes all local tags to origin. */
  pushAllTags(): Promise<void>;

  /** Appends filePath to the repo-root .gitignore (creates the file if absent). */
  addToGitignore(filePath: string): Promise<void>;

  /** Soft-resets HEAD~1, putting the last commit's changes back into the index. */
  undoLastCommit(): Promise<void>;
}
