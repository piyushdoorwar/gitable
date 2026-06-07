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
  message: string;  // "WIP on main: fix auth"
  date: string;     // "2 hours ago"
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
