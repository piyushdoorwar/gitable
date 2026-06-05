import { ProviderId } from "../constants";
import { AiProvider } from "./AiProvider";
import { ClaudeProvider } from "./ClaudeProvider";
import { GeminiProvider } from "./GeminiProvider";
import { OpenAiProvider } from "./OpenAiProvider";

/** Creates the concrete {@link AiProvider} for a provider id. */
export class AiProviderFactory {
  static create(provider: ProviderId): AiProvider {
    switch (provider) {
      case "openai":
        return new OpenAiProvider();
      case "gemini":
        return new GeminiProvider();
      case "claude":
        return new ClaudeProvider();
      default:
        // Exhaustiveness guard — keeps the switch honest if ProviderId grows.
        throw new Error(`Unknown AI provider: ${provider}`);
    }
  }
}
