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

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

/** Dated preview suffix, e.g. gemini-2.5-flash-preview-05-20. */
const DATED_PREVIEW = /-\d{2}-\d{2}$/;

/** Keeps the dropdown to main Gemini chat models (mirrors prompt-optimizer). */
function isMainGeminiModel(id: string): boolean {
  const s = String(id || "").toLowerCase();
  if (!s.startsWith("gemini-")) {
    return false; // drop gemma / learnlm / imagen / veo / aqa
  }
  // Drop non-text-chat variants: image generation, TTS, Live/native audio,
  // computer-use and robotics models all list `generateContent` too.
  if (/(embedding|aqa|imagen|veo|vision|tuning|thinking|image|tts|audio|live|computer-use|robotics)/.test(s)) {
    return false;
  }
  if (/(^|-)exp(-|$)/.test(s)) {
    return false;
  }
  if (DATED_PREVIEW.test(s)) {
    return false;
  }
  return true;
}

/**
 * Google Gemini provider. Auth uses the `x-goog-api-key` header. Validation and
 * model listing hit `GET /models`; generation uses `:generateContent` with
 * `responseMimeType: application/json` to force structured output.
 *
 * No `temperature`: Google recommends leaving Gemini 3 at its default (1.0) —
 * lowering it can cause looping or degraded reasoning — and the default suits
 * older models too.
 */
export class GeminiProvider implements AiProvider {
  async validateApiKey(apiKey: string): Promise<boolean> {
    const response = await fetchWithTimeout(`${BASE_URL}/models`, {
      method: "GET",
      headers: { "x-goog-api-key": apiKey }
    });
    return response.ok;
  }

  async listModels(apiKey: string): Promise<string[]> {
    const response = await fetchWithTimeout(`${BASE_URL}/models`, {
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
      .filter(isMainGeminiModel)
      .sort()
      .reverse()
      .slice(0, MODEL_FETCH_LIMIT);
  }

  async generate(system: string, user: string, model: string, apiKey: string): Promise<string> {
    const url = `${BASE_URL}/models/${encodeURIComponent(model)}:generateContent`;
    const response = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { responseMimeType: "application/json" }
        })
      },
      AI_GENERATE_TIMEOUT_MS
    );
    if (!response.ok) await throwForStatus(response);
    const data: any = await response.json();
    const blockReason = data?.promptFeedback?.blockReason;
    if (blockReason) throw new AiProviderError(`Gemini blocked this request (${blockReason}).`);

    const candidate = data?.candidates?.[0];
    const parts: any[] = candidate?.content?.parts ?? [];
    // Skip thought-summary parts (`thought: true`) — only the answer is JSON.
    const text = parts
      .map((p) => (!p?.thought && typeof p?.text === "string" ? p.text : ""))
      .join("")
      .trim();
    if (!text) {
      const finishReason = String(candidate?.finishReason ?? "");
      throw new AiProviderError(
        finishReason === "MAX_TOKENS"
          ? "Gemini ran out of output tokens before answering. Try a smaller selection or a lower token budget."
          : finishReason && finishReason !== "STOP"
            ? `Gemini stopped without an answer (${finishReason}).`
            : "Gemini returned an empty response."
      );
    }
    return text;
  }

  async generateCommitMessage(input: GenerateCommitMessageInput, apiKey: string): Promise<GeneratedCommitMessage> {
    const { system, user } = buildCommitPrompt(input.diff, input.diffStat);
    return parseGeneratedMessage(await this.generate(system, user, input.model, apiKey));
  }
}
