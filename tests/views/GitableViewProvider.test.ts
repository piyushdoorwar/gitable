import { describe, expect, it } from "vitest";
import { GitableViewProvider } from "../../src/views/GitableViewProvider";

function makeProvider(): GitableViewProvider {
  return new GitableViewProvider(
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
  it("clears the activity badge when there are no staged or unstaged changes", () => {
    const provider = makeProvider();
    const view = { badge: { value: 6, tooltip: "6 files changed" } };

    (provider as any).view = view;
    (provider as any).updateBadge({ staged: [], unstaged: [], conflicts: [] });

    expect(view.badge).toBeUndefined();
  });

  it("counts staged and unstaged changes in the activity badge", () => {
    const provider = makeProvider();
    const view = { badge: undefined };

    (provider as any).view = view;
    (provider as any).updateBadge({
      staged: [{ path: "a.ts" }, { path: "b.ts" }],
      unstaged: [{ path: "c.ts" }],
      conflicts: [{ path: "d.ts" }]
    });

    expect(view.badge).toEqual({ value: 3, tooltip: "3 files changed" });
  });
});
