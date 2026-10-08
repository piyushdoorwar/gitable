import {
  AiProvider,
  AiProviderError,
  GeneratedCommitMessage,
  GenerateCommitMessageInput,
  parseGeneratedMessage,
  throwForStatus
} from "./AiProvider";
import { MODEL_FETCH_LIMIT } from "../constants";
import { buildCommitPrompt } from "./prompts";
import { AI_GENERATE_TIMEOUT_MS, fetchWithTimeout } from "../utils/fetchWithTimeout";

const BASE_URL = "https://api.anthropic.com/v1";
const ANTHROPIC_VERSION = "2023-06-01";

/**
 * Output cap per call. Current Claude models (Haiku/Sonnet/Opus 5.x, Fable)
 * think on every request and thinking tokens count toward `max_tokens`, so the
 * old 2048 could be spent entirely on reasoning and leave no JSON. 16k stays
 * well inside non-streaming limits.
 */
const MAX_TOKENS = 16_000;

/**
 * Anthropic Claude provider. Auth uses `x-api-key` plus the `anthropic-version`
 * header. Validation and model listing hit `GET /v1/models`; generation uses
 * `POST /v1/messages` with a JSON-only system prompt.
 *
 * No sampling parameters are sent: `temperature` / `top_p` / `top_k` are
 * rejected with a 400 by current models ("`temperature` is deprecated for this
 * model"), and the defaults work fine on older ones. No `thinking` config
 * either — omitting it is the one setting every model accepts (newer models
 * think adaptively, older ones don't think).
 *
 * (The browser-only `anthropic-dangerous-direct-browser-access` header is not
 * needed here — Gitable runs in the Node-based extension host, not a browser.)
 */
export class ClaudeProvider implements AiProvider {
  private headers(apiKey: string): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "anthropic-version": ANTHROPIC_VERSION,
      "x-api-key": apiKey
    };
  }

  async validateApiKey(apiKey: string): Promise<boolean> {
    const response = await fetchWithTimeout(`${BASE_URL}/models`, {
      method: "GET",
      headers: this.headers(apiKey)
    });
    return response.ok;
  }

  async listModels(apiKey: string): Promise<string[]> {
    const response = await fetchWithTimeout(`${BASE_URL}/models`, {
      method: "GET",
      headers: this.headers(apiKey)
    });
    if (!response.ok) {
      await throwForStatus(response);
    }
    const data: any = await response.json();
    const items: any[] = Array.isArray(data?.data) ? data.data : [];
    // Anthropic's list is already only Claude chat models — sort newest first by
    // created_at (string ids don't order opus/sonnet/haiku correctly).
    return items
      .filter((m) => String(m?.id ?? "").toLowerCase().startsWith("claude-"))
      .sort((a, b) => String(b?.created_at ?? "").localeCompare(String(a?.created_at ?? "")))
      .map((m) => String(m.id))
      .filter(Boolean)
      .slice(0, MODEL_FETCH_LIMIT);
  }

  async generate(system: string, user: string, model: string, apiKey: string): Promise<string> {
    const response = await fetchWithTimeout(
      `${BASE_URL}/messages`,
      {
        method: "POST",
        headers: this.headers(apiKey),
        body: JSON.stringify({ model, system, max_tokens: MAX_TOKENS, messages: [{ role: "user", content: user }] })
      },
      AI_GENERATE_TIMEOUT_MS
    );
    if (!response.ok) await throwForStatus(response);
    const data: any = await response.json();
    const stopReason = String(data?.stop_reason ?? "");
    if (stopReason === "refusal") {
      const explanation = data?.stop_details?.explanation;
      throw new AiProviderError(
        `Claude declined this request${explanation ? `: ${explanation}` : "."} Try a different model or a smaller diff.`
      );
    }
    const blocks: any[] = Array.isArray(data?.content) ? data.content : [];
    const text = blocks.map((b) => (b?.type === "text" && typeof b?.text === "string" ? b.text : "")).join("").trim();
    if (!text) {
      throw new AiProviderError(
        stopReason === "max_tokens"
          ? "Claude ran out of output tokens before answering. Try a smaller selection or a lower token budget."
          : "Claude returned an empty response."
      );
    }
    return text;
  }

  async generateCommitMessage(input: GenerateCommitMessageInput, apiKey: string): Promise<GeneratedCommitMessage> {
    const { system, user } = buildCommitPrompt(input.diff, input.diffStat);
    return parseGeneratedMessage(await this.generate(system, user, input.model, apiKey));
  }
}
