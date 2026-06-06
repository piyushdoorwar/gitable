export interface GenerateCommitMessageInput {
  diff: string;
  diffStat?: string;
  provider: string;
  model: string;
}

export interface GeneratedCommitMessage {
  summary: string;
  description?: string;
}

/**
 * Abstraction over an AI provider. Each concrete provider (OpenAI, Gemini,
 * Claude) talks to its vendor's HTTP API using the global `fetch` available in
 * the VS Code extension host (Node 18+).
 *
 * `apiKey` is supplied per call rather than stored on the instance so providers
 * stay stateless and keys never linger in memory longer than needed.
 */
export interface AiProvider {
  /** Returns true when the key is accepted by the provider. */
  validateApiKey(apiKey: string): Promise<boolean>;

  /** Lists model ids available to the key; used to populate the model dropdown. */
  listModels(apiKey: string): Promise<string[]>;

  /** Generates a commit message from a prepared diff. */
  generateCommitMessage(
    input: GenerateCommitMessageInput,
    apiKey: string
  ): Promise<GeneratedCommitMessage>;

  /** Calls the provider with custom system/user prompts and returns a parsed result. */
  generate(system: string, user: string, model: string, apiKey: string): Promise<GeneratedCommitMessage>;
}

/** Carries a user-friendly message plus the HTTP status, when available. */
export class AiProviderError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "AiProviderError";
  }
}

/**
 * Reads a provider error body and throws an {@link AiProviderError} with a
 * friendly message. Shared by all providers so error handling stays consistent.
 */
export async function throwForStatus(response: {
  status: number;
  json(): Promise<unknown>;
}): Promise<never> {
  let detail = "";
  try {
    const body: any = await response.json();
    detail = body?.error?.message || body?.message || "";
  } catch {
    // Body was not JSON — fall back to the status-based message.
  }
  throw new AiProviderError(mapStatusToMessage(response.status, detail), response.status);
}

/** Maps an HTTP status to a friendly, actionable message. */
export function mapStatusToMessage(status: number, fallback?: string): string {
  if (status === 401 || status === 403) {
    return `Invalid or unauthorized API key (${status}).`;
  }
  if (status === 404) {
    return `Model or endpoint not found (404). Check the selected model.`;
  }
  if (status === 429) {
    return `Rate limit reached (429). Please try again shortly.`;
  }
  if (status >= 500) {
    return `The provider is temporarily unavailable (${status}).`;
  }
  return fallback || `Provider request failed (${status}).`;
}

/**
 * Extracts a commit message from a model's text response. Models occasionally
 * wrap JSON in markdown fences or add prose, so this is deliberately defensive:
 * it strips fences, isolates the outermost JSON object, and parses that. If no
 * valid JSON is found, the whole text becomes the summary.
 */
export function parseGeneratedMessage(text: string): GeneratedCommitMessage {
  const cleaned = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    const candidate = cleaned.slice(start, end + 1);
    try {
      const parsed = JSON.parse(candidate) as { summary?: unknown; description?: unknown };
      const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
      const description =
        typeof parsed.description === "string" && parsed.description.trim()
          ? parsed.description.trim()
          : undefined;
      if (summary) {
        return { summary, description };
      }
    } catch {
      // Fall through to plain-text handling below.
    }
  }

  const firstLine = cleaned.split("\n")[0].trim();
  return { summary: firstLine || "Update changes" };
}
