import * as vscode from "vscode";

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
  constructor(
    private readonly secrets: vscode.SecretStorage,
    private readonly state: vscode.Memento
  ) {}

  getConfig(): JiraConfig {
    return {
      baseUrl: this.state.get<string>(BASE_URL_KEY) ?? "",
      email: this.state.get<string>(EMAIL_KEY) ?? "",
    };
  }

  async saveConfig(baseUrl: string, email: string): Promise<void> {
    await this.state.update(BASE_URL_KEY, baseUrl.replace(/\/$/, "").trim());
    await this.state.update(EMAIL_KEY, email.trim());
  }

  async getToken(): Promise<string | undefined> {
    return this.secrets.get(SECRET_KEY);
  }

  async saveToken(token: string): Promise<void> {
    await this.secrets.store(SECRET_KEY, token.trim());
  }

  async hasToken(): Promise<boolean> {
    const t = await this.getToken();
    return !!t && t.length > 0;
  }

  async validate(): Promise<void> {
    const { baseUrl, email } = this.getConfig();
    const token = await this.getToken();
    if (!baseUrl || !email || !token) {
      throw new Error("Jira base URL, email, and API token are all required.");
    }
    const res = await fetch(`${baseUrl}/rest/api/3/myself`, {
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
    const base = `assignee = currentUser() AND statusCategory != Done`;
    const jql = query.trim()
      ? `${base} AND text ~ "${query.replace(/"/g, '\\"')}" ORDER BY updated DESC`
      : `${base} ORDER BY updated DESC`;
    const url = `${baseUrl}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=50&fields=summary,status,issuetype`;
    const res = await fetch(url, { headers: this.buildHeaders(email, token) });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Jira returned ${res.status}${text ? `: ${text.slice(0, 120)}` : ""}`);
    }
    const data = (await res.json()) as {
      issues?: Array<{
        key: string;
        fields: {
          summary: string;
          status: { name: string };
          issuetype: { name: string };
        };
      }>;
    };
    return (data.issues ?? []).map((i) => ({
      key: i.key,
      summary: i.fields.summary,
      status: i.fields.status.name,
      type: i.fields.issuetype.name,
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
