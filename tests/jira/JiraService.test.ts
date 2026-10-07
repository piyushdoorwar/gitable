import { describe, expect, it, vi } from "vitest";
import { JiraService } from "../../src/jira/JiraService";

describe("JiraService.normalizeBaseUrl", () => {
  it("trims whitespace and trailing slashes", () => {
    expect(JiraService.normalizeBaseUrl("  https://acme.atlassian.net///  ")).toBe("https://acme.atlassian.net");
  });

  it("rejects plain http, which would send the API token unencrypted", () => {
    expect(() => JiraService.normalizeBaseUrl("http://acme.atlassian.net")).toThrow(/https/);
  });

  it("rejects something that is not a URL", () => {
    expect(() => JiraService.normalizeBaseUrl("acme")).toThrow(/valid URL/);
  });
});

describe("JiraService.getMyIssues", () => {
  it("keeps a backslash followed by a quote inside the JQL search term", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ issues: [] }), { status: 200 })
    );
    const secrets = { get: async () => "token" } as unknown as ConstructorParameters<typeof JiraService>[0];
    const config: Record<string, string> = {
      "gitable.jira.baseUrl": "https://acme.atlassian.net",
      "gitable.jira.email": "user@example.com"
    };
    const state = {
      get: (key: string) => config[key]
    } as unknown as ConstructorParameters<typeof JiraService>[1];

    try {
      await new JiraService(secrets, state).getMyIssues(String.raw`abc\" OR statusCategory = Done`);
      const url = new URL(fetchMock.mock.calls[0][0] as string);
      expect(url.searchParams.get("jql")).toContain(
        String.raw`text ~ "abc\\\" OR statusCategory = Done" ORDER BY updated DESC`
      );
    } finally {
      fetchMock.mockRestore();
    }
  });
});
