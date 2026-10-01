import * as vscode from "vscode";
import { ProviderId, secretKeyFor } from "../constants";

/**
 * Stores and retrieves AI provider API keys using VS Code SecretStorage.
 * Keys are never written to settings, globalState, or any plain-text file.
 */
export class SecretService {
  /** `hasApiKey` runs on every state build; a keyring round-trip each time is
   *  slow on some platforms (libsecret), so presence is cached until it changes. */
  private readonly presence = new Map<ProviderId, boolean>();

  constructor(private readonly secrets: vscode.SecretStorage) {
    // Another window can store or delete a key — drop the cache when it does.
    secrets.onDidChange?.(() => this.presence.clear());
  }

  async getApiKey(provider: ProviderId): Promise<string | undefined> {
    return this.secrets.get(secretKeyFor(provider));
  }

  async setApiKey(provider: ProviderId, apiKey: string): Promise<void> {
    await this.secrets.store(secretKeyFor(provider), apiKey);
    this.presence.delete(provider);
  }

  async deleteApiKey(provider: ProviderId): Promise<void> {
    await this.secrets.delete(secretKeyFor(provider));
    this.presence.delete(provider);
  }

  async hasApiKey(provider: ProviderId): Promise<boolean> {
    const cached = this.presence.get(provider);
    if (cached !== undefined) {
      return cached;
    }
    const key = await this.getApiKey(provider);
    const present = !!key && key.length > 0;
    this.presence.set(provider, present);
    return present;
  }
}
