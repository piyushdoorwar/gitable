import * as vscode from "vscode";

const STATE_KEY = "gitable.pendingRestores";

/**
 * Local changes Gitable set aside in a stash and still owes back to the user.
 *
 * - `after-operation`: a pull/merge/rebase/cherry-pick/revert stopped on
 *   conflicts while the changes were stashed. They are re-applied once that
 *   operation is continued or aborted — the same contract as git's own
 *   `--autostash`.
 * - `conflicts`: they were re-applied but overlapped; the stash is dropped once
 *   the listed files are resolved.
 */
export interface PendingRestore {
  sha: string;
  phase: "after-operation" | "conflicts";
  /** Paths that conflicted while restoring (phase `conflicts`). */
  files?: string[];
}

/**
 * Persists {@link PendingRestore}s per repository root in `workspaceState`, so a
 * window reload in the middle of a conflicted pull doesn't strand the user's
 * changes in an anonymous stash.
 */
export class PendingRestoreStore {
  constructor(private readonly state: vscode.Memento) {}

  get(root: string | undefined): PendingRestore | undefined {
    return root ? this.readAll()[root] : undefined;
  }

  set(root: string, restore: PendingRestore): void {
    void this.state.update(STATE_KEY, { ...this.readAll(), [root]: restore });
  }

  clear(root: string | undefined): void {
    if (!root) return;
    const all = this.readAll();
    if (!(root in all)) return;
    delete all[root];
    void this.state.update(STATE_KEY, all);
  }

  private readAll(): Record<string, PendingRestore> {
    return { ...this.state.get<Record<string, PendingRestore>>(STATE_KEY, {}) };
  }
}
