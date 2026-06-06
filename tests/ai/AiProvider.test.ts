import { describe, expect, it } from "vitest";
import {
  AiProviderError,
  mapStatusToMessage,
  parseGeneratedMessage,
  throwForStatus
} from "../../src/ai/AiProvider";

describe("mapStatusToMessage", () => {
  it("returns auth error for 401", () => {
    expect(mapStatusToMessage(401)).toContain("401");
    expect(mapStatusToMessage(401).toLowerCase()).toContain("unauthorized");
  });

  it("returns auth error for 403", () => {
    expect(mapStatusToMessage(403)).toContain("403");
  });

  it("returns not-found error for 404", () => {
    const msg = mapStatusToMessage(404);
    expect(msg).toContain("404");
    expect(msg.toLowerCase()).toContain("not found");
  });

  it("returns rate-limit error for 429", () => {
    const msg = mapStatusToMessage(429);
    expect(msg).toContain("429");
    expect(msg.toLowerCase()).toMatch(/rate limit/);
  });

  it("returns unavailable error for 500", () => {
    const msg = mapStatusToMessage(500);
    expect(msg).toContain("500");
  });

  it("returns unavailable error for any 5xx status", () => {
    expect(mapStatusToMessage(503)).toContain("503");
  });

  it("uses fallback string for unhandled status codes", () => {
    expect(mapStatusToMessage(418, "I'm a teapot")).toBe("I'm a teapot");
  });

  it("returns generic message for unknown status without fallback", () => {
    const msg = mapStatusToMessage(418);
    expect(msg).toContain("418");
  });
});

describe("throwForStatus", () => {
  it("throws AiProviderError with the HTTP status", async () => {
    const fakeResponse = {
      status: 401,
      json: async () => ({ error: { message: "bad key" } })
    };
    await expect(throwForStatus(fakeResponse)).rejects.toBeInstanceOf(AiProviderError);

    try {
      await throwForStatus(fakeResponse);
    } catch (err) {
      expect((err as AiProviderError).status).toBe(401);
    }
  });

  it("falls back gracefully when response body is not JSON", async () => {
    const fakeResponse = {
      status: 500,
      json: async (): Promise<unknown> => {
        throw new Error("not json");
      }
    };
    await expect(throwForStatus(fakeResponse)).rejects.toBeInstanceOf(AiProviderError);
  });
});

describe("parseGeneratedMessage", () => {
  it("parses a clean JSON object", () => {
    const result = parseGeneratedMessage('{"summary":"feat: add widget","description":"adds the new widget component"}');
    expect(result.summary).toBe("feat: add widget");
    expect(result.description).toBe("adds the new widget component");
  });

  it("parses JSON without a description field", () => {
    const result = parseGeneratedMessage('{"summary":"chore: bump deps"}');
    expect(result.summary).toBe("chore: bump deps");
    expect(result.description).toBeUndefined();
  });

  it("strips markdown code fences before parsing", () => {
    const text = "```json\n{\"summary\":\"fix: correct typo\"}\n```";
    const result = parseGeneratedMessage(text);
    expect(result.summary).toBe("fix: correct typo");
  });

  it("strips plain code fences before parsing", () => {
    const text = "```\n{\"summary\":\"docs: update readme\"}\n```";
    const result = parseGeneratedMessage(text);
    expect(result.summary).toBe("docs: update readme");
  });

  it("handles JSON embedded in surrounding prose", () => {
    const text = 'Here is the commit message: {"summary":"refactor: extract helper"} — done.';
    const result = parseGeneratedMessage(text);
    expect(result.summary).toBe("refactor: extract helper");
  });

  it("falls back to first line when input is not parseable JSON", () => {
    const result = parseGeneratedMessage("fix: plain text commit message");
    expect(result.summary).toBe("fix: plain text commit message");
    expect(result.description).toBeUndefined();
  });

  it("returns Update changes when input is completely empty", () => {
    expect(parseGeneratedMessage("").summary).toBe("Update changes");
  });

  it("omits description when it is an empty string", () => {
    const result = parseGeneratedMessage('{"summary":"test: add coverage","description":""}');
    expect(result.description).toBeUndefined();
  });

  it("omits description when it is whitespace only", () => {
    const result = parseGeneratedMessage('{"summary":"test: add coverage","description":"   "}');
    expect(result.description).toBeUndefined();
  });

  it("trims whitespace from summary and description", () => {
    const result = parseGeneratedMessage('{"summary":"  feat: spaced  ","description":"  detail  "}');
    expect(result.summary).toBe("feat: spaced");
    expect(result.description).toBe("detail");
  });
});
