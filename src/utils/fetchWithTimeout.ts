const TIMEOUT_MS = 45_000;

/**
 * Generation calls get a longer budget: current reasoning models (Claude with
 * always-on thinking, GPT-5 / o-series, Gemini 3) think before answering, and a
 * full 40k-char diff can take well over 45 s.
 */
export const AI_GENERATE_TIMEOUT_MS = 120_000;

export class RequestTimeoutError extends Error {
  constructor(timeoutMs: number = TIMEOUT_MS) {
    super(`Request timed out — took longer than ${Math.round(timeoutMs / 1000)} s. Check your network connection.`);
    this.name = "RequestTimeoutError";
  }
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new RequestTimeoutError(timeoutMs);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
