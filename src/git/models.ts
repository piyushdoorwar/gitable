/** Single-letter Git status used across the UI. X = merge conflict. */
export type FileStatusLetter = "A" | "M" | "D" | "R" | "C" | "U" | "X";

export interface FileChange {
  /** Path relative to the repository root, with forward slashes. */
  path: string;
  /** Friendlier label shown in the UI (currently same as path). */
  displayPath: string;
  status: FileStatusLetter;
  staged: boolean;
  /** Original path for renames/copies. */
  originalPath?: string;
  /** Kind of merge conflict (only set on entries in {@link RepoChanges.conflicts}). */
  conflict?: ConflictKind;
}

/**
 * The porcelain XY code of an unmerged path, named. "Us"/"them" are git's own
 * stage-2/stage-3 sides — during a rebase or a stash restore they are swapped
 * relative to what the user thinks of as "mine", which the provider accounts for.
 */
export type ConflictKind =
  | "both-modified"   // UU
  | "both-added"      // AA
  | "both-deleted"    // DD
  | "added-by-us"     // AU
  | "added-by-them"   // UA
  | "deleted-by-us"   // DU
  | "deleted-by-them"; // UD

/** Maps a porcelain XY pair to a conflict kind, or undefined if the path is not unmerged. */
export function conflictKindFromXY(x: string, y: string): ConflictKind | undefined {
  switch (x + y) {
    case "UU": return "both-modified";
    case "AA": return "both-added";
    case "DD": return "both-deleted";
    case "AU": return "added-by-us";
    case "UA": return "added-by-them";
    case "DU": return "deleted-by-us";
    case "UD": return "deleted-by-them";
    default: return undefined;
  }
}

export interface RepoChanges {
  staged: FileChange[];
  unstaged: FileChange[];
  /** Files with unresolved merge conflicts (XY codes containing U, AA, DD). */
  conflicts: FileChange[];
}

export interface CommitInfo {
  hash: string;
  author: string;
  relativeDate: string;
  subject: string;
  tags: string[];
  /** True when this commit is reachable from HEAD but not from any remote ref —
   *  i.e. it still lives only in your local repository and has not been pushed. */
  unpushed: boolean;
}

export interface RepoSummary {
  name: string;
  root: string;
  branch: string;
}

export interface CommitStat {
  files: number;
  insertions: number;
  deletions: number;
}

export interface SyncInfo {
  /** Commits on HEAD not yet on the upstream (to push). */
  ahead: number;
  /** Commits on the upstream not yet on HEAD (to pull). */
  behind: number;
  hasUpstream: boolean;
}

export interface StashEntry {
  index: number;
  ref: string;      // "stash@{0}"
  message: string;  // "fix auth" (branch prefix stripped from the reflog subject)
  branch?: string;  // "main" — the branch the stash was created on, parsed from the subject
  date: string;     // "2 hours ago"
  hash?: string;    // full 40-char SHA of the stash commit — stable id used to key user notes
  note?: string;    // optional user annotation describing what's in the stash (from StashNoteStore)
}

/** A multi-step Git operation paused mid-way (usually on conflicts). */
export type OperationKind = "merge" | "rebase" | "cherry-pick" | "revert";

export interface OperationState {
  /** The operation in progress, or null when the repository is idle. */
  kind: OperationKind | null;
  /** Rebase: branch being rebased. */
  branch?: string;
  /** Rebase: target it is replayed onto. Merge: the branch being merged in. */
  onto?: string;
  /** Cherry-pick / revert: short SHA of the commit being applied. */
  commit?: string;
}

/** Outcome of re-applying a stash Gitable created on the user's behalf. */
export type StashRestoreResult =
  /** Fully re-applied and the stash entry dropped. */
  | { status: "restored" }
  /** Applied with merge conflicts; the stash entry is kept until they are resolved. */
  | { status: "conflicts"; files: string[] }
  /** Nothing applied (e.g. an untracked file now exists upstream); the stash is kept. */
  | { status: "blocked"; reason: string; files: string[] };

export interface RebaseState {
  /** True when a rebase is in progress (rebase-merge or rebase-apply dir exists). */
  inProgress: boolean;
  /** Short branch name being rebased, e.g. "feature-x". */
  branch?: string;
  /** Short target ref the branch is being rebased onto, e.g. "main". */
  onto?: string;
}

/**
 * Maps the numeric status from the VS Code Git API (`Status` enum) to a letter.
 * The enum values are stable and documented in the git extension's API typings:
 * 0 INDEX_MODIFIED, 1 INDEX_ADDED, 2 INDEX_DELETED, 3 INDEX_RENAMED,
 * 4 INDEX_COPIED, 5 MODIFIED, 6 DELETED, 7 UNTRACKED, 8 IGNORED, 9 INTENT_TO_ADD.
 */
export function vscodeStatusToLetter(status: number): FileStatusLetter {
  switch (status) {
    case 1: // INDEX_ADDED
    case 9: // INTENT_TO_ADD
      return "A";
    case 2: // INDEX_DELETED
    case 6: // DELETED
      return "D";
    case 3: // INDEX_RENAMED
      return "R";
    case 4: // INDEX_COPIED
      return "C";
    case 7: // UNTRACKED
      return "U";
    case 0: // INDEX_MODIFIED
    case 5: // MODIFIED
    default:
      return "M";
  }
}

/** Maps a `git status --porcelain`/`diff --name-status` letter to our enum. */
export function cliStatusToLetter(raw: string): FileStatusLetter {
  const letter = raw.trim().charAt(0).toUpperCase();
  switch (letter) {
    case "A":
      return "A";
    case "D":
      return "D";
    case "R":
      return "R";
    case "C":
      return "C";
    case "?":
      return "U";
    case "M":
    default:
      return "M";
  }
}
