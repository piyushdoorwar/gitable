import { execFile } from "child_process";
import { readFile, writeFile } from "fs/promises";
import * as path from "path";
import * as vscode from "vscode";
import { Logger } from "../utils/Logger";
import { GitService, GitServiceError } from "./GitService";
import { cliStatusToLetter, CommitInfo, CommitStat, FileChange, RebaseState, RepoChanges, RepoSummary, StashEntry, SyncInfo } from "./models";

/** Strip surrounding double-quotes that git adds to paths containing spaces or special chars. */
function unquoteGitPath(p: string): string {
  return p.startsWith('"') && p.endsWith('"') ? p.slice(1, -1) : p;
}

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
    const output = await this.run(["-c", "core.quotepath=false", "status", "--porcelain", "--untracked-files=all"], root);
    const staged: FileChange[] = [];
    const unstaged: FileChange[] = [];
    const conflicts: FileChange[] = [];

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
        originalPath = unquoteGitPath(filePath.slice(0, arrow));
        filePath = unquoteGitPath(filePath.slice(arrow + 4));
      } else {
        filePath = unquoteGitPath(filePath);
      }

      // Git can report untracked directories as "dir/" — skip these directory-only entries.
      if (filePath.endsWith("/")) {
        continue;
      }

      // Merge conflict: U in either XY column, or both-added (AA), both-deleted (DD).
      const isConflict =
        x === "U" || y === "U" || (x === "A" && y === "A") || (x === "D" && y === "D");
      if (isConflict) {
        conflicts.push({ path: filePath, displayPath: filePath, status: "X", staged: false });
        continue;
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
    return { staged, unstaged, conflicts };
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

  async amend(summary: string, description?: string): Promise<void> {
    const args = ["commit", "--amend", "--no-edit", "-m", summary];
    if (description && description.trim()) {
      args.push("-m", description);
    }
    await this.run(args, this.requireRoot());
  }

  async getLastCommitMessage(): Promise<{ summary: string; description: string } | null> {
    try {
      const out = await this.run(["log", "-1", "--format=%B"], this.requireRoot());
      const trimmed = out.trim();
      if (!trimmed) return null;
      const idx = trimmed.indexOf("\n");
      if (idx === -1) return { summary: trimmed, description: "" };
      return {
        summary: trimmed.slice(0, idx).trim(),
        description: trimmed.slice(idx).trim()
      };
    } catch {
      return null;
    }
  }

  async getHistory(limit: number): Promise<CommitInfo[]> {
    const root = this.requireRoot();
    try {
      const output = await this.run(
        ["log", "--decorate=short", `--pretty=format:%H%x09%an%x09%ar%x09%D%x09%s`, "-n", String(limit)],
        root
      );
      return output
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => {
          const [hash, author, relativeDate, decorations, ...subjectParts] = line.split("\t");
          return {
            hash: hash ?? "",
            author: author ?? "",
            relativeDate: relativeDate ?? "",
            subject: subjectParts.join("\t"),
            tags: this.parseDecoratedTags(decorations ?? "")
          };
        });
    } catch {
      // A brand-new repository with no commits makes `git log` fail — treat as empty.
      return [];
    }
  }

  private parseDecoratedTags(decorations: string): string[] {
    return decorations
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.startsWith("tag: "))
      .map((part) => part.slice("tag: ".length).trim())
      .filter(Boolean);
  }

  /** Files changed by a single commit (vs its parent; root commit shows all). */
  async getCommitFiles(hash: string): Promise<FileChange[]> {
    const root = this.requireRoot();
    const output = await this.run(
      ["-c", "core.quotepath=false", "diff-tree", "--no-commit-id", "--name-status", "-r", "-M", "--root", hash],
      root
    );
    const files: FileChange[] = [];
    for (const line of output.split("\n")) {
      if (!line.trim()) {
        continue;
      }
      const parts = line.split("\t");
      const letter = parts[0].trim().charAt(0).toUpperCase();
      // Renames/copies report "R100\told\tnew" — use the new path.
      const rawPath = (letter === "R" || letter === "C") && parts[2] ? parts[2] : parts[1];
      if (!rawPath) {
        continue;
      }
      const filePath = unquoteGitPath(rawPath);
      files.push({
        path: filePath,
        displayPath: filePath,
        status: cliStatusToLetter(letter),
        staged: false
      });
    }
    return files;
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

  async pushForce(): Promise<void> {
    await this.run(["push", "--force-with-lease"], this.requireRoot());
  }

  async getRemotes(): Promise<string[]> {
    const output = await this.run(["remote"], this.requireRoot());
    return output
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }

  async publishBranch(remote: string, branch: string): Promise<void> {
    await this.run(["push", "-u", remote, branch], this.requireRoot());
  }

  async setUpstream(remote: string, localBranch: string, remoteBranch: string): Promise<void> {
    await this.run(["branch", "--set-upstream-to", `${remote}/${remoteBranch}`, localBranch], this.requireRoot());
  }

  async pull(): Promise<void> {
    const root = this.requireRoot();
    // A bare `git pull` aborts with "Need to specify how to reconcile divergent
    // branches" when the local branch is both ahead and behind its upstream and
    // the user has not configured pull.rebase/pull.ff. Pass the strategy
    // explicitly so pulling works regardless of ambient config: honor an
    // explicit pull.rebase, otherwise default to a merge. --autostash carries a
    // dirty working tree (staged or unstaged) across the operation.
    const strategy = (await this.isPullRebaseConfigured(root)) ? "--rebase" : "--no-rebase";
    await this.run(["pull", strategy, "--autostash"], root);
  }

  /** Reads the effective pull.rebase config; true for rebase, false (the default) for merge. */
  private async isPullRebaseConfigured(root: string): Promise<boolean> {
    try {
      // pull.rebase may be true/false/interactive/merges — anything other than
      // "false" selects a rebase. Unset config makes git exit non-zero.
      const value = (await this.run(["config", "--get", "pull.rebase"], root)).trim().toLowerCase();
      return value !== "" && value !== "false";
    } catch {
      return false;
    }
  }

  async fetchOrigin(): Promise<void> {
    await this.run(["fetch", "origin"], this.requireRoot());
  }

  async revertCommit(hash: string): Promise<void> {
    await this.run(["revert", "--no-edit", hash], this.requireRoot());
  }

  async cherryPickCommit(hash: string): Promise<void> {
    await this.run(["cherry-pick", hash], this.requireRoot());
  }

  async getCommitDiff(hash: string): Promise<string> {
    return this.run(
      ["-c", "core.quotepath=false", "diff-tree", "-p", "--no-commit-id", "-r", "-M", "--root", hash],
      this.requireRoot()
    );
  }

  async renameBranch(oldName: string, newName: string): Promise<void> {
    await this.run(["branch", "-m", oldName, newName], this.requireRoot());
  }

  async deleteBranch(name: string): Promise<void> {
    await this.run(["branch", "-d", name], this.requireRoot());
  }

  async mergeBranch(name: string): Promise<void> {
    await this.run(["merge", name], this.requireRoot());
  }

  // openMergeEditor is handled by VsCodeGitService; this service has no VS Code commands.
  async openMergeEditor(_filePath: string): Promise<void> {}


  async stashStaged(): Promise<void> {
    await this.run(["stash", "push", "--staged"], this.requireRoot());
  }

  async stashAll(): Promise<void> {
    await this.run(["stash", "push", "--include-untracked"], this.requireRoot());
  }

  async stashList(): Promise<StashEntry[]> {
    const root = this.requireRoot();
    let output: string;
    try {
      output = await this.run(["stash", "list", "--format=%gd\t%gs\t%cr"], root);
    } catch {
      return [];
    }
    if (!output.trim()) return [];
    return output
      .trim()
      .split("\n")
      .map((line) => {
        const [ref = "", message = "", date = ""] = line.split("\t");
        const match = /stash@\{(\d+)\}/.exec(ref);
        return { index: match ? parseInt(match[1], 10) : 0, ref, message, date };
      });
  }

  async stashPop(ref: string): Promise<void> {
    await this.run(["stash", "pop", "--index", ref], this.requireRoot());
  }

  async stashApply(ref: string): Promise<void> {
    await this.run(["stash", "apply", "--index", ref], this.requireRoot());
  }

  async stashDrop(ref: string): Promise<void> {
    await this.run(["stash", "drop", ref], this.requireRoot());
  }

  async createTag(name: string, hash: string): Promise<void> {
    await this.run(["tag", name, hash], this.requireRoot());
  }

  async deleteTag(name: string): Promise<void> {
    await this.run(["tag", "-d", name], this.requireRoot());
  }

  async pushTag(name: string): Promise<void> {
    await this.run(["push", "origin", name], this.requireRoot());
  }

  async deleteTagFromOrigin(name: string): Promise<void> {
    await this.run(["push", "origin", "--delete", name], this.requireRoot());
  }

  async pushAllTags(): Promise<void> {
    await this.run(["push", "origin", "--tags"], this.requireRoot());
  }

  async addToGitignore(filePath: string): Promise<void> {
    const root = this.requireRoot();
    const gitignorePath = path.join(root, ".gitignore");
    let existing = "";
    try {
      existing = await readFile(gitignorePath, "utf8");
    } catch { /* file doesn't exist yet */ }
    const lines = existing.split("\n");
    if (lines.some((l) => l.trim() === filePath || l.trim() === `/${filePath}`)) {
      return;
    }
    const appended =
      existing.length && !existing.endsWith("\n")
        ? `${existing}\n${filePath}\n`
        : `${existing}${filePath}\n`;
    await writeFile(gitignorePath, appended, "utf8");
  }

  async undoLastCommit(): Promise<void> {
    await this.run(["reset", "--soft", "HEAD~1"], this.requireRoot());
  }

  async rebase(targetBranch: string): Promise<void> {
    await this.run(["rebase", targetBranch], this.requireRoot());
  }

  async rebaseContinue(): Promise<void> {
    // GIT_EDITOR=true prevents git from opening an editor for the commit message.
    await new Promise<void>((resolve, reject) => {
      execFile(
        "git",
        ["rebase", "--continue"],
        { cwd: this.requireRoot(), env: { ...process.env, GIT_EDITOR: "true" }, maxBuffer: 64 * 1024 * 1024, windowsHide: true },
        (error, _stdout, stderr) => {
          if (error) {
            reject(new GitServiceError((stderr || error.message).toString().trim(), error));
          } else {
            resolve();
          }
        }
      );
    });
  }

  async rebaseAbort(): Promise<void> {
    await this.run(["rebase", "--abort"], this.requireRoot());
  }

  async getRebaseState(): Promise<RebaseState> {
    const root = this.requireRoot();
    const gitDir = path.join(root, ".git");

    // git worktrees store rebase state under .git/worktrees/<name>/rebase-merge
    const candidates = [
      path.join(gitDir, "rebase-merge"),
      path.join(gitDir, "rebase-apply"),
    ];

    let stateDir: string | undefined;
    for (const dir of candidates) {
      try {
        await readFile(path.join(dir, "head-name"));
        stateDir = dir;
        break;
      } catch {
        // not present
      }
    }

    if (!stateDir) {
      return { inProgress: false };
    }

    const readFileText = async (filePath: string): Promise<string> => {
      try {
        return (await readFile(filePath, "utf8")).trim();
      } catch {
        return "";
      }
    };

    const headName = await readFileText(path.join(stateDir, "head-name"));
    const onto = await readFileText(path.join(stateDir, "onto"));

    // head-name is e.g. "refs/heads/feature-x" — strip the prefix
    const branch = headName.replace(/^refs\/heads\//, "");

    // "onto" is a commit SHA — resolve it to a short ref for display
    let ontoLabel = onto.slice(0, 7);
    try {
      const name = (await this.run(["name-rev", "--name-only", "--no-undefined", onto], root)).trim();
      // name-rev may return "main~0" style; strip suffix
      ontoLabel = name.replace(/[~^]\d*$/, "");
    } catch {
      // keep the short SHA
    }

    return { inProgress: true, branch, onto: ontoLabel };
  }

  async getCommitStat(hash: string): Promise<CommitStat> {
    const output = await this.run(
      ["-c", "core.quotepath=false", "diff-tree", "--no-commit-id", "--stat", "-r", "-M", "--root", hash],
      this.requireRoot()
    );
    const summary = output.trim().split("\n").pop() ?? "";
    const files = /(\d+) files? changed/.exec(summary);
    const ins = /(\d+) insertions?\(\+\)/.exec(summary);
    const del = /(\d+) deletions?\(-\)/.exec(summary);
    return {
      files: files ? parseInt(files[1], 10) : 0,
      insertions: ins ? parseInt(ins[1], 10) : 0,
      deletions: del ? parseInt(del[1], 10) : 0
    };
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
