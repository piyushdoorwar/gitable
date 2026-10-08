import {
  AiProvider,
  AiProviderError,
  GeneratedCommitMessage,
  GenerateCommitMessageInput,
  parseGeneratedMessage,
  throwForStatus,
  withSchemaFallback
} from "./AiProvider";

import { MODEL_FETCH_LIMIT } from "../constants";
import { buildCommitPrompt, OutputSchema } from "./prompts";
import { AI_GENERATE_TIMEOUT_MS, fetchWithTimeout } from "../utils/fetchWithTimeout";

const BASE_URL = "https://api.openai.com/v1";

/** Dated snapshot suffixes, e.g. gpt-4o-2024-08-06, gpt-4-0613. */
const DATED_SNAPSHOT = /-\d{4}(-\d{2}-\d{2})?$/;

/**
 * Keeps the live list to "main" general-purpose chat models so the dropdown
 * stays small as OpenAI keeps adding SKUs (mirrors the prompt-optimizer rules).
 */
function isMainOpenAIModel(id: string): boolean {
  const s = String(id || "").toLowerCase();
  if (!/^gpt-/.test(s) && !/^o\d/.test(s)) {
    return false;
  }
  if (/(audio|realtime|transcribe|tts|search|image|embedding|moderation|instruct|vision|-16k|chat-latest)/.test(s)) {
    return false;
  }
  if (DATED_SNAPSHOT.test(s)) {
    return false;
  }
  return true;
}

/**
 * OpenAI provider. Validation and model listing use `GET /v1/models`;
 * generation uses the Responses API (`POST /v1/responses`) with a JSON-object
 * text format, which reliably yields the structured JSON Gitable expects.
 *
 * Responses (not Chat Completions) is OpenAI's current API and the only one
 * some newer models (e.g. `*-codex`, `*-pro`) are served on. No `temperature`
 * is sent: reasoning models (o-series, GPT-5 family) reject anything but the
 * default, and the default is fine for the rest.
 */
export class OpenAiProvider implements AiProvider {
  async validateApiKey(apiKey: string): Promise<boolean> {
    const response = await fetchWithTimeout(`${BASE_URL}/models`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    return response.ok;
  }

  async listModels(apiKey: string): Promise<string[]> {
    const response = await fetchWithTimeout(`${BASE_URL}/models`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    if (!response.ok) {
      await throwForStatus(response);
    }
    const data: any = await response.json();
    const items: any[] = Array.isArray(data?.data) ? data.data : [];
    // Sort newest first by the API's `created` timestamp so flagships order
    // correctly without maintaining a version list.
    return items
      .filter((m) => isMainOpenAIModel(String(m?.id ?? "")))
      .sort((a, b) => (Number(b?.created) || 0) - (Number(a?.created) || 0))
      .map((m) => String(m.id))
      .filter(Boolean)
      .slice(0, MODEL_FETCH_LIMIT);
  }

  async generate(system: string, user: string, model: string, apiKey: string, schema?: OutputSchema): Promise<string> {
    return withSchemaFallback(schema, (s) => this.request(system, user, model, apiKey, s));
  }

  private async request(
    system: string,
    user: string,
    model: string,
    apiKey: string,
    schema: OutputSchema | undefined
  ): Promise<string> {
    const response = await fetchWithTimeout(
      `${BASE_URL}/responses`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          instructions: system,
          input: user,
          text: {
            format: schema
              ? { type: "json_schema", name: schema.name, schema: schema.schema, strict: true }
              : { type: "json_object" }
          },
          store: false
        })
      },
      AI_GENERATE_TIMEOUT_MS
    );
    if (!response.ok) await throwForStatus(response);
    const data: any = await response.json();
    if (data?.error?.message) throw new AiProviderError(`OpenAI error: ${data.error.message}`);

    // `output` mixes reasoning items with the final message; read message text
    // (and refusals) only. `output_text` is an SDK convenience, not on the wire.
    const content: any[] = (Array.isArray(data?.output) ? data.output : [])
      .filter((item: any) => item?.type === "message")
      .flatMap((item: any) => (Array.isArray(item?.content) ? item.content : []));
    const refusal = content.find((c) => c?.type === "refusal" && typeof c?.refusal === "string");
    if (refusal) throw new AiProviderError(`OpenAI declined this request: ${refusal.refusal}`);
    const text = content
      .map((c) => (c?.type === "output_text" && typeof c?.text === "string" ? c.text : ""))
      .join("")
      .trim();
    if (!text) {
      const reason = data?.status === "incomplete" ? data?.incomplete_details?.reason : undefined;
      throw new AiProviderError(
        reason === "max_output_tokens"
          ? "OpenAI ran out of output tokens before answering. Try a smaller selection or a lower token budget."
          : reason
            ? `OpenAI returned an incomplete response (${reason}).`
            : "OpenAI returned an empty response."
      );
    }
    return text;
  }

  async generateCommitMessage(input: GenerateCommitMessageInput, apiKey: string): Promise<GeneratedCommitMessage> {
    const { system, user, schema } = buildCommitPrompt(input.diff, input.diffStat);
    return parseGeneratedMessage(await this.generate(system, user, input.model, apiKey, schema));
  }
}
