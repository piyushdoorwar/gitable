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
  validateApiKey: "gitable.validateApiKey",
  push: "gitable.push",
  pull: "gitable.pull",
  createBranch: "gitable.createBranch",
  switchBranch: "gitable.switchBranch"
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
 * Maximum number of models shown in the model dropdown after filtering, so the
 * list stays small as providers keep adding SKUs. Models are never hardcoded —
 * they are fetched live from the provider once the API key is set.
 */
export const MODEL_FETCH_LIMIT = 12;
