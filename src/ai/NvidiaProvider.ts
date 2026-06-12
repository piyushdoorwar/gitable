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
import { fetchWithTimeout } from "../utils/fetchWithTimeout";

const BASE_URL = "https://integrate.api.nvidia.com/v1";

/**
 * Filters to text/chat models only. NVIDIA's catalogue includes embedding,
 * reranking, vision, and audio models that are not useful for commit messages.
 */
function isNvidiaChatModel(id: string): boolean {
  const s = String(id || "").toLowerCase();
  if (/(embed|rerank|clip|neva|vlm|vision|image|audio|speech|tts|grounding|ocr|safety|guard|reward)/.test(s)) {
    return false;
  }
  return true;
}

/**
 * NVIDIA NIM provider. Uses an OpenAI-compatible chat completions API.
 * Free-tier models are available at https://build.nvidia.com/ — get an API key there.
 */
export class NvidiaProvider implements AiProvider {
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
    return items
      .map((m) => String(m?.id ?? ""))
      .filter(Boolean)
      .filter(isNvidiaChatModel)
      .sort()
      .slice(0, MODEL_FETCH_LIMIT);
  }

  async generate(system: string, user: string, model: string, apiKey: string): Promise<string> {
    const response = await fetchWithTimeout(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        temperature: 0.2
      })
    });
    if (!response.ok) await throwForStatus(response);
    const data: any = await response.json();
    const content: string = data?.choices?.[0]?.message?.content ?? "";
    if (!content) throw new AiProviderError("NVIDIA returned an empty response.");
    return content;
  }

  async generateCommitMessage(input: GenerateCommitMessageInput, apiKey: string): Promise<GeneratedCommitMessage> {
    const { system, user } = buildCommitPrompt(input.diff, input.diffStat);
    return parseGeneratedMessage(await this.generate(system, user, input.model, apiKey));
  }
}
