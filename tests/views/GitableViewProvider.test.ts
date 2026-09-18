import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GitableViewProvider } from "../../src/views/GitableViewProvider";

function makeProvider(git: unknown = {}): GitableViewProvider {
  return new GitableViewProvider(
    {} as any,
    git as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any
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
