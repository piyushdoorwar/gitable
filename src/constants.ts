/**
 * Centralized identifiers and defaults for Gitable.
 * Keeping these in one place avoids magic strings scattered across the codebase.
 */

export const EXTENSION_ID = "gitable";
export const VIEW_ID = "gitable.panel";
export const OUTPUT_CHANNEL_NAME = "Gitable";

/** Command identifiers contributed in package.json. */
export const Commands = {
  refresh: "gitable.refresh",
  generateCommitMessage: "gitable.generateCommitMessage",
  commit: "gitable.commit",
  stageAll: "gitable.stageAll",
  unstageAll: "gitable.unstageAll",
  openSettings: "gitable.openSettings",
  validateApiKey: "gitable.validateApiKey"
} as const;

/** Supported AI providers. */
export type ProviderId = "openai" | "gemini" | "claude";

export const PROVIDER_IDS: ProviderId[] = ["openai", "gemini", "claude"];

/** SecretStorage key for a provider's API key. Keys are never stored anywhere else. */
export function secretKeyFor(provider: ProviderId): string {
  return `gitable.${provider}.apiKey`;
}

/** globalState keys for non-sensitive settings. */
export const StateKeys = {
  provider: "gitable.provider",
  /** model is stored per provider so each remembers its own choice */
  modelFor: (provider: ProviderId) => `gitable.model.${provider}`
};

export const DEFAULT_PROVIDER: ProviderId = "openai";

/** Maximum diff size (characters) sent to an AI provider. */
export const MAX_DIFF_CHARS = 40000;

/** Number of commits shown in the History tab. */
export const HISTORY_LIMIT = 30;

/**
 * Static fallback model lists, used when the provider's /models endpoint
 * cannot be reached (e.g. no key yet or a network error).
 */
export const FALLBACK_MODELS: Record<ProviderId, string[]> = {
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini"],
  gemini: ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.0-flash"],
  claude: ["claude-sonnet-4-6", "claude-opus-4-8", "claude-haiku-4-5-20251001"]
};

export const DEFAULT_MODELS: Record<ProviderId, string> = {
  openai: "gpt-4o-mini",
  gemini: "gemini-1.5-flash",
  claude: "claude-sonnet-4-6"
};
