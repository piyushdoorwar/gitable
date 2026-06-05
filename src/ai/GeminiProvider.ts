import {
  AiProvider,
  AiProviderError,
  GeneratedCommitMessage,
  GenerateCommitMessageInput,
  parseGeneratedMessage,
  throwForStatus
} from "./AiProvider";
import { buildCommitPrompt } from "./prompts";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

/**
 * Google Gemini provider. Auth uses the `x-goog-api-key` header. Validation and
 * model listing hit `GET /models`; generation uses `:generateContent` with
 * `responseMimeType: application/json` to force structured output.
 */
export class GeminiProvider implements AiProvider {
  async validateApiKey(apiKey: string): Promise<boolean> {
    const response = await fetch(`${BASE_URL}/models`, {
      method: "GET",
      headers: { "x-goog-api-key": apiKey }
    });
    return response.ok;
  }

  async listModels(apiKey: string): Promise<string[]> {
    const response = await fetch(`${BASE_URL}/models`, {
      method: "GET",
      headers: { "x-goog-api-key": apiKey }
    });
    if (!response.ok) {
      await throwForStatus(response);
    }
    const data: any = await response.json();
    const models: any[] = Array.isArray(data?.models) ? data.models : [];
    return models
      .filter(
        (m) =>
          Array.isArray(m?.supportedGenerationMethods) &&
          m.supportedGenerationMethods.includes("generateContent")
      )
      .map((m) => String(m?.name ?? "").replace(/^models\//, ""))
      .filter((id) => id.startsWith("gemini-"))
      .sort()
      .reverse()
      .slice(0, 30);
  }

  async generateCommitMessage(
    input: GenerateCommitMessageInput,
    apiKey: string
  ): Promise<GeneratedCommitMessage> {
    const { system, user } = buildCommitPrompt(input.diff, input.diffStat);
    const url = `${BASE_URL}/models/${encodeURIComponent(input.model)}:generateContent`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json"
        }
      })
    });

    if (!response.ok) {
      await throwForStatus(response);
    }
    const data: any = await response.json();
    const parts: any[] = data?.candidates?.[0]?.content?.parts ?? [];
    const text = parts
      .map((p) => (typeof p?.text === "string" ? p.text : ""))
      .join("")
      .trim();
    if (!text) {
      throw new AiProviderError("Gemini returned an empty response.");
    }
    return parseGeneratedMessage(text);
  }
}
