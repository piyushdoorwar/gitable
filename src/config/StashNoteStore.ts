import * as vscode from "vscode";

const STATE_KEY = "gitable.stashNotes";

/**
 * Persists user-authored notes describing what's inside a stash.
 *
 * Notes are keyed by the stash commit's full SHA rather than its `stash@{N}`
 * ref: refs shift as stashes are pushed and popped, but the commit SHA is
 * stable for the life of the stash. Stored in `context.globalState` (outside
 * the workspace, never committed), mirroring the UsageStore pattern.
 */
export class StashNoteStore {
  constructor(private readonly state: vscode.Memento) {}

  /** Returns the note for a stash commit hash, or undefined if none is set. */
  get(hash: string | undefined): string | undefined {
    if (!hash) return undefined;
    const note = this.readAll()[hash];
    return note && note.trim() ? note : undefined;
  }

  /** Sets or clears (empty/whitespace) the note for a stash commit hash. */
  set(hash: string, note: string): void {
    if (!hash) return;
    const all = this.readAll();
    if (note && note.trim()) {
      all[hash] = note.trim();
    } else {
      delete all[hash];
    }
    void this.state.update(STATE_KEY, all);
  }

  /** Drops notes whose stash commit no longer exists, keeping storage bounded. */
  prune(validHashes: Iterable<string>): void {
    const keep = new Set(validHashes);
    const all = this.readAll();
    let changed = false;
    for (const hash of Object.keys(all)) {
      if (!keep.has(hash)) {
        delete all[hash];
        changed = true;
      }
    }
    if (changed) void this.state.update(STATE_KEY, all);
  }

  private readAll(): Record<string, string> {
    return this.state.get<Record<string, string>>(STATE_KEY, {});
  }
}
