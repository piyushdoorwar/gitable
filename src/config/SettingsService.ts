import * as vscode from "vscode";
import { DEFAULT_MODELS, DEFAULT_PROVIDER, ProviderId, PROVIDER_IDS, StateKeys } from "../constants";

/**
 * Persists non-sensitive preferences (selected provider and per-provider model)
 * in the extension's globalState. API keys live in {@link SecretService}, never here.
 */
export class SettingsService {
  constructor(private readonly state: vscode.Memento) {}

  getProvider(): ProviderId {
    const stored = this.state.get<string>(StateKeys.provider);
    if (stored && (PROVIDER_IDS as string[]).includes(stored)) {
      return stored as ProviderId;
    }
    return DEFAULT_PROVIDER;
  }

  async setProvider(provider: ProviderId): Promise<void> {
    await this.state.update(StateKeys.provider, provider);
  }

  getModel(provider: ProviderId): string {
    return this.state.get<string>(StateKeys.modelFor(provider)) ?? DEFAULT_MODELS[provider];
  }

  async setModel(provider: ProviderId, model: string): Promise<void> {
    await this.state.update(StateKeys.modelFor(provider), model);
  }
}
