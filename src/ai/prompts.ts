/**
 * JSON Schema for the expected reply, passed to each provider's constrained
 * JSON mode (Claude `output_config.format`, OpenAI `json_schema`, Gemini
 * `responseJsonSchema`) so the model cannot emit malformed JSON — e.g. an
 * unescaped `"` inside the description, which once turned a whole JSON blob
 * into the commit summary. Kept to the subset all three accept: every object
 * has `additionalProperties: false` and lists every property as required.
 */
export interface OutputSchema {
  name: string;
  schema: Record<string, unknown>;
}

export interface CommitPrompt {
  system: string;
  user: string;
  schema: OutputSchema;
}

const string = { type: "string" };

/** `{summary, description}` — used by commit messages and commit summaries. */
export const COMMIT_MESSAGE_SCHEMA: OutputSchema = {
  name: "commit_message",
  schema: {
    type: "object",
    properties: { summary: string, description: string },
    required: ["summary", "description"],
    additionalProperties: false
  }
};

export const SECURITY_REVIEW_SCHEMA: OutputSchema = {
  name: "security_review",
  schema: {
    type: "object",
    properties: {
      findings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            severity: { type: "string", enum: ["critical", "high", "medium", "low", "info"] },
            category: string,
            title: string,
            detail: string
          },
          required: ["severity", "category", "title", "detail"],
          additionalProperties: false
        }
      },
      safe: { type: "boolean" }
    },
    required: ["findings", "safe"],
    additionalProperties: false
  }
};

/**
 * Builds the system + user prompt for a security review of a diff.
 * Focuses exclusively on real exploitable risks — not code quality.
 */
export function buildSecurityReviewPrompt(diff: string, diffStat?: string): CommitPrompt {
  const system = [
    "You are a security engineer performing a focused code security review.",
    "Analyze the provided diff ONLY for actual security vulnerabilities and risks.",
    "Do NOT report code quality, style, performance, or best-practice suggestions.",
    "",
    "Focus exclusively on:",
    "- OWASP Top 10 (injection, broken auth, sensitive data exposure, broken access control, security misconfiguration, XSS, SSRF, insecure deserialization, vulnerable components, logging failures)",
    "- Hardcoded credentials, API keys, tokens, secrets, or PII",
    "- Input validation bypasses, injection vectors, or user-controlled dangerous inputs",
    "- Authorization logic flaws: missing checks, privilege escalation, IDOR",
    "- Insecure data storage or transmission (plaintext passwords, unencrypted secrets)",
    "- Language/framework-specific pitfalls (eval, exec, unsafe deserialization, SQL string concatenation, path traversal)",
    "- Dangerous design: user input overriding security controls, credential persistence, unsafe redirects",
    "",
    "Return ONLY a JSON object — no markdown, no prose outside the JSON:",
    '{"findings":[{"severity":"critical"|"high"|"medium"|"low"|"info","category":"short category","title":"short title","detail":"explanation of risk and impact"}],"safe":boolean}',
    'Set "safe":true and "findings":[] only when there are genuinely no security concerns in the diff.'
  ].join("\n");

  const statBlock = diffStat && diffStat.trim() ? `Diff stat:\n${diffStat.trim()}\n\n` : "";
  const user = `Review the following code changes for security vulnerabilities only.\n\n${statBlock}Unified diff:\n${diff}`;
  return { system, user, schema: SECURITY_REVIEW_SCHEMA };
}

/**
 * Builds the system + user prompt for explaining a commit in plain English.
 * Returns JSON with summary (one sentence) + description (2-4 sentences).
 */
export function buildCommitSummaryPrompt(subject: string, diff: string): CommitPrompt {
  const system = [
    "You are a helpful code reviewer. Given a git commit diff, explain in plain English what was changed and why.",
    "Be concrete about what the code actually does — not just which files changed.",
    "Return ONLY a JSON object with no markdown fences or commentary.",
    'The JSON shape is: {"summary": string, "description": string}.',
    '"summary" is a single sentence (max 120 chars) capturing the main change.',
    '"description" is 2-4 sentences explaining what was done and the reasoning behind it.'
  ].join("\n");

  const commitLine = subject ? `Commit: ${subject}\n\n` : "";
  const user = `${commitLine}Diff:\n${diff}`;
  return { system, user, schema: COMMIT_MESSAGE_SCHEMA };
}

/**
 * Builds the system + user prompt pair for commit-message generation.
 * Encodes Gitable's rules: concise, Conventional Commits, imperative mood,
 * summary under ~72 chars, optional description, and JSON-only output.
 */
export function buildCommitPrompt(diff: string, diffStat?: string): CommitPrompt {
  const system = [
    "You are an expert software engineer that writes high-quality Git commit messages.",
    "Follow these rules strictly:",
    "- Use the Conventional Commits style (e.g. feat:, fix:, chore:, refactor:, docs:, test:).",
    "- The summary must be concise, in imperative mood, and under 72 characters where possible.",
    '- Provide a description only when it adds value; otherwise set it to "".',
    "- The description should explain the why/what at a high level, optionally as short bullet points.",
    "- Do not mention file names mechanically unless it genuinely helps the reader.",
    "- Return ONLY a JSON object, with no markdown fences or commentary.",
    'The JSON shape is: {"summary": string, "description": string}.'
  ].join("\n");

  const statBlock = diffStat && diffStat.trim() ? `Diff stat:\n${diffStat.trim()}\n\n` : "";
  const user = [
    "Generate a commit message for the following staged changes.",
    "",
    statBlock + "Unified diff:",
    diff
  ].join("\n");

  return { system, user, schema: COMMIT_MESSAGE_SCHEMA };
}
