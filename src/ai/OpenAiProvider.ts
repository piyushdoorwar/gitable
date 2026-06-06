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
 * OpenAI provider. Validation and model listing use `GET /v1/models`; commit
 * messages use `POST /v1/chat/completions` with JSON-object response format,
 * which reliably yields the structured `{summary, description}` Gitable expects.
 */
export class OpenAiProvider implements AiProvider {
  async validateApiKey(apiKey: string): Promise<boolean> {
    const response = await fetch(`${BASE_URL}/models`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    return response.ok;
  }

  async listModels(apiKey: string): Promise<string[]> {
    const response = await fetch(`${BASE_URL}/models`, {
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

  async generate(system: string, user: string, model: string, apiKey: string): Promise<string> {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        response_format: { type: "json_object" },
        temperature: 0.2
      })
    });
    if (!response.ok) await throwForStatus(response);
    const data: any = await response.json();
    const content: string = data?.choices?.[0]?.message?.content ?? "";
    if (!content) throw new AiProviderError("OpenAI returned an empty response.");
    return content;
  }

  async generateCommitMessage(input: GenerateCommitMessageInput, apiKey: string): Promise<GeneratedCommitMessage> {
    const { system, user } = buildCommitPrompt(input.diff, input.diffStat);
    return parseGeneratedMessage(await this.generate(system, user, input.model, apiKey));
  }
}
