import { describe, expect, it } from "vitest";
import { buildCommitPrompt } from "../../src/ai/prompts";

describe("buildCommitPrompt", () => {
  it("returns system and user fields", () => {
    const { system, user } = buildCommitPrompt("diff content");
    expect(typeof system).toBe("string");
    expect(typeof user).toBe("string");
    expect(system.length).toBeGreaterThan(0);
    expect(user.length).toBeGreaterThan(0);
  });

  it("system prompt enforces Conventional Commits and JSON-only output", () => {
    const { system } = buildCommitPrompt("diff");
    expect(system.toLowerCase()).toContain("conventional commits");
    expect(system).toContain("JSON");
    // Must not allow markdown fences in the response.
    expect(system.toLowerCase()).toMatch(/no markdown|json only|only.*json/i);
  });

  it("system prompt specifies the exact JSON shape", () => {
    const { system } = buildCommitPrompt("diff");
    expect(system).toContain("summary");
    expect(system).toContain("description");
  });

  it("user prompt includes the diff", () => {
    const diff = "diff --git a/src/index.ts b/src/index.ts\n+added line";
    const { user } = buildCommitPrompt(diff);
    expect(user).toContain(diff);
  });

  it("user prompt includes the diffStat block when provided", () => {
    const stat = " src/index.ts | 1 +\n 1 file changed, 1 insertion(+)";
    const { user } = buildCommitPrompt("diff content", stat);
    expect(user).toContain("Diff stat:");
    expect(user).toContain(stat.trim());
  });

  it("user prompt omits diffStat block when not provided", () => {
    const { user } = buildCommitPrompt("diff content");
    expect(user).not.toContain("Diff stat:");
  });

  it("user prompt omits diffStat block when it is whitespace only", () => {
    const { user } = buildCommitPrompt("diff content", "   ");
    expect(user).not.toContain("Diff stat:");
  });

  it("system prompt requests imperative mood and ≤72-char summary", () => {
    const { system } = buildCommitPrompt("diff");
    expect(system.toLowerCase()).toMatch(/imperative/);
    expect(system).toMatch(/72/);
  });
});
