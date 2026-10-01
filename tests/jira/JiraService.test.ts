import { describe, expect, it } from "vitest";
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
