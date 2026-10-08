import { afterEach, describe, expect, it, vi } from "vitest";
import { ClaudeProvider } from "../../src/ai/ClaudeProvider";
import { GeminiProvider } from "../../src/ai/GeminiProvider";
import { OpenAiProvider } from "../../src/ai/OpenAiProvider";

function mockFetch(body: unknown) {
  const fn = vi.fn(async () => ({ ok: true, status: 200, json: async () => body }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

function sentBody(fn: ReturnType<typeof mockFetch>): any {
  return JSON.parse((fn.mock.calls[0] as any[])[1].body);
}

afterEach(() => vi.unstubAllGlobals());

describe("ClaudeProvider.generate", () => {
  it("sends no sampling params and reads text blocks past thinking", async () => {
    const fn = mockFetch({
      stop_reason: "end_turn",
      content: [{ type: "thinking", thinking: "" }, { type: "text", text: '{"summary":"x"}' }]
    });
    expect(await new ClaudeProvider().generate("s", "u", "claude-haiku-5-5", "k")).toBe('{"summary":"x"}');
    const body = sentBody(fn);
    expect(body).not.toHaveProperty("temperature");
    expect(body.max_tokens).toBeGreaterThanOrEqual(16000);
  });

  it("surfaces refusals and max_tokens truncation", async () => {
    mockFetch({ stop_reason: "refusal", stop_details: { explanation: "policy" }, content: [] });
    await expect(new ClaudeProvider().generate("s", "u", "m", "k")).rejects.toThrow(/declined.*policy/);
    mockFetch({ stop_reason: "max_tokens", content: [{ type: "thinking", thinking: "" }] });
    await expect(new ClaudeProvider().generate("s", "u", "m", "k")).rejects.toThrow(/output tokens/);
  });
});

describe("OpenAiProvider.generate", () => {
  it("uses the Responses API and reads message output", async () => {
    const fn = mockFetch({
      status: "completed",
      output: [
        { type: "reasoning", summary: [] },
        { type: "message", content: [{ type: "output_text", text: '{"summary":"y"}' }] }
      ]
    });
    expect(await new OpenAiProvider().generate("s", "u", "gpt-5", "k")).toBe('{"summary":"y"}');
    expect((fn.mock.calls[0] as any[])[0]).toMatch(/\/v1\/responses$/);
    const body = sentBody(fn);
    expect(body).not.toHaveProperty("temperature");
    expect(body.instructions).toBe("s");
    expect(body.text.format.type).toBe("json_object");
  });

  it("reports incomplete responses", async () => {
    mockFetch({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [] });
    await expect(new OpenAiProvider().generate("s", "u", "m", "k")).rejects.toThrow(/output tokens/);
  });
});

describe("GeminiProvider.generate", () => {
  it("sends no temperature and skips thought parts", async () => {
    const fn = mockFetch({
      candidates: [{ finishReason: "STOP", content: { parts: [{ text: "hmm", thought: true }, { text: '{"summary":"z"}' }] } }]
    });
    expect(await new GeminiProvider().generate("s", "u", "gemini-3-pro", "k")).toBe('{"summary":"z"}');
    expect(sentBody(fn).generationConfig).not.toHaveProperty("temperature");
  });

  it("reports blocked prompts", async () => {
    mockFetch({ promptFeedback: { blockReason: "SAFETY" } });
    await expect(new GeminiProvider().generate("s", "u", "m", "k")).rejects.toThrow(/SAFETY/);
  });
});

describe("structured output schemas", () => {
  const schema = { name: "commit_message", schema: { type: "object" } };

  it("sends each provider's schema parameter", async () => {
    let fn = mockFetch({ stop_reason: "end_turn", content: [{ type: "text", text: "{}" }] });
    await new ClaudeProvider().generate("s", "u", "m", "k", schema);
    expect(sentBody(fn).output_config.format).toEqual({ type: "json_schema", schema: schema.schema });

    fn = mockFetch({ output: [{ type: "message", content: [{ type: "output_text", text: "{}" }] }] });
    await new OpenAiProvider().generate("s", "u", "m", "k", schema);
    expect(sentBody(fn).text.format).toMatchObject({ type: "json_schema", name: "commit_message", strict: true });

    fn = mockFetch({ candidates: [{ content: { parts: [{ text: "{}" }] } }] });
    await new GeminiProvider().generate("s", "u", "m", "k", schema);
    expect(sentBody(fn).generationConfig.responseJsonSchema).toEqual(schema.schema);
  });

  it("retries without the schema when the model rejects it (400)", async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: { message: "output_config not supported" } }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: "{}" }] }) });
    vi.stubGlobal("fetch", fn);
    expect(await new ClaudeProvider().generate("s", "u", "claude-3-haiku", "k", schema)).toBe("{}");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fn.mock.calls[1][1].body)).not.toHaveProperty("output_config");
  });

  it("does not retry non-400 failures", async () => {
    const fn = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    vi.stubGlobal("fetch", fn);
    await expect(new ClaudeProvider().generate("s", "u", "m", "k", schema)).rejects.toThrow(/401/);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
