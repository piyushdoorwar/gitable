import { execFile } from "child_process";
import * as path from "path";
import * as vscode from "vscode";
import { Logger } from "../utils/Logger";
import { GitService, GitServiceError } from "./GitService";
import { cliStatusToLetter, CommitInfo, FileChange, RepoChanges, RepoSummary, SyncInfo } from "./models";

/**
 * Git implementation backed by the `git` CLI via {@link execFile}.
 *
 * `execFile` (not `exec`) is used everywhere so arguments are passed as an array
 * and never interpreted by a shell — this keeps behaviour identical and safe on
 * Windows, macOS, and Linux regardless of paths containing spaces.
 *
 * Serves both as the fallback for {@link VsCodeGitService} and as a standalone
 * GitService when the built-in Git API is unavailable.
 */
export class GitCliService implements GitService {
  private static readonly branchStashPrefix = "Gitable saved changes for ";
  private activeRoot: string | undefined;

  constructor(private readonly logger: Logger) {}

  getActiveRoot(): string | undefined {
    return this.activeRoot;
  }

  setActiveRoot(root: string): void {
    this.activeRoot = root;
  }

  async listRepositories(): Promise<RepoSummary[]> {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const seen = new Map<string, RepoSummary>();

    for (const folder of folders) {
      try {
        const root = (await this.run(["rev-parse", "--show-toplevel"], folder.uri.fsPath)).trim();
        if (root && !seen.has(root)) {
          seen.set(root, {
            name: path.basename(root),
            root,
            branch: await this.readBranch(root)
          });
        }
      } catch {
        // Folder is not a Git repository — skip it.
      }
    }
    return Array.from(seen.values());
  }

  async getRepoSummary(): Promise<RepoSummary | undefined> {
    const root = this.requireRoot();
    return {
      name: path.basename(root),
      root,
      branch: await this.readBranch(root)
    };
  }

  async getChanges(): Promise<RepoChanges> {
    const root = this.requireRoot();
    const output = await this.run(["-c", "core.quotepath=false", "status", "--porcelain"], root);
    const staged: FileChange[] = [];
    const unstaged: FileChange[] = [];

    for (const line of output.split("\n")) {
      if (!line.trim()) {
        continue;
      }
      const x = line.charAt(0);
      const y = line.charAt(1);
      let filePath = line.slice(3);
      let originalPath: string | undefined;

      const arrow = filePath.indexOf(" -> ");
      if (arrow !== -1) {
        originalPath = filePath.slice(0, arrow);
        filePath = filePath.slice(arrow + 4);
      }

      if (x !== " " && x !== "?") {
        staged.push({
          path: filePath,
          displayPath: filePath,
          status: cliStatusToLetter(x),
          staged: true,
          originalPath
        });
      }
      if (y !== " ") {
        const status = x === "?" && y === "?" ? "U" : cliStatusToLetter(y);
        unstaged.push({ path: filePath, displayPath: filePath, status, staged: false, originalPath });
      }
    }
    return { staged, unstaged };
  }

  async getStagedDiff(): Promise<string> {
    return this.run(["-c", "core.quotepath=false", "diff", "--staged"], this.requireRoot());
  }

  async getUnstagedDiff(): Promise<string> {
    return this.run(["-c", "core.quotepath=false", "diff"], this.requireRoot());
  }

  async getStagedDiffStat(): Promise<string> {
    return this.run(["-c", "core.quotepath=false", "diff", "--staged", "--stat"], this.requireRoot());
  }

  async stageFiles(paths: string[]): Promise<void> {
    if (!paths.length) {
      return;
    }
    await this.run(["add", "--", ...paths], this.requireRoot());
  }

  async unstageFiles(paths: string[]): Promise<void> {
    if (!paths.length) {
      return;
    }
    await this.run(["reset", "HEAD", "--", ...paths], this.requireRoot());
  }

  async stageAll(): Promise<void> {
    await this.run(["add", "-A"], this.requireRoot());
  }

  async unstageAll(): Promise<void> {
    await this.run(["reset"], this.requireRoot());
  }

  async discardFiles(paths: string[], staged = false): Promise<void> {
    const unique = Array.from(new Set(paths.map((p) => String(p).trim()).filter(Boolean)));
    if (!unique.length) {
      return;
    }
    const root = this.requireRoot();
    if (staged) {
      await this.run(["restore", "--staged", "--worktree", "--", ...unique], root);
      return;
    }

    const changes = await this.getChanges();
    const statusByPath = new Map(changes.unstaged.map((change) => [change.path, change.status]));
    const untracked = unique.filter((filePath) => {
      const status = statusByPath.get(filePath);
      return status === "U" || status == null;
    });
    const tracked = unique.filter((filePath) => {
      const status = statusByPath.get(filePath);
      return status != null && status !== "U";
    });
    if (tracked.length) {
      await this.run(["restore", "--worktree", "--", ...tracked], root);
    }
    if (untracked.length) {
      await this.run(["clean", "-fd", "--", ...untracked], root);
    }
  }

  async commit(summary: string, description?: string): Promise<void> {
    const args = ["commit", "-m", summary];
    if (description && description.trim()) {
      args.push("-m", description);
    }
    await this.run(args, this.requireRoot());
  }

  async getHistory(limit: number): Promise<CommitInfo[]> {
    const root = this.requireRoot();
    try {
      const output = await this.run(
        ["log", `--pretty=format:%h%x09%an%x09%ar%x09%s`, "-n", String(limit)],
        root
      );
      return output
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => {
          const [hash, author, relativeDate, ...subjectParts] = line.split("\t");
          return {
            hash: hash ?? "",
            author: author ?? "",
            relativeDate: relativeDate ?? "",
            subject: subjectParts.join("\t")
          };
        });
    } catch {
      // A brand-new repository with no commits makes `git log` fail — treat as empty.
      return [];
    }
  }

  async getBranches(): Promise<string[]> {
    const output = await this.run(
      ["for-each-ref", "--format=%(refname:short)", "refs/heads"],
      this.requireRoot()
    );
    return output
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }

  async getSyncInfo(): Promise<SyncInfo> {
    const root = this.requireRoot();
    try {
      // left = upstream-only (behind), right = HEAD-only (ahead)
      const output = await this.run(
        ["rev-list", "--left-right", "--count", "@{upstream}...HEAD"],
        root
      );
      const [behind, ahead] = output.trim().split(/\s+/).map((n) => Number(n) || 0);
      return { ahead: ahead || 0, behind: behind || 0, hasUpstream: true };
    } catch {
      return { ahead: 0, behind: 0, hasUpstream: false };
    }
  }

  async createBranch(name: string): Promise<void> {
    await this.run(["checkout", "-b", name], this.requireRoot());
  }

  async checkoutBranch(name: string): Promise<void> {
    await this.run(["checkout", name], this.requireRoot());
  }

  async checkoutBranchWithLocalChanges(name: string): Promise<void> {
    const root = this.requireRoot();
    const stashed = await this.stashLocalChanges(`Gitable carry changes to ${name}`, root);
    try {
      await this.run(["checkout", name], root);
    } catch (error) {
      if (stashed) {
        await this.popLatestStash(root).catch((restoreError) => {
          this.logger.error("Failed to restore stashed changes after checkout failure.", restoreError);
        });
      }
      throw error;
    }
    if (stashed) {
      await this.popLatestStash(root);
    }
  }

  async checkoutBranchKeepingLocalChanges(sourceBranch: string, targetBranch: string): Promise<void> {
    const root = this.requireRoot();
    const stashed = await this.stashLocalChanges(this.branchStashMessage(sourceBranch), root);
    try {
      await this.run(["checkout", targetBranch], root);
    } catch (error) {
      if (stashed) {
        await this.popLatestStash(root).catch((restoreError) => {
          this.logger.error("Failed to restore stashed changes after checkout failure.", restoreError);
        });
      }
      throw error;
    }
  }

  async restoreSavedBranchChanges(branch: string): Promise<boolean> {
    const root = this.requireRoot();
    const stash = await this.findBranchStash(branch, root);
    if (!stash) {
      return false;
    }
    await this.run(["stash", "apply", "--index", stash], root);
    await this.run(["stash", "drop", stash], root);
    return true;
  }

  async push(): Promise<void> {
    await this.run(["push"], this.requireRoot());
  }

  async pull(): Promise<void> {
    await this.run(["pull"], this.requireRoot());
  }

  private async readBranch(root: string): Promise<string> {
    try {
      const branch = (await this.run(["rev-parse", "--abbrev-ref", "HEAD"], root)).trim();
      return branch === "HEAD" ? "(detached)" : branch;
    } catch {
      return "(no branch)";
    }
  }

  private branchStashMessage(branch: string): string {
    return `${GitCliService.branchStashPrefix}${branch}`;
  }

  private async stashLocalChanges(message: string, root: string): Promise<boolean> {
    const output = await this.run(["stash", "push", "--include-untracked", "-m", message], root);
    return !/No local changes to save/i.test(output);
  }

  private async popLatestStash(root: string): Promise<void> {
    await this.run(["stash", "pop", "--index"], root);
  }

  private async findBranchStash(branch: string, root: string): Promise<string | undefined> {
    const output = await this.run(["stash", "list", "--format=%gd%x09%s"], root);
    const marker = this.branchStashMessage(branch);
    const match = output
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [ref, ...subjectParts] = line.split("\t");
        return { ref, subject: subjectParts.join("\t") };
      })
      .find((item) => item.subject.endsWith(marker));
    return match?.ref;
  }

  private requireRoot(): string {
    if (!this.activeRoot) {
      throw new GitServiceError("No active Git repository.");
    }
    return this.activeRoot;
  }

  /** Runs `git <args>` in `cwd` and resolves with stdout. */
  private run(args: string[], cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(
        "git",
        args,
        { cwd, maxBuffer: 64 * 1024 * 1024, windowsHide: true },
        (error, stdout, stderr) => {
          if (error) {
            const message = (stderr || error.message || "git command failed").toString().trim();
            this.logger.error(`git ${args.join(" ")}`, message);
            reject(new GitServiceError(message, error));
            return;
          }
          resolve(stdout.toString());
        }
      );
    });
  }
}
