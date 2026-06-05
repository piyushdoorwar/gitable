import { MAX_DIFF_CHARS } from "../constants";

export interface PreparedDiff {
  /** The cleaned (and possibly truncated) diff ready to send to an AI provider. */
  diff: string;
  /** True when the diff exceeded the size limit and was cut short. */
  truncated: boolean;
  /** Display paths of files removed because they are generated/noisy. */
  ignoredFiles: string[];
}

/**
 * Filters generated/noisy files out of a unified diff and caps its size before
 * it is sent to an AI provider. This keeps prompts focused and protects the
 * user's token budget.
 */
export class DiffLimiter {
  /** Glob-ish patterns matched against each file path in the diff. */
  private static readonly IGNORE_PATTERNS: RegExp[] = [
    /(^|\/)package-lock\.json$/,
    /(^|\/)yarn\.lock$/,
    /(^|\/)pnpm-lock\.yaml$/,
    /\.min\.js$/,
    /\.map$/,
    /(^|\/)dist\//,
    /(^|\/)build\//,
    /(^|\/)bin\//,
    /(^|\/)obj\//,
    /(^|\/)coverage\//
  ];

  static isIgnored(filePath: string): boolean {
    return DiffLimiter.IGNORE_PATTERNS.some((pattern) => pattern.test(filePath));
  }

  /**
   * Splits the raw diff into per-file sections, drops ignored files, then
   * truncates the remainder to {@link MAX_DIFF_CHARS}.
   */
  static prepare(rawDiff: string, maxChars: number = MAX_DIFF_CHARS): PreparedDiff {
    const ignoredFiles: string[] = [];

    if (!rawDiff || !rawDiff.trim()) {
      return { diff: "", truncated: false, ignoredFiles };
    }

    const sections = DiffLimiter.splitByFile(rawDiff);
    const kept: string[] = [];

    for (const section of sections) {
      const filePath = DiffLimiter.extractPath(section.header);
      if (filePath && DiffLimiter.isIgnored(filePath)) {
        ignoredFiles.push(filePath);
        continue;
      }
      kept.push(section.text);
    }

    let diff = kept.join("\n");
    let truncated = false;

    if (diff.length > maxChars) {
      diff = `${diff.slice(0, maxChars)}\n\n... [diff truncated by Gitable: exceeded ${maxChars} characters]`;
      truncated = true;
    }

    return { diff, truncated, ignoredFiles };
  }

  /** Splits a unified diff on `diff --git` boundaries while keeping each header. */
  private static splitByFile(rawDiff: string): Array<{ header: string; text: string }> {
    const lines = rawDiff.split("\n");
    const sections: Array<{ header: string; text: string }> = [];
    let current: { header: string; text: string } | null = null;

    for (const line of lines) {
      if (line.startsWith("diff --git")) {
        if (current) {
          sections.push(current);
        }
        current = { header: line, text: line };
      } else if (current) {
        current.text += `\n${line}`;
      } else {
        // Content before the first `diff --git` (rare) becomes its own section.
        current = { header: "", text: line };
      }
    }
    if (current) {
      sections.push(current);
    }
    return sections;
  }

  /** Extracts the b-side path from a `diff --git a/x b/x` header line. */
  private static extractPath(header: string): string | null {
    const match = header.match(/ b\/(.+)$/);
    if (match) {
      return match[1].trim();
    }
    return null;
  }
}
