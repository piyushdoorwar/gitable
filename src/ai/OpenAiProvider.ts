import {
  AiProvider,
  AiProviderError,
  GeneratedCommitMessage,
  GenerateCommitMessageInput,
  parseGeneratedMessage,
  throwForStatus
} from "./AiProvider";
import { buildCommitPrompt } from "./prompts";

const BASE_URL = "https://api.openai.com/v1";

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
    return items
      .filter((m) => OpenAiProvider.isChatModel(String(m?.id ?? "")))
      .sort((a, b) => (Number(b?.created) || 0) - (Number(a?.created) || 0))
      .map((m) => String(m.id))
      .filter(Boolean)
      .slice(0, 30);
  }

  async generateCommitMessage(
    input: GenerateCommitMessageInput,
    apiKey: string
  ): Promise<GeneratedCommitMessage> {
    const { system, user } = buildCommitPrompt(input.diff, input.diffStat);
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: input.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ],
        response_format: { type: "json_object" },
        temperature: 0.2
      })
    });

    if (!response.ok) {
      await throwForStatus(response);
    }
    const data: any = await response.json();
    const content: string = data?.choices?.[0]?.message?.content ?? "";
    if (!content) {
      throw new AiProviderError("OpenAI returned an empty response.");
    }
    return parseGeneratedMessage(content);
  }

  /** Keeps text-capable GPT models and drops audio/realtime/embeddings/etc. */
  private static isChatModel(id: string): boolean {
    if (!id.startsWith("gpt-")) {
      return false;
    }
    return !/(audio|realtime|transcribe|tts|whisper|image|embedding|moderation)/i.test(id);
  }
}
