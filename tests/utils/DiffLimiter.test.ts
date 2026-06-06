import { describe, expect, it } from "vitest";
import { DiffLimiter } from "../../src/utils/DiffLimiter";

// Minimal well-formed diff block used throughout the tests.
function makeDiff(filePath: string, body = "+added line\n"): string {
  return `diff --git a/${filePath} b/${filePath}\nindex 000..111 100644\n--- a/${filePath}\n+++ b/${filePath}\n@@ -1 +1,2 @@\n ${body}`;
}

describe("DiffLimiter.isIgnored", () => {
  it("ignores package-lock.json", () => {
    expect(DiffLimiter.isIgnored("package-lock.json")).toBe(true);
    expect(DiffLimiter.isIgnored("sub/package-lock.json")).toBe(true);
  });

  it("ignores yarn.lock and pnpm-lock.yaml", () => {
    expect(DiffLimiter.isIgnored("yarn.lock")).toBe(true);
    expect(DiffLimiter.isIgnored("pnpm-lock.yaml")).toBe(true);
  });

  it("ignores .min.js files", () => {
    expect(DiffLimiter.isIgnored("vendor.min.js")).toBe(true);
    expect(DiffLimiter.isIgnored("lib/bundle.min.js")).toBe(true);
  });

  it("ignores .map files", () => {
    expect(DiffLimiter.isIgnored("main.js.map")).toBe(true);
    expect(DiffLimiter.isIgnored("dist/main.css.map")).toBe(true);
  });

  it("ignores files under dist/, build/, bin/, obj/, coverage/", () => {
    for (const dir of ["dist", "build", "bin", "obj", "coverage"]) {
      expect(DiffLimiter.isIgnored(`${dir}/something.js`)).toBe(true);
      expect(DiffLimiter.isIgnored(`sub/${dir}/something.js`)).toBe(true);
    }
  });

  it("does not ignore regular source files", () => {
    expect(DiffLimiter.isIgnored("src/main.ts")).toBe(false);
    expect(DiffLimiter.isIgnored("README.md")).toBe(false);
    expect(DiffLimiter.isIgnored("package.json")).toBe(false);
  });
});

describe("DiffLimiter.prepare", () => {
  it("returns empty diff for empty input", () => {
    expect(DiffLimiter.prepare("")).toEqual({ diff: "", truncated: false, ignoredFiles: [] });
    expect(DiffLimiter.prepare("   \n")).toEqual({ diff: "", truncated: false, ignoredFiles: [] });
  });

  it("passes through a clean diff unchanged", () => {
    const raw = makeDiff("src/index.ts");
    const result = DiffLimiter.prepare(raw);
    expect(result.diff).toBe(raw);
    expect(result.truncated).toBe(false);
    expect(result.ignoredFiles).toEqual([]);
  });

  it("removes ignored files from the output and lists them", () => {
    const lockDiff = makeDiff("package-lock.json");
    const srcDiff = makeDiff("src/app.ts");
    const raw = `${lockDiff}\n${srcDiff}`;

    const result = DiffLimiter.prepare(raw);
    expect(result.ignoredFiles).toEqual(["package-lock.json"]);
    expect(result.diff).not.toContain("package-lock.json");
    expect(result.diff).toContain("src/app.ts");
    expect(result.truncated).toBe(false);
  });

  it("removes multiple ignored files in one pass", () => {
    const raw = [
      makeDiff("yarn.lock"),
      makeDiff("src/a.ts"),
      makeDiff("dist/bundle.js"),
      makeDiff("src/b.ts")
    ].join("\n");

    const result = DiffLimiter.prepare(raw);
    expect(result.ignoredFiles.sort()).toEqual(["dist/bundle.js", "yarn.lock"]);
    expect(result.diff).not.toContain("yarn.lock");
    expect(result.diff).not.toContain("dist/bundle.js");
    expect(result.diff).toContain("src/a.ts");
    expect(result.diff).toContain("src/b.ts");
  });

  it("truncates diff that exceeds maxChars", () => {
    const longBody = "+" + "x".repeat(200) + "\n";
    const raw = makeDiff("src/big.ts", longBody);
    const maxChars = 50;

    const result = DiffLimiter.prepare(raw, maxChars);
    expect(result.truncated).toBe(true);
    expect(result.diff.length).toBeGreaterThan(maxChars);
    expect(result.diff).toContain("diff truncated by Gitable");
  });

  it("does not truncate when diff equals maxChars exactly", () => {
    const raw = makeDiff("src/file.ts");
    const result = DiffLimiter.prepare(raw, raw.length);
    expect(result.truncated).toBe(false);
  });
});
