import { execFile } from "child_process";
import { readFile, writeFile } from "fs/promises";
import * as path from "path";
import * as vscode from "vscode";
import { Logger } from "../utils/Logger";
import { GitService, GitServiceError, PullStrategy } from "./GitService";
import {
  cliStatusToLetter,
  CommitInfo,
  CommitStat,
  conflictKindFromXY,
  FileChange,
  OperationKind,
  OperationState,
  RebaseState,
  RepoChanges,
  RepoSummary,
  StashEntry,
  StashRestoreResult,
  SyncInfo
} from "./models";

/** Which side of an unmerged path to keep, in git's own stage terms. */
export type ConflictSide = "ours" | "theirs";

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
  /** Git failed only because another process held the repository lock. */
  private static readonly lockErrorPattern =
    /\.lock': File exists|Another git process seems to be running|cannot lock ref/i;
  /** Backoff before each retry of a lock-contended command. */
  private static readonly lockRetryDelaysMs = [80, 200, 450];
  private activeRoot: string | undefined;
  private readonly gitDirs = new Map<string, string>();

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
    // `-z` gives NUL-separated, never-quoted paths: the newline form quotes and
    // C-escapes paths with spaces, quotes or non-ASCII bytes, and renders renames
    // as "old -> new", which is ambiguous for a file literally named "a -> b".
    // `--no-optional-locks` stops status from taking index.lock to refresh stat
    // info, which otherwise collides with VS Code's Git extension and our own
    // staging/commit commands.
    const output = await this.run(
      ["--no-optional-locks", "status", "--porcelain", "-z", "--untracked-files=all"],
      root
    );
    const staged: FileChange[] = [];
    const unstaged: FileChange[] = [];
    const conflicts: FileChange[] = [];

    const entries = output.split("\0");
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (entry.length < 4) {
        continue;
      }
      const x = entry.charAt(0);
      const y = entry.charAt(1);
      const filePath = entry.slice(3);
      let originalPath: string | undefined;
      // Renames and copies carry their source path as the next NUL-separated field.
      if (x === "R" || x === "C" || y === "R" || y === "C") {
        originalPath = entries[++i] || undefined;
      }

      // Git can report untracked directories as "dir/" — skip these directory-only entries.
      if (filePath.endsWith("/")) {
        continue;
      }

      // Merge conflict: U in either XY column, or both-added (AA), both-deleted (DD).
      const conflict = conflictKindFromXY(x, y);
      if (conflict) {
        conflicts.push({ path: filePath, displayPath: filePath, status: "X", staged: false, conflict });
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
      // Independent reads — run them side by side.
      const [unpushed, output] = await Promise.all([
        this.getUnpushedHashes(root),
        this.run(
          ["log", "--decorate=short", `--pretty=format:%H%x09%an%x09%ar%x09%D%x09%s`, "-n", String(limit)],
          root
        )
      ]);
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
            tags: this.parseDecoratedTags(decorations ?? ""),
            unpushed: unpushed.has(hash ?? "")
          };
        });
    } catch {
      // A brand-new repository with no commits makes `git log` fail — treat as empty.
      return [];
    }
  }

  /** Hashes of commits reachable from HEAD but not from any remote-tracking ref.
   *  `--remotes` covers every remote, so this stays correct for branches that
   *  track an upstream, are published under a different name, or have no upstream
   *  yet (with no remotes, every HEAD commit is reported as local). */
  private async getUnpushedHashes(root: string): Promise<Set<string>> {
    try {
      const output = await this.run(["rev-list", "HEAD", "--not", "--remotes"], root);
      return new Set(
        output
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
      );
    } catch {
      return new Set();
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
    // `-z`: NUL-separated fields with raw (unquoted) paths — "M\0path\0" or, for
    // renames/copies, "R100\0old\0new\0".
    const output = await this.run(
      ["diff-tree", "-z", "--no-commit-id", "--name-status", "-r", "-M", "--root", hash],
      root
    );
    const files: FileChange[] = [];
    const fields = output.split("\0");
    for (let i = 0; i < fields.length; i++) {
      const code = fields[i].trim();
      if (!code) {
        continue;
      }
      const letter = code.charAt(0).toUpperCase();
      const isPair = letter === "R" || letter === "C";
      const filePath = isPair ? fields[i + 2] : fields[i + 1];
      i += isPair ? 2 : 1;
      if (!filePath) {
        continue;
      }
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

  async checkoutBranchWithLocalChanges(name: string): Promise<{ stash?: string; restore?: StashRestoreResult }> {
    const root = this.requireRoot();
    const stash = await this.stashPush(`Gitable carry changes to ${name}`, root);
    try {
      await this.run(["checkout", name], root);
    } catch (error) {
      if (stash) {
        await this.restoreStash(stash).catch((restoreError) => {
          this.logger.error("Failed to restore stashed changes after checkout failure.", restoreError);
        });
      }
      throw error;
    }
    return stash ? { stash, restore: await this.restoreStash(stash) } : {};
  }

  async checkoutBranchKeepingLocalChanges(sourceBranch: string, targetBranch: string): Promise<void> {
    const root = this.requireRoot();
    const stash = await this.stashPush(this.branchStashMessage(sourceBranch), root);
    try {
      await this.run(["checkout", targetBranch], root);
    } catch (error) {
      if (stash) {
        await this.restoreStash(stash).catch((restoreError) => {
          this.logger.error("Failed to restore stashed changes after checkout failure.", restoreError);
        });
      }
      throw error;
    }
  }

  async restoreSavedBranchChanges(branch: string): Promise<{ stash: string; restore: StashRestoreResult } | undefined> {
    const root = this.requireRoot();
    const stash = await this.findBranchStash(branch, root);
    if (!stash) {
      return undefined;
    }
    return { stash, restore: await this.restoreStash(stash) };
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

  async pull(strategy?: PullStrategy): Promise<void> {
    const root = this.requireRoot();
    // A bare `git pull` aborts with "Need to specify how to reconcile divergent
    // branches" when the local branch is both ahead and behind its upstream and
    // the user has not configured pull.rebase/pull.ff. The caller passes an
    // explicit strategy for the divergent case (chosen by the user); a plain
    // fast-forward pull (branch only behind) needs no flag. We do NOT use
    // --autostash here — the provider wraps dirty trees in an explicit
    // stash → pull → restore so there is a single conflict surface, and a
    // rebase pull leaves .git/rebase-merge for the Continue/Abort flow to catch.
    const flag = strategy === "rebase" ? ["--rebase"] : strategy === "merge" ? ["--no-rebase"] : [];
    await this.run(["pull", ...flag], root);
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

  async deleteBranch(name: string, force = false): Promise<void> {
    await this.run(["branch", force ? "-D" : "-d", name], this.requireRoot());
  }

  async mergeBranch(name: string): Promise<void> {
    await this.run(["merge", name], this.requireRoot());
  }

  // openMergeEditor is handled by VsCodeGitService; this service has no VS Code commands.
  async openMergeEditor(_filePath: string): Promise<void> {}


  async stashStaged(): Promise<void> {
    await this.run(["stash", "push", "--staged"], this.requireRoot());
  }

  /** Stashes the given paths' changes (untracked files included), leaving every
   *  other file — and anything already staged elsewhere — untouched. */
  async stashFiles(paths: string[], message?: string): Promise<void> {
    if (!paths.length) {
      return;
    }
    const args = ["stash", "push", "--include-untracked"];
    if (message && message.trim()) {
      args.push("-m", message.trim());
    }
    await this.run([...args, "--", ...paths], this.requireRoot());
  }

  async stashAll(message = "Gitable auto-stash before pull"): Promise<string | undefined> {
    // Labelled so a stash left behind by a conflicting restore is recognisable.
    return this.stashPush(message, this.requireRoot());
  }

  /**
   * Re-applies a stash Gitable created on the user's behalf (pull, branch carry),
   * following git's own advice at each failure instead of giving up:
   *
   * 1. `stash apply --index` — restores staged vs unstaged exactly.
   * 2. "Conflicts in index. Try without --index." — git applied *nothing*; retry
   *    without `--index` and re-stage the files that were fully staged.
   * 3. Content conflicts — leave the conflict markers for the user and keep the
   *    stash; {@link finishStashRestore} drops it once they are resolved.
   * 4. An untracked file of ours now exists upstream ("already exists, no
   *    checkout") — git has applied everything else; identical copies need
   *    nothing, differing ones become ordinary add/add conflicts.
   *
   * Always addresses the stash by commit SHA, never `stash@{0}`, which shifts as
   * other stashes are pushed or popped.
   */
  async restoreStash(sha: string): Promise<StashRestoreResult> {
    const root = this.requireRoot();
    let failure = "";
    try {
      await this.run(["stash", "apply", "--index", sha], root);
      await this.dropStash(sha, root);
      return { status: "restored" };
    } catch (error) {
      failure = errorText(error);
    }

    if (/conflicts in index|without --index/i.test(failure)) {
      try {
        await this.run(["stash", "apply", sha], root);
        await this.restageFromStash(sha, [], root);
        await this.dropStash(sha, root);
        return { status: "restored" };
      } catch (error) {
        failure = errorText(error);
      }
    }

    const collisions = [...failure.matchAll(/^(.+?) already exists, no checkout$/gm)].map((m) => m[1].trim());
    for (const file of collisions) {
      await this.conflictUntrackedCollision(sha, file, root);
    }

    const conflicts = (await this.getChanges()).conflicts.map((f) => f.path);
    if (conflicts.length > 0) {
      return { status: "conflicts", files: conflicts };
    }
    if (collisions.length > 0) {
      // Every collision was identical to upstream's copy — nothing is missing.
      await this.dropStash(sha, root);
      return { status: "restored" };
    }
    return { status: "blocked", reason: failure || "git stash apply failed", files: [] };
  }

  /**
   * Completes a restore that stopped on conflicts, once they are resolved: drops
   * the stash and puts the index back the way the user had it — resolved files
   * become ordinary unstaged changes (git leaves them staged after `git add`),
   * and files that were fully staged when stashed are staged again.
   */
  async finishStashRestore(sha: string, conflictedFiles: string[]): Promise<void> {
    const root = this.requireRoot();
    await this.run(["reset", "-q"], root);
    await this.restageFromStash(sha, conflictedFiles, root);
    await this.dropStash(sha, root);
  }

  /**
   * Abandons a conflicted restore: resets tracked files to HEAD and removes the
   * untracked files the restore recreated (they'd collide on the next apply).
   * The stash itself is kept for the user to apply later.
   */
  async undoStashRestore(sha: string): Promise<void> {
    const root = this.requireRoot();
    await this.run(["reset", "--hard", "-q", "HEAD"], root);
    const untracked = (await this.run(["ls-tree", "-r", "-z", "--name-only", `${sha}^3`], root).catch(() => ""))
      .split("\0")
      .filter(Boolean);
    if (untracked.length > 0) {
      // `clean` only ever touches untracked paths, so files HEAD tracks are safe.
      await this.run(["clean", "-f", "-q", "--", ...untracked], root);
    }
  }

  /** True when the stash commit is still in the stash list. */
  async hasStash(sha: string): Promise<boolean> {
    return (await this.findStashRef(sha, this.requireRoot())) !== undefined;
  }

  async stashList(): Promise<StashEntry[]> {
    const root = this.requireRoot();
    let output: string;
    try {
      output = await this.run(["stash", "list", "--format=%gd\t%gs\t%cr\t%H"], root);
    } catch {
      return [];
    }
    if (!output.trim()) return [];
    return output
      .trim()
      .split("\n")
      .map((line) => {
        const [ref = "", subject = "", date = "", hash = ""] = line.split("\t");
        const match = /stash@\{(\d+)\}/.exec(ref);
        // Reflog subjects look like "WIP on <branch>: <msg>" or "On <branch>: <msg>".
        // Ref names can't contain ":", so the branch is everything up to the first colon.
        const parsed = /^(?:WIP on|On) ([^:]+): (.*)$/.exec(subject);
        return {
          index: match ? parseInt(match[1], 10) : 0,
          ref,
          message: parsed ? parsed[2] : subject,
          branch: parsed ? parsed[1] : undefined,
          date,
          hash: hash || undefined
        };
      });
  }

  async getOperationState(): Promise<OperationState> {
    const root = this.requireRoot();
    const rebase = await this.getRebaseState();
    if (rebase.inProgress) {
      return { kind: "rebase", branch: rebase.branch, onto: rebase.onto };
    }
    const gitDir = await this.resolveGitDir(root);
    const readHead = async (name: string): Promise<string> => {
      try {
        return (await readFile(path.join(gitDir, name), "utf8")).trim();
      } catch {
        return "";
      }
    };
    const merge = await readHead("MERGE_HEAD");
    if (merge) {
      let onto = merge.split("\n")[0].slice(0, 7);
      try {
        const name = (await this.run(["name-rev", "--name-only", "--no-undefined", merge.split("\n")[0]], root)).trim();
        onto = name.replace(/^remotes\//, "").replace(/[~^]\d*$/, "");
      } catch {
        // keep the short SHA
      }
      return { kind: "merge", onto };
    }
    const pick = await readHead("CHERRY_PICK_HEAD");
    if (pick) {
      return { kind: "cherry-pick", commit: pick.slice(0, 7) };
    }
    const revert = await readHead("REVERT_HEAD");
    if (revert) {
      return { kind: "revert", commit: revert.slice(0, 7) };
    }
    return { kind: null };
  }

  /**
   * Concludes a paused operation after its conflicts are resolved and staged.
   * The editor is suppressed so the prepared message is used. A cherry-pick or
   * revert whose resolution left nothing to commit is skipped, as git suggests —
   * a rebase already drops such a step on its own.
   */
  async continueOperation(kind: OperationKind): Promise<void> {
    const root = this.requireRoot();
    const env = { ...process.env, GIT_EDITOR: "true" };
    if (kind === "merge") {
      await this.run(["commit", "--no-edit"], root, env);
      return;
    }
    try {
      await this.run([kind, "--continue"], root, env);
    } catch (error) {
      if ((kind === "cherry-pick" || kind === "revert") && /now empty|nothing to commit/i.test(errorText(error))) {
        await this.run([kind, "--skip"], root, env);
        return;
      }
      throw error;
    }
  }

  async abortOperation(kind: OperationKind): Promise<void> {
    await this.run([kind, "--abort"], this.requireRoot());
  }

  /** Drops the current rebase / cherry-pick / revert step (merges have no steps). */
  async skipOperation(kind: Exclude<OperationKind, "merge">): Promise<void> {
    await this.run([kind, "--skip"], this.requireRoot(), { ...process.env, GIT_EDITOR: "true" });
  }

  /**
   * Resolves an unmerged path by taking one side wholesale and staging it. When
   * that side deleted the file (e.g. "deleted by them" + theirs), the deletion is
   * what gets staged.
   */
  async resolveConflict(filePath: string, side: ConflictSide): Promise<void> {
    const root = this.requireRoot();
    try {
      await this.run(["checkout", `--${side}`, "--", filePath], root);
    } catch (error) {
      if (/does not have (our|their) version/i.test(errorText(error))) {
        await this.run(["rm", "--quiet", "--", filePath], root);
        return;
      }
      throw error;
    }
    await this.run(["add", "--", filePath], root);
  }

  /** Marks unmerged paths resolved — `add -A` so a deletion is staged as one. */
  async markResolved(paths: string[]): Promise<void> {
    if (!paths.length) {
      return;
    }
    await this.run(["add", "-A", "--", ...paths], this.requireRoot());
  }

  /** True when the working copy still contains `<<<<<<<` / `>>>>>>>` conflict markers. */
  async hasConflictMarkers(filePath: string): Promise<boolean> {
    try {
      const text = await readFile(path.join(this.requireRoot(), filePath), "utf8");
      return /^(<{7}|>{7})(\s|$)/m.test(text);
    } catch {
      return false;
    }
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
    await this.run(["rebase", "--continue"], this.requireRoot(), {
      ...process.env,
      GIT_EDITOR: "true"
    });
  }

  async rebaseAbort(): Promise<void> {
    await this.run(["rebase", "--abort"], this.requireRoot());
  }

  async getRebaseState(): Promise<RebaseState> {
    const root = this.requireRoot();
    // Worktrees and submodules have a `.git` *file* pointing elsewhere, so the
    // rebase state lives under the real git dir, not `<root>/.git`.
    const gitDir = await this.resolveGitDir(root);

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

  /** Absolute git dir for `root`, resolved once per root (it never changes). */
  private async resolveGitDir(root: string): Promise<string> {
    const cached = this.gitDirs.get(root);
    if (cached) {
      return cached;
    }
    let gitDir = path.join(root, ".git");
    try {
      const resolved = (await this.run(["rev-parse", "--absolute-git-dir"], root)).trim();
      if (resolved) {
        gitDir = resolved;
      }
    } catch {
      // Fall back to the conventional location.
    }
    this.gitDirs.set(root, gitDir);
    return gitDir;
  }

  private branchStashMessage(branch: string): string {
    return `${GitCliService.branchStashPrefix}${branch}`;
  }

  /** Stashes everything (incl. untracked); returns the stash commit SHA, or
   *  undefined when there was nothing to stash. */
  private async stashPush(message: string, root: string): Promise<string | undefined> {
    const output = await this.run(["stash", "push", "--include-untracked", "-m", message], root);
    if (/No local changes to save/i.test(output)) {
      return undefined;
    }
    return (await this.run(["rev-parse", "stash@{0}"], root)).trim();
  }

  /** `stash@{N}` for a stash commit SHA — `stash drop` only accepts reflog refs. */
  private async findStashRef(sha: string, root: string): Promise<string | undefined> {
    const output = await this.run(["stash", "list", "--format=%gd%x09%H"], root).catch(() => "");
    for (const line of output.split("\n")) {
      const [ref, hash] = line.trim().split("\t");
      if (hash === sha) {
        return ref;
      }
    }
    return undefined;
  }

  private async dropStash(sha: string, root: string): Promise<void> {
    const ref = await this.findStashRef(sha, root);
    if (ref) {
      await this.run(["stash", "drop", ref], root);
    }
  }

  /**
   * Re-stages files that were *fully* staged when the stash was made (index
   * == working copy), skipping `exclude`. Partially staged files stay unstaged:
   * re-adding them would also stage the hunks the user had left out.
   */
  private async restageFromStash(sha: string, exclude: string[], root: string): Promise<void> {
    const names = async (args: string[]) =>
      (await this.run(["diff", "--name-only", "-z", ...args], root).catch(() => ""))
        .split("\0")
        .filter(Boolean);
    const staged = await names([`${sha}^1`, `${sha}^2`]);
    if (staged.length === 0) {
      return;
    }
    const partial = new Set(await names([`${sha}^2`, sha]));
    const skip = new Set(exclude);
    const paths = staged.filter((p) => !partial.has(p) && !skip.has(p));
    if (paths.length > 0) {
      await this.run(["add", "-A", "--", ...paths], root);
    }
  }

  /**
   * An untracked file we stashed now exists in HEAD, so `stash apply` skipped it.
   * Unless the two copies are identical, record it as an add/add conflict —
   * stage 2 = upstream's (HEAD), stage 3 = the user's stashed copy, the same
   * sides a conflicted stash apply uses — and write the markers with
   * `checkout -m`. It then resolves through the normal conflict UI.
   */
  private async conflictUntrackedCollision(sha: string, file: string, root: string): Promise<void> {
    const entry = async (tree: string) => {
      const line = (await this.run(["ls-tree", tree, "--", file], root)).trim();
      const [mode, , blob] = line.split(/\s+/);
      return { mode, blob };
    };
    const ours = await entry("HEAD");
    const theirs = await entry(`${sha}^3`);
    if (!ours.blob || !theirs.blob || ours.blob === theirs.blob) {
      return;
    }
    const info =
      `0 ${"0".repeat(40)}\t${file}\n` +
      `${ours.mode} ${ours.blob} 2\t${file}\n` +
      `${theirs.mode} ${theirs.blob} 3\t${file}\n`;
    await this.runWithInput(["update-index", "--index-info"], root, info);
    await this.run(["checkout", "-m", "--", file], root);
  }

  /** SHA of the stash saved for `branch` by "Keep changes on <branch>". */
  private async findBranchStash(branch: string, root: string): Promise<string | undefined> {
    const output = await this.run(["stash", "list", "--format=%H%x09%s"], root);
    const marker = this.branchStashMessage(branch);
    const match = output
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [sha, ...subjectParts] = line.split("\t");
        return { sha, subject: subjectParts.join("\t") };
      })
      .find((item) => item.subject.endsWith(marker));
    return match?.sha;
  }

  private requireRoot(): string {
    if (!this.activeRoot) {
      throw new GitServiceError("No active Git repository.");
    }
    return this.activeRoot;
  }

  /**
   * Runs `git <args>` in `cwd` and resolves with stdout.
   *
   * Retries transient lock contention. VS Code's built-in Git extension runs its
   * own `git` processes against the same repository, so a mutation (`add`,
   * `reset`, `commit`, `stash`, …) can land while `.git/index.lock` is held and
   * fail with "Unable to create '.git/index.lock': File exists" — the error users
   * hit occasionally and that goes away on a second click. Retrying is safe
   * precisely because the lock was never acquired: the command had no effect.
   */
  private async run(args: string[], cwd: string, env?: NodeJS.ProcessEnv): Promise<string> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.exec(args, cwd, env);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const canRetry =
          attempt < GitCliService.lockRetryDelaysMs.length &&
          GitCliService.lockErrorPattern.test(message);
        if (!canRetry) {
          this.logger.error(`git ${args.join(" ")}`, message);
          throw error;
        }
        const delay = GitCliService.lockRetryDelaysMs[attempt];
        this.logger.warn(`git ${args.join(" ")} hit a repository lock; retrying in ${delay}ms.`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  /** `git <args>` with `input` on stdin (plumbing such as `update-index --index-info`). */
  private runWithInput(args: string[], cwd: string, input: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = execFile("git", args, { cwd, windowsHide: true }, (error, stdout, stderr) => {
        if (error) {
          reject(new GitServiceError((stderr || error.message).toString().trim(), error));
          return;
        }
        resolve(stdout.toString());
      });
      child.stdin?.end(input);
    });
  }

  /** One `git` invocation. Rejects with a {@link GitServiceError} carrying stderr. */
  private exec(args: string[], cwd: string, env?: NodeJS.ProcessEnv): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(
        "git",
        args,
        { cwd, env, maxBuffer: 64 * 1024 * 1024, windowsHide: true },
        (error, stdout, stderr) => {
          if (error) {
            const message = (stderr || error.message || "git command failed").toString().trim();
            reject(new GitServiceError(message, error));
            return;
          }
          resolve(stdout.toString());
        }
      );
    });
  }
}

/** stderr text of a failed git call. */
function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
