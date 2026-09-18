import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GitableViewProvider } from "../../src/views/GitableViewProvider";

function makeProvider(): GitableViewProvider {
  return new GitableViewProvider(
    {} as any,
    {} as any,
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
