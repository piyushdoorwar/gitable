import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { PendingRestoreStore } from "../../src/config/PendingRestoreStore";
import { GitableViewProvider } from "../../src/views/GitableViewProvider";

/** In-memory stand-in for `context.workspaceState`. */
function memento(): vscode.Memento {
  const data = new Map<string, unknown>();
  return {
    keys: () => [...data.keys()],
    get: (key: string, fallback?: unknown) => (data.has(key) ? data.get(key) : fallback),
    update: async (key: string, value: unknown) => {
      data.set(key, value);
    }
  } as unknown as vscode.Memento;
}

function makeProvider(git: object = {}, pendingRestores = new PendingRestoreStore(memento())): GitableViewProvider {
  return new GitableViewProvider(
    {} as any,
    { getActiveRoot: () => "/repo", ...git } as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    pendingRestores,
    { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any
  );
}

describe("GitableViewProvider badge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // A cleared badge is written as value 0 rather than `undefined`: VS Code's
  // WebviewViewPane ignores an undefined badge, leaving the stale count on the icon.
  const CLEARED = { value: 0, tooltip: "No changes" };

  it("clears the activity badge when there are no staged or unstaged changes", () => {
    const provider = makeProvider();
    const view = { badge: { value: 6, tooltip: "6 files changed" } as unknown };

    (provider as any).view = view;
    (provider as any).updateBadge({ staged: [], unstaged: [], conflicts: [] });
    vi.runAllTimers();

    expect(view.badge).toEqual(CLEARED);
  });

  it("counts distinct changed files across staged, unstaged, and conflicts", () => {
    const provider = makeProvider();
    const view = { badge: undefined };

    (provider as any).view = view;
    (provider as any).updateBadge({
      staged: [{ path: "a.ts" }, { path: "b.ts" }],
      unstaged: [{ path: "c.ts" }],
      conflicts: [{ path: "d.ts" }]
    });
    vi.runAllTimers();

    expect(view.badge).toEqual({ value: 4, tooltip: "4 files changed" });
  });

  it("de-duplicates a partial file that is both staged and unstaged", () => {
    const provider = makeProvider();
    const view: { badge: unknown } = { badge: undefined };

    (provider as any).view = view;
    (provider as any).updateBadge({
      staged: [{ path: "partial.ts" }],
      unstaged: [{ path: "partial.ts" }],
      conflicts: []
    });
    vi.runAllTimers();

    expect(view.badge).toEqual({ value: 1, tooltip: "1 file changed" });
  });

  it("coalesces a burst of updates to the final settled count (no intermediate writes)", () => {
    const provider = makeProvider();
    const written: unknown[] = [];
    const view = {
      _badge: undefined as unknown,
      get badge() {
        return this._badge;
      },
      set badge(v: unknown) {
        written.push(v);
        this._badge = v;
      }
    };

    (provider as any).view = view;
    // Simulate the rapid onDidChange burst a commit fires: 5 files → 0 files.
    (provider as any).updateBadge({ staged: [{ path: "a" }, { path: "b" }, { path: "c" }, { path: "d" }, { path: "e" }], unstaged: [], conflicts: [] });
    (provider as any).updateBadge({ staged: [{ path: "a" }], unstaged: [], conflicts: [] });
    (provider as any).updateBadge({ staged: [], unstaged: [], conflicts: [] });
    vi.runAllTimers();

    // The intermediate counts (5, 1) are never written — only the settled value.
    expect(written.every((v) => JSON.stringify(v) === JSON.stringify(CLEARED))).toBe(true);
    expect(view.badge).toEqual(CLEARED);
  });

  it("re-asserts the settled count so a dropped VS Code badge write self-heals", () => {
    const provider = makeProvider();
    const written: unknown[] = [];
    const view = {
      _badge: undefined as unknown,
      get badge() {
        return this._badge;
      },
      set badge(v: unknown) {
        written.push(v);
        this._badge = v;
      }
    };

    (provider as any).view = view;
    (provider as any).updateBadge({ staged: [], unstaged: [], conflicts: [] });
    vi.runAllTimers();

    // Written at least twice (primary + confirming re-assert), always the settled value,
    // so a first write dropped by VS Code mid-burst is corrected by the second.
    expect(written.length).toBeGreaterThanOrEqual(2);
    expect(written.every((v) => JSON.stringify(v) === JSON.stringify(CLEARED))).toBe(true);
    expect(view.badge).toEqual(CLEARED);
  });
});

describe("GitableViewProvider refresh coalescing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("collapses a burst of Git change events into a single refresh", () => {
    const provider = makeProvider();
    const refresh = vi.fn().mockResolvedValue(undefined);
    (provider as any).refresh = refresh;

    // One commit makes the built-in Git extension fire several change events.
    for (let i = 0; i < 6; i++) {
      provider.scheduleRefresh();
    }
    expect(refresh).not.toHaveBeenCalled();

    vi.runAllTimers();
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("GitableViewProvider background fetch", () => {
  it("skips fetching while a user git operation is in flight", async () => {
    const fetchOrigin = vi.fn().mockResolvedValue(undefined);
    const provider = makeProvider({ fetchOrigin });
    const refresh = vi.fn().mockResolvedValue(undefined);
    (provider as any).refresh = refresh;
    (provider as any).busyKind = "stage";

    await (provider as any).silentFetchAndRefresh();

    expect(fetchOrigin).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("skips fetching while another fetch is still running", async () => {
    const fetchOrigin = vi.fn().mockResolvedValue(undefined);
    const provider = makeProvider({ fetchOrigin });
    (provider as any).fetchInFlight = true;

    await (provider as any).silentFetchAndRefresh();

    expect(fetchOrigin).not.toHaveBeenCalled();
  });

  it("leaves a user sync label that started during the fetch untouched", async () => {
    // The user hits Push while the background fetch is still in flight.
    const fetchOrigin = vi.fn(async () => {
      (provider as any).syncAction = "Pushing";
    });
    const provider = makeProvider({ fetchOrigin });
    (provider as any).postState = vi.fn().mockResolvedValue(undefined);

    await (provider as any).silentFetchAndRefresh();

    expect(fetchOrigin).toHaveBeenCalledTimes(1);
    expect((provider as any).syncAction).toBe("Pushing");
    expect((provider as any).fetchInFlight).toBe(false);
  });
});

describe("GitableViewProvider message errors", () => {
  it("surfaces an unexpected handler failure and releases the busy state", async () => {
    const provider = makeProvider();
    (provider as any).postState = vi.fn().mockResolvedValue(undefined);
    (provider as any).busyKind = "stage";
    (provider as any).busyText = "Staging file...";
    (provider as any).handleMessage = vi.fn().mockRejectedValue(new Error("boom"));

    await (provider as any).handleMessageSafely({ type: "stageFiles" });

    expect((provider as any).busyKind).toBe("");
    expect((provider as any).busyText).toBe("");
    expect((provider as any).pendingError).toBe("boom");
  });
});

describe("GitableViewProvider conflict flow", () => {
  const idle = { kind: null };
  const clean = { staged: [], unstaged: [], conflicts: [] };
  const dirty = { staged: [], unstaged: [{ path: "a.ts" }], conflicts: [] };
  const conflicted = { staged: [], unstaged: [], conflicts: [{ path: "a.ts", conflict: "both-modified" }] };

  function quiet(provider: GitableViewProvider): void {
    (provider as any).postState = vi.fn().mockResolvedValue(undefined);
  }

  beforeEach(() => {
    vi.mocked(vscode.window.showErrorMessage).mockClear();
  });

  it("keeps local changes stashed when a pull stops on conflicts, without an error toast", async () => {
    const store = new PendingRestoreStore(memento());
    let paused = false;
    const git = {
      getSyncInfo: vi.fn().mockResolvedValue({ ahead: 0, behind: 1, hasUpstream: true }),
      getChanges: vi.fn(async () => (paused ? conflicted : dirty)),
      getOperationState: vi.fn(async () => (paused ? { kind: "merge", onto: "origin/main" } : idle)),
      stashAll: vi.fn().mockResolvedValue("abc123"),
      pull: vi.fn(async () => {
        paused = true;
        throw new Error("CONFLICT (content): Merge conflict in a.ts");
      }),
      restoreStash: vi.fn()
    };
    const provider = makeProvider(git, store);
    quiet(provider);

    await (provider as any).pullWithLocalChangesCheck();

    expect(git.stashAll).toHaveBeenCalledWith("Gitable auto-stash before pull");
    expect(git.restoreStash).not.toHaveBeenCalled();
    expect(store.get("/repo")).toEqual({ sha: "abc123", phase: "after-operation" });
    expect((provider as any).pendingError).toMatch(/merge stopped on conflicts in 1 file/);
    expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
  });

  it("restores set-aside changes immediately when a pull fails for another reason", async () => {
    const git = {
      getSyncInfo: vi.fn().mockResolvedValue({ ahead: 0, behind: 1, hasUpstream: true }),
      getChanges: vi.fn().mockResolvedValue(dirty),
      getOperationState: vi.fn().mockResolvedValue(idle),
      stashAll: vi.fn().mockResolvedValue("abc123"),
      pull: vi.fn().mockRejectedValue(new Error("Could not resolve host")),
      restoreStash: vi.fn().mockResolvedValue({ status: "restored" })
    };
    const provider = makeProvider(git);
    quiet(provider);

    await (provider as any).pullWithLocalChangesCheck();

    expect(git.restoreStash).toHaveBeenCalledWith("abc123");
    expect((provider as any).pendingError).toBe("Could not resolve host");
  });

  it("brings set-aside changes back once the paused operation is gone", async () => {
    const store = new PendingRestoreStore(memento());
    store.set("/repo", { sha: "abc123", phase: "after-operation" });
    const git = {
      hasStash: vi.fn().mockResolvedValue(true),
      getOperationState: vi.fn().mockResolvedValue(idle),
      getChanges: vi.fn().mockResolvedValue(clean),
      restoreStash: vi.fn().mockResolvedValue({ status: "restored" })
    };
    const provider = makeProvider(git, store);
    quiet(provider);

    await provider.refresh();

    expect(git.restoreStash).toHaveBeenCalledWith("abc123");
    expect(store.get("/repo")).toBeUndefined();
  });

  it("finishes a conflicted restore once its last conflict is resolved", async () => {
    const store = new PendingRestoreStore(memento());
    store.set("/repo", { sha: "abc123", phase: "conflicts", files: ["a.ts"] });
    const git = {
      hasStash: vi.fn().mockResolvedValue(true),
      getOperationState: vi.fn().mockResolvedValue(idle),
      getChanges: vi.fn().mockResolvedValue(clean),
      finishStashRestore: vi.fn().mockResolvedValue(undefined)
    };
    const provider = makeProvider(git, store);
    quiet(provider);

    await provider.refresh();

    expect(git.finishStashRestore).toHaveBeenCalledWith("abc123", ["a.ts"]);
    expect(store.get("/repo")).toBeUndefined();
  });

  it("does not finish a restore while conflicts remain", async () => {
    const store = new PendingRestoreStore(memento());
    store.set("/repo", { sha: "abc123", phase: "conflicts", files: ["a.ts"] });
    const git = {
      hasStash: vi.fn().mockResolvedValue(true),
      getOperationState: vi.fn().mockResolvedValue(idle),
      getChanges: vi.fn().mockResolvedValue(conflicted),
      finishStashRestore: vi.fn()
    };
    const provider = makeProvider(git, store);
    quiet(provider);

    await provider.refresh();

    expect(git.finishStashRestore).not.toHaveBeenCalled();
    expect(store.get("/repo")).toBeDefined();
  });

  it.each([
    ["merge", "mine", "ours"],
    ["merge", "incoming", "theirs"],
    ["cherry-pick", "mine", "ours"],
    ["rebase", "mine", "theirs"],
    ["rebase", "incoming", "ours"],
    [null, "mine", "theirs"]
  ])("maps %s / keep %s to git's --%s", async (kind, keep, side) => {
    const git = {
      getOperationState: vi.fn().mockResolvedValue({ kind }),
      getChanges: vi.fn().mockResolvedValue(conflicted),
      resolveConflict: vi.fn().mockResolvedValue(undefined),
      hasStash: vi.fn().mockResolvedValue(false)
    };
    const provider = makeProvider(git);
    quiet(provider);

    await (provider as any).resolveConflict("a.ts", keep);

    expect(git.resolveConflict).toHaveBeenCalledWith("a.ts", side);
  });

  it("continues the paused operation by itself when the last conflict is resolved", async () => {
    let resolved = false;
    let done = false;
    const git = {
      getOperationState: vi.fn(async () => (done ? idle : { kind: "rebase", onto: "main" })),
      getChanges: vi.fn(async () => (resolved ? clean : conflicted)),
      markResolved: vi.fn(async () => {
        resolved = true;
      }),
      hasConflictMarkers: vi.fn().mockResolvedValue(false),
      continueOperation: vi.fn(async () => {
        done = true;
      })
    };
    const provider = makeProvider(git);
    quiet(provider);

    await (provider as any).markResolved("a.ts");

    expect(git.continueOperation).toHaveBeenCalledWith("rebase");
    expect((provider as any).pendingNotice).toBe("Rebase completed.");
  });

  it("asks before marking a file that still has conflict markers", async () => {
    const git = {
      hasConflictMarkers: vi.fn().mockResolvedValue(true),
      markResolved: vi.fn()
    };
    const provider = makeProvider(git);
    quiet(provider);

    await (provider as any).markResolved("a.ts");

    expect(vscode.window.showWarningMessage).toHaveBeenCalled();
    expect(git.markResolved).not.toHaveBeenCalled();
  });

  it("refuses to pull while a merge is paused", async () => {
    const git = {
      getOperationState: vi.fn().mockResolvedValue({ kind: "merge" }),
      getChanges: vi.fn().mockResolvedValue(conflicted),
      pull: vi.fn()
    };
    const provider = makeProvider(git);
    quiet(provider);

    await (provider as any).pullWithLocalChangesCheck();

    expect(git.pull).not.toHaveBeenCalled();
    expect((provider as any).pendingError).toMatch(/merge is in progress/);
  });
});
