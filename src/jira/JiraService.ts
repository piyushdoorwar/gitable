import * as vscode from "vscode";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";

export interface JiraConfig {
  baseUrl: string;
  email: string;
}

export interface JiraIssue {
  key: string;
  summary: string;
  status: string;
  type: string;
}

const SECRET_KEY = "gitable.jira.token";
const BASE_URL_KEY = "gitable.jira.baseUrl";
const EMAIL_KEY = "gitable.jira.email";

export class JiraService {
  /** Cached token presence — `hasToken` runs on every state build. */
  private tokenPresent: boolean | undefined;

  constructor(
    private readonly secrets: vscode.SecretStorage,
    private readonly state: vscode.Memento
  ) {
    secrets.onDidChange?.((e) => {
      if (e.key === SECRET_KEY) this.tokenPresent = undefined;
    });
  }

  getConfig(): JiraConfig {
    return {
      baseUrl: this.state.get<string>(BASE_URL_KEY) ?? "",
      email: this.state.get<string>(EMAIL_KEY) ?? "",
    };
  }

  async saveConfig(baseUrl: string, email: string): Promise<void> {
    await this.state.update(BASE_URL_KEY, JiraService.normalizeBaseUrl(baseUrl));
    await this.state.update(EMAIL_KEY, email.trim());
  }

  /**
   * Trims and strips trailing slashes, and insists on https: the API token goes
   * out as Basic auth on every request, so a plain-http URL would leak it.
   */
  static normalizeBaseUrl(raw: string): string {
    const trimmed = raw.trim().replace(/\/+$/, "");
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      throw new Error("Jira base URL is not a valid URL (e.g. https://yourcompany.atlassian.net).");
    }
    if (url.protocol !== "https:") {
      throw new Error("Jira base URL must use https:// — the API token would otherwise be sent unencrypted.");
    }
    return trimmed;
  }

  async getToken(): Promise<string | undefined> {
    return this.secrets.get(SECRET_KEY);
  }

  async saveToken(token: string): Promise<void> {
    await this.secrets.store(SECRET_KEY, token.trim());
    this.tokenPresent = undefined;
  }

  async hasToken(): Promise<boolean> {
    if (this.tokenPresent === undefined) {
      const t = await this.getToken();
      this.tokenPresent = !!t && t.length > 0;
    }
    return this.tokenPresent;
  }

  async validate(): Promise<void> {
    const { baseUrl, email } = this.getConfig();
    const token = await this.getToken();
    if (!baseUrl || !email || !token) {
      throw new Error("Jira base URL, email, and API token are all required.");
    }
    JiraService.normalizeBaseUrl(baseUrl); // refuse a stored non-https URL
    const res = await fetchWithTimeout(`${baseUrl}/rest/api/3/myself`, {
      headers: this.buildHeaders(email, token),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Jira returned ${res.status}${text ? `: ${text.slice(0, 120)}` : ""}`);
    }
  }

  async getMyIssues(query = ""): Promise<JiraIssue[]> {
    const { baseUrl, email } = this.getConfig();
    const token = await this.getToken();
    if (!baseUrl || !email || !token) {
      throw new Error("Jira is not configured. Add your credentials in Settings → Jira.");
    }
    JiraService.normalizeBaseUrl(baseUrl); // refuse a stored non-https URL
    const base = `assignee = currentUser() AND statusCategory != Done`;
    const jql = query.trim()
      ? `${base} AND text ~ "${query.replace(/"/g, '\\"')}" ORDER BY updated DESC`
      : `${base} ORDER BY updated DESC`;
    const url = `${baseUrl}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=50&fields=summary,status,issuetype`;
    const res = await fetchWithTimeout(url, { headers: this.buildHeaders(email, token) });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Jira returned ${res.status}${text ? `: ${text.slice(0, 120)}` : ""}`);
    }
    const data = (await res.json()) as {
      issues?: Array<{
        key?: string;
        fields?: {
          summary?: string;
          status?: { name?: string };
          issuetype?: { name?: string };
        };
      }>;
    };
    // Field-level permissions or custom schemes can omit any of these.
    return (data.issues ?? [])
      .filter((i) => !!i?.key)
      .map((i) => ({
        key: String(i.key),
        summary: i.fields?.summary ?? "",
        status: i.fields?.status?.name ?? "",
        type: i.fields?.issuetype?.name ?? "",
      }));
  }

  private buildHeaders(email: string, token: string): Record<string, string> {
    const encoded = Buffer.from(`${email}:${token}`).toString("base64");
    return {
      Authorization: `Basic ${encoded}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }
}
