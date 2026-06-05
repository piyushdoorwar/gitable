import * as vscode from "vscode";
import { ProviderId, secretKeyFor } from "../constants";

/**
 * Stores and retrieves AI provider API keys using VS Code SecretStorage.
 * Keys are never written to settings, globalState, or any plain-text file.
 */
export class SecretService {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  async getApiKey(provider: ProviderId): Promise<string | undefined> {
    return this.secrets.get(secretKeyFor(provider));
  }

  async setApiKey(provider: ProviderId, apiKey: string): Promise<void> {
    await this.secrets.store(secretKeyFor(provider), apiKey);
  }

  async deleteApiKey(provider: ProviderId): Promise<void> {
    await this.secrets.delete(secretKeyFor(provider));
  }

  async hasApiKey(provider: ProviderId): Promise<boolean> {
    const key = await this.getApiKey(provider);
    return !!key && key.length > 0;
  }
}
