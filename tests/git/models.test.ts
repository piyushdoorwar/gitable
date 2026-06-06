import { describe, expect, it } from "vitest";
import { cliStatusToLetter, vscodeStatusToLetter } from "../../src/git/models";

describe("vscodeStatusToLetter", () => {
  it("maps INDEX_ADDED (1) to A", () => {
    expect(vscodeStatusToLetter(1)).toBe("A");
  });

  it("maps INTENT_TO_ADD (9) to A", () => {
    expect(vscodeStatusToLetter(9)).toBe("A");
  });

  it("maps INDEX_DELETED (2) to D", () => {
    expect(vscodeStatusToLetter(2)).toBe("D");
  });

  it("maps DELETED (6) to D", () => {
    expect(vscodeStatusToLetter(6)).toBe("D");
  });

  it("maps INDEX_RENAMED (3) to R", () => {
    expect(vscodeStatusToLetter(3)).toBe("R");
  });

  it("maps INDEX_COPIED (4) to C", () => {
    expect(vscodeStatusToLetter(4)).toBe("C");
  });

  it("maps UNTRACKED (7) to U", () => {
    expect(vscodeStatusToLetter(7)).toBe("U");
  });

  it("maps INDEX_MODIFIED (0) to M", () => {
    expect(vscodeStatusToLetter(0)).toBe("M");
  });

  it("maps MODIFIED (5) to M", () => {
    expect(vscodeStatusToLetter(5)).toBe("M");
  });

  it("defaults unknown values to M", () => {
    expect(vscodeStatusToLetter(99)).toBe("M");
  });
});

describe("cliStatusToLetter", () => {
  it("maps A to A", () => {
    expect(cliStatusToLetter("A")).toBe("A");
  });

  it("maps D to D", () => {
    expect(cliStatusToLetter("D")).toBe("D");
  });

  it("maps R to R", () => {
    expect(cliStatusToLetter("R")).toBe("R");
  });

  it("maps C to C", () => {
    expect(cliStatusToLetter("C")).toBe("C");
  });

  it("maps ? to U", () => {
    expect(cliStatusToLetter("?")).toBe("U");
  });

  it("maps M to M", () => {
    expect(cliStatusToLetter("M")).toBe("M");
  });

  it("maps lowercase to the correct letter (case-insensitive)", () => {
    expect(cliStatusToLetter("a")).toBe("A");
    expect(cliStatusToLetter("d")).toBe("D");
    expect(cliStatusToLetter("m")).toBe("M");
  });

  it("handles rename codes with similarity score (e.g. R100)", () => {
    expect(cliStatusToLetter("R100")).toBe("R");
  });

  it("defaults unknown letters to M", () => {
    expect(cliStatusToLetter("X")).toBe("M");
    expect(cliStatusToLetter("")).toBe("M");
  });

  it("trims surrounding whitespace before mapping", () => {
    expect(cliStatusToLetter("  A  ")).toBe("A");
  });
});
