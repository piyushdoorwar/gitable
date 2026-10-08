import type { OutputSchema } from "./prompts";

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

  /**
   * Calls the provider with custom system/user prompts and returns the raw text
   * response. With `schema`, the reply is constrained to that JSON Schema where
   * the model supports it (see {@link withSchemaFallback}).
   */
  generate(system: string, user: string, model: string, apiKey: string, schema?: OutputSchema): Promise<string>;
}

export interface SecurityFinding {
  severity: "critical" | "high" | "medium" | "low" | "info";
  category: string;
  title: string;
  detail: string;
}

export interface SecurityReview {
  findings: SecurityFinding[];
  safe: boolean;
}

export function parseSecurityReview(text: string): SecurityReview {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    try {
      const parsed = JSON.parse(cleaned.slice(start, end + 1)) as any;
      if (Array.isArray(parsed?.findings)) {
        const SEVERITIES = new Set(["critical", "high", "medium", "low", "info"]);
        const findings: SecurityFinding[] = parsed.findings.map((f: any) => ({
          severity: SEVERITIES.has(String(f?.severity)) ? (f.severity as SecurityFinding["severity"]) : "info",
          category: String(f?.category ?? "Security"),
          title: String(f?.title ?? "Issue"),
          detail: String(f?.detail ?? "")
        }));
        return { findings, safe: findings.length === 0 || !!parsed.safe };
      }
    } catch {
      // Fall through to plain-text fallback.
    }
  }
  return {
    findings: [{ severity: "info", category: "Analysis", title: "Security review", detail: text.trim() }],
    safe: false
  };
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

/**
 * Runs a request with schema-constrained output, retrying once without the
 * schema on a 400. Older models (e.g. pre-4.5 Claude, gpt-4-turbo, Gemini 1.5)
 * reject the schema parameter; they fall back to plain JSON mode (OpenAI,
 * Gemini) or the JSON-only prompt (Claude) plus the defensive parsers below. A 400 for any other reason fails again on
 * the retry and surfaces its real message.
 */
export async function withSchemaFallback<T>(
  schema: OutputSchema | undefined,
  run: (schema: OutputSchema | undefined) => Promise<T>
): Promise<T> {
  if (!schema) return run(undefined);
  try {
    return await run(schema);
  } catch (err) {
    if (err instanceof AiProviderError && err.status === 400) return run(undefined);
    throw err;
  }
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
 * wrap JSON in markdown fences, add prose, or emit invalid JSON (an unescaped
 * `"` inside a string), so this is deliberately defensive: it strips fences,
 * isolates the outermost JSON object and parses it; failing that it pulls the
 * two fields out by position. A reply that looks like JSON but yields neither
 * is an error — it must never become the commit summary verbatim.
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
    const parsed = parseJsonObject(candidate) ?? extractMessageFields(candidate);
    const summary = typeof parsed?.summary === "string" ? parsed.summary.trim() : "";
    const description =
      typeof parsed?.description === "string" && parsed.description.trim()
        ? parsed.description.trim()
        : undefined;
    if (summary) {
      return { summary, description };
    }
  }

  if (cleaned.startsWith("{")) {
    throw new AiProviderError("The model returned malformed JSON. Please try again.");
  }
  const firstLine = cleaned.split("\n")[0].trim();
  return { summary: firstLine || "Update changes" };
}

function parseJsonObject(text: string): { summary?: unknown; description?: unknown } | undefined {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Salvages `{"summary": "...", "description": "..."}` whose strings contain
 * unescaped quotes: summary runs to the `", "description"` separator and
 * description to the final `"` before the closing brace.
 */
function extractMessageFields(text: string): { summary?: string; description?: string } | undefined {
  const match = /^\{\s*"summary"\s*:\s*"([\s\S]*?)"\s*(?:,\s*"description"\s*:\s*"([\s\S]*)"\s*)?\}$/.exec(text);
  if (!match) return undefined;
  return { summary: unescapeJsonString(match[1]), description: match[2] && unescapeJsonString(match[2]) };
}

function unescapeJsonString(value: string): string {
  return value.replace(/\\(["\\/bfnrt]|u[0-9a-fA-F]{4})/g, (_, esc: string) => {
    const map: Record<string, string> = { b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
    if (esc[0] === "u") return String.fromCharCode(parseInt(esc.slice(1), 16));
    return map[esc] ?? esc;
  });
}
