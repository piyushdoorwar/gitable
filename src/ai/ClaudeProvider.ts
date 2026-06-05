import {
  AiProvider,
  AiProviderError,
  GeneratedCommitMessage,
  GenerateCommitMessageInput,
  parseGeneratedMessage,
  throwForStatus
} from "./AiProvider";
import { buildCommitPrompt } from "./prompts";

const BASE_URL = "https://api.anthropic.com/v1";
const ANTHROPIC_VERSION = "2023-06-01";

/**
 * Anthropic Claude provider. Auth uses `x-api-key` plus the `anthropic-version`
 * header. Validation and model listing hit `GET /v1/models`; generation uses
 * `POST /v1/messages` with a JSON-only system prompt.
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
    const response = await fetch(`${BASE_URL}/models`, {
      method: "GET",
      headers: this.headers(apiKey)
    });
    return response.ok;
  }

  async listModels(apiKey: string): Promise<string[]> {
    const response = await fetch(`${BASE_URL}/models`, {
      method: "GET",
      headers: this.headers(apiKey)
    });
    if (!response.ok) {
      await throwForStatus(response);
    }
    const data: any = await response.json();
    const items: any[] = Array.isArray(data?.data) ? data.data : [];
    return items
      .filter((m) => String(m?.id ?? "").toLowerCase().startsWith("claude-"))
      .sort((a, b) => String(b?.created_at ?? "").localeCompare(String(a?.created_at ?? "")))
      .map((m) => String(m.id))
      .filter(Boolean)
      .slice(0, 30);
  }

  async generateCommitMessage(
    input: GenerateCommitMessageInput,
    apiKey: string
  ): Promise<GeneratedCommitMessage> {
    const { system, user } = buildCommitPrompt(input.diff, input.diffStat);
    const response = await fetch(`${BASE_URL}/messages`, {
      method: "POST",
      headers: this.headers(apiKey),
      body: JSON.stringify({
        model: input.model,
        system,
        max_tokens: 1024,
        temperature: 0.2,
        messages: [{ role: "user", content: user }]
      })
    });

    if (!response.ok) {
      await throwForStatus(response);
    }
    const data: any = await response.json();
    const blocks: any[] = Array.isArray(data?.content) ? data.content : [];
    const text = blocks
      .map((b) => (b?.type === "text" && typeof b?.text === "string" ? b.text : ""))
      .join("")
      .trim();
    if (!text) {
      throw new AiProviderError("Claude returned an empty response.");
    }
    return parseGeneratedMessage(text);
  }
}
