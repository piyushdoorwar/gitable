export interface CommitPrompt {
  system: string;
  user: string;
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
  return { system, user };
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
    "- Provide a description only when it adds value; otherwise omit it.",
    "- The description should explain the why/what at a high level, optionally as short bullet points.",
    "- Do not mention file names mechanically unless it genuinely helps the reader.",
    "- Return ONLY a JSON object, with no markdown fences or commentary.",
    'The JSON shape is: {"summary": string, "description"?: string}.'
  ].join("\n");

  const statBlock = diffStat && diffStat.trim() ? `Diff stat:\n${diffStat.trim()}\n\n` : "";
  const user = [
    "Generate a commit message for the following staged changes.",
    "",
    statBlock + "Unified diff:",
    diff
  ].join("\n");

  return { system, user };
}
