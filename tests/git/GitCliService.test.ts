import { execFile } from "node:child_process";
import { mkdtemp, rm, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GitServiceError } from "../../src/git/GitService";
import { GitCliService } from "../../src/git/GitCliService";
import { Logger } from "../../src/utils/Logger";

class TestLogger {
  info(): void {
    // Silence test logs.
  }
  warn(): void {
    // Silence test logs.
  }
  error(): void {
    // Silence test logs.
  }
}

function git(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error((stderr || error.message).toString()));
        return;
      }
      resolve(stdout.toString());
    });
  });
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath);
    return true;
  } catch {
    return false;
  }
}

describe("GitCliService integration", () => {
  let root: string;
  let service: GitCliService;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "gitable-git-"));
    await git(["init", "-b", "main"], root);
    await git(["config", "user.email", "gitable@example.com"], root);
    await git(["config", "user.name", "Gitable Test"], root);
    await writeFile(path.join(root, "tracked.txt"), "base\n");
    await git(["add", "tracked.txt"], root);
    await git(["commit", "-m", "init"], root);

    service = new GitCliService(new TestLogger() as unknown as Logger);
    service.setActiveRoot(root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("stages and unstages individual files", async () => {
    await writeFile(path.join(root, "tracked.txt"), "base\nchanged\n");
    await writeFile(path.join(root, "new.txt"), "new\n");

    await service.stageFiles(["tracked.txt"]);
    let changes = await service.getChanges();
    expect(changes.staged.map((change) => change.path)).toEqual(["tracked.txt"]);
    expect(changes.unstaged.map((change) => change.path)).toEqual(["new.txt"]);

    await service.unstageFiles(["tracked.txt"]);
    changes = await service.getChanges();
    expect(changes.staged).toHaveLength(0);
    expect(changes.unstaged.map((change) => change.path).sort()).toEqual(["new.txt", "tracked.txt"]);
  });

  it("stages and unstages all files", async () => {
    await writeFile(path.join(root, "tracked.txt"), "base\nchanged\n");
    await writeFile(path.join(root, "new.txt"), "new\n");

    await service.stageAll();
    let changes = await service.getChanges();
    expect(changes.staged.map((change) => change.path).sort()).toEqual(["new.txt", "tracked.txt"]);
    expect(changes.unstaged).toHaveLength(0);

    await service.unstageAll();
    changes = await service.getChanges();
    expect(changes.staged).toHaveLength(0);
    expect(changes.unstaged.map((change) => change.path).sort()).toEqual(["new.txt", "tracked.txt"]);
  });

  it("discards unstaged tracked files and untracked directories", async () => {
    await writeFile(path.join(root, "tracked.txt"), "base\nchanged\n");
    await mkdir(path.join(root, "newdir"));
    await writeFile(path.join(root, "newdir", "new.txt"), "new\n");

    await service.discardFiles(["tracked.txt", "newdir"], false);

    expect(await readFile(path.join(root, "tracked.txt"), "utf8")).toBe("base\n");
    expect(await fileExists(path.join(root, "newdir", "new.txt"))).toBe(false);
    expect(await service.getChanges()).toEqual({ staged: [], unstaged: [] });
  });

  it("discards staged files from index and working tree", async () => {
    await writeFile(path.join(root, "tracked.txt"), "base\nchanged\n");
    await writeFile(path.join(root, "added.txt"), "added\n");
    await service.stageFiles(["tracked.txt", "added.txt"]);

    await service.discardFiles(["tracked.txt", "added.txt"], true);

    expect(await readFile(path.join(root, "tracked.txt"), "utf8")).toBe("base\n");
    expect(await fileExists(path.join(root, "added.txt"))).toBe(false);
    expect(await service.getChanges()).toEqual({ staged: [], unstaged: [] });
  });

  it("switches branches and brings local changes to the target branch", async () => {
    await git(["checkout", "-b", "test"], root);
    await writeFile(path.join(root, "target.txt"), "target\n");
    await git(["add", "target.txt"], root);
    await git(["commit", "-m", "target"], root);
    await git(["checkout", "main"], root);

    await writeFile(path.join(root, "tracked.txt"), "base\nmain work\n");
    await writeFile(path.join(root, "carry.txt"), "carry\n");

    await service.checkoutBranchWithLocalChanges("test");

    expect((await service.getRepoSummary())?.branch).toBe("test");
    expect(await readFile(path.join(root, "tracked.txt"), "utf8")).toBe("base\nmain work\n");
    expect(await readFile(path.join(root, "carry.txt"), "utf8")).toBe("carry\n");
    expect((await git(["stash", "list"], root)).trim()).toBe("");
  });

  it("commits with a summary only", async () => {
    await writeFile(path.join(root, "tracked.txt"), "base\nchanged\n");
    await service.stageFiles(["tracked.txt"]);

    await service.commit("fix: update tracked file");

    const history = await service.getHistory(1);
    expect(history).toHaveLength(1);
    expect(history[0].subject).toBe("fix: update tracked file");
    expect(history[0].hash).toMatch(/^[a-f0-9]{40}$/);
  });

  it("commits with a summary and description", async () => {
    await writeFile(path.join(root, "tracked.txt"), "base\nchanged\n");
    await service.stageFiles(["tracked.txt"]);

    await service.commit("feat: add change", "Detailed description of what changed.");

    const history = await service.getHistory(1);
    expect(history[0].subject).toBe("feat: add change");
  });

  it("getHistory returns commits in reverse-chronological order", async () => {
    for (let i = 1; i <= 3; i++) {
      await writeFile(path.join(root, "tracked.txt"), `revision ${i}\n`);
      await git(["add", "tracked.txt"], root);
      await git(["commit", "-m", `commit ${i}`], root);
    }

    const history = await service.getHistory(10);
    // init + 3 extra; newest first
    expect(history.length).toBeGreaterThanOrEqual(4);
    expect(history[0].subject).toBe("commit 3");
    expect(history[1].subject).toBe("commit 2");
    expect(history[2].subject).toBe("commit 1");
  });

  it("getHistory includes tags attached to commits", async () => {
    await writeFile(path.join(root, "tracked.txt"), "tagged revision\n");
    await git(["add", "tracked.txt"], root);
    await git(["commit", "-m", "release commit"], root);
    await git(["tag", "v1.0.0"], root);
    await git(["tag", "latest"], root);

    await writeFile(path.join(root, "tracked.txt"), "untagged revision\n");
    await git(["add", "tracked.txt"], root);
    await git(["commit", "-m", "next commit"], root);

    const history = await service.getHistory(3);

    expect(history[0].subject).toBe("next commit");
    expect(history[0].tags).toEqual([]);
    expect(history[1].subject).toBe("release commit");
    expect(history[1].tags.sort()).toEqual(["latest", "v1.0.0"]);
  });

  it("getHistory respects the limit", async () => {
    for (let i = 1; i <= 5; i++) {
      await writeFile(path.join(root, "tracked.txt"), `rev ${i}\n`);
      await git(["add", "tracked.txt"], root);
      await git(["commit", "-m", `commit ${i}`], root);
    }

    const history = await service.getHistory(3);
    expect(history).toHaveLength(3);
  });

  it("getHistory returns empty array for a repo with no commits", async () => {
    // Create a fresh empty repo with no commits.
    const emptyRoot = await mkdtemp(path.join(os.tmpdir(), "gitable-empty-"));
    try {
      await git(["init", "-b", "main"], emptyRoot);
      const emptyService = new GitCliService(new TestLogger() as unknown as Logger);
      emptyService.setActiveRoot(emptyRoot);
      const history = await emptyService.getHistory(10);
      expect(history).toEqual([]);
    } finally {
      await rm(emptyRoot, { recursive: true, force: true });
    }
  });

  it("getCommitFiles returns files changed in a commit", async () => {
    await writeFile(path.join(root, "new.txt"), "new file\n");
    await writeFile(path.join(root, "tracked.txt"), "base\nchanged\n");
    await git(["add", "."], root);
    await git(["commit", "-m", "second commit"], root);

    const history = await service.getHistory(1);
    const files = await service.getCommitFiles(history[0].hash);

    const paths = files.map((f) => f.path).sort();
    expect(paths).toContain("new.txt");
    expect(paths).toContain("tracked.txt");

    const newFile = files.find((f) => f.path === "new.txt");
    const modFile = files.find((f) => f.path === "tracked.txt");
    expect(newFile?.status).toBe("A");
    expect(modFile?.status).toBe("M");
  });

  it("getCommitFiles returns all files for the root (initial) commit", async () => {
    // The very first commit has no parent; --root handles this.
    const history = await service.getHistory(10);
    const rootCommit = history[history.length - 1];
    const files = await service.getCommitFiles(rootCommit.hash);

    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("tracked.txt");
    expect(files[0].status).toBe("A");
  });

  it("getCommitFiles reports deleted files", async () => {
    await git(["rm", "tracked.txt"], root);
    await git(["commit", "-m", "remove file"], root);

    const history = await service.getHistory(1);
    const files = await service.getCommitFiles(history[0].hash);

    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("tracked.txt");
    expect(files[0].status).toBe("D");
  });

  it("keeps local changes on the source branch and restores them when returning", async () => {
    await git(["checkout", "-b", "test"], root);
    await writeFile(path.join(root, "target.txt"), "target\n");
    await git(["add", "target.txt"], root);
    await git(["commit", "-m", "target"], root);
    await git(["checkout", "main"], root);

    await writeFile(path.join(root, "tracked.txt"), "base\nmain work\n");
    await writeFile(path.join(root, "kept.txt"), "kept\n");

    await service.checkoutBranchKeepingLocalChanges("main", "test");

    expect((await service.getRepoSummary())?.branch).toBe("test");
    expect(await readFile(path.join(root, "tracked.txt"), "utf8")).toBe("base\n");
    expect(await fileExists(path.join(root, "kept.txt"))).toBe(false);
    expect(await git(["stash", "list"], root)).toContain("Gitable saved changes for main");

    await service.checkoutBranch("main");
    const restored = await service.restoreSavedBranchChanges("main");

    expect(restored).toBe(true);
    expect(await readFile(path.join(root, "tracked.txt"), "utf8")).toBe("base\nmain work\n");
    expect(await readFile(path.join(root, "kept.txt"), "utf8")).toBe("kept\n");
    expect((await git(["stash", "list"], root)).trim()).toBe("");
  });

  // ---- getRepoSummary -------------------------------------------------------

  describe("getRepoSummary", () => {
    it("returns the repository name, root path, and branch", async () => {
      const summary = await service.getRepoSummary();
      expect(summary?.name).toBe(path.basename(root));
      expect(summary?.root).toBe(root);
      expect(summary?.branch).toBe("main");
    });

    it("reflects the active branch after a checkout", async () => {
      await git(["checkout", "-b", "feature-branch"], root);
      const summary = await service.getRepoSummary();
      expect(summary?.branch).toBe("feature-branch");
    });
  });

  // ---- getChanges — status detection ----------------------------------------

  describe("getChanges — status detection", () => {
    it("reports a modified tracked file as unstaged M", async () => {
      await writeFile(path.join(root, "tracked.txt"), "base\nchanged\n");
      const changes = await service.getChanges();
      expect(changes.unstaged).toHaveLength(1);
      expect(changes.unstaged[0]).toMatchObject({ path: "tracked.txt", status: "M", staged: false });
      expect(changes.staged).toHaveLength(0);
    });

    it("reports a new untracked file as unstaged U", async () => {
      await writeFile(path.join(root, "newfile.ts"), "export const x = 1;\n");
      const changes = await service.getChanges();
      expect(changes.unstaged).toHaveLength(1);
      expect(changes.unstaged[0]).toMatchObject({ path: "newfile.ts", status: "U", staged: false });
    });

    it("reports a newly staged file as staged A", async () => {
      await writeFile(path.join(root, "added.ts"), "export const x = 1;\n");
      await git(["add", "added.ts"], root);
      const changes = await service.getChanges();
      expect(changes.staged).toHaveLength(1);
      expect(changes.staged[0]).toMatchObject({ path: "added.ts", status: "A", staged: true });
      expect(changes.unstaged).toHaveLength(0);
    });

    it("reports a staged deletion as staged D", async () => {
      await git(["rm", "tracked.txt"], root);
      const changes = await service.getChanges();
      expect(changes.staged).toHaveLength(1);
      expect(changes.staged[0]).toMatchObject({ path: "tracked.txt", status: "D", staged: true });
    });

    it("reports a staged rename as staged R with originalPath set", async () => {
      await git(["mv", "tracked.txt", "renamed.txt"], root);
      const changes = await service.getChanges();
      expect(changes.staged).toHaveLength(1);
      const entry = changes.staged[0];
      expect(entry.status).toBe("R");
      expect(entry.path).toBe("renamed.txt");
      expect(entry.originalPath).toBe("tracked.txt");
    });

    it("reports a file that is both staged and has unstaged edits in both lists", async () => {
      await writeFile(path.join(root, "tracked.txt"), "base\nstagededit\n");
      await git(["add", "tracked.txt"], root);
      await writeFile(path.join(root, "tracked.txt"), "base\nstagededit\nunstaged\n");
      const changes = await service.getChanges();
      const stagedPaths = changes.staged.map((c) => c.path);
      const unstagedPaths = changes.unstaged.map((c) => c.path);
      expect(stagedPaths).toContain("tracked.txt");
      expect(unstagedPaths).toContain("tracked.txt");
    });
  });

  // ---- diff content ---------------------------------------------------------

  describe("diff content", () => {
    it("getStagedDiff includes staged change lines", async () => {
      await writeFile(path.join(root, "tracked.txt"), "base\nnew line\n");
      await service.stageFiles(["tracked.txt"]);
      const diff = await service.getStagedDiff();
      expect(diff).toContain("diff --git");
      expect(diff).toContain("tracked.txt");
      expect(diff).toContain("+new line");
    });

    it("getStagedDiff is empty when nothing is staged", async () => {
      const diff = await service.getStagedDiff();
      expect(diff.trim()).toBe("");
    });

    it("getUnstagedDiff includes unstaged change lines", async () => {
      await writeFile(path.join(root, "tracked.txt"), "base\nunstaged line\n");
      const diff = await service.getUnstagedDiff();
      expect(diff).toContain("diff --git");
      expect(diff).toContain("tracked.txt");
      expect(diff).toContain("+unstaged line");
    });

    it("getStagedDiffStat returns a summary of staged changes", async () => {
      await writeFile(path.join(root, "tracked.txt"), "base\nstatline\n");
      await service.stageFiles(["tracked.txt"]);
      const stat = await service.getStagedDiffStat();
      expect(stat).toContain("tracked.txt");
      expect(stat).toMatch(/\d+ insertion/);
    });
  });

  // ---- branches -------------------------------------------------------------

  describe("branches", () => {
    it("getBranches lists the initial branch", async () => {
      const branches = await service.getBranches();
      expect(branches).toContain("main");
    });

    it("getBranches lists all local branches", async () => {
      await git(["checkout", "-b", "feature/x"], root);
      await git(["checkout", "main"], root);
      await git(["checkout", "-b", "bugfix/y"], root);
      await git(["checkout", "main"], root);
      const branches = await service.getBranches();
      expect(branches.sort()).toEqual(["bugfix/y", "feature/x", "main"]);
    });

    it("createBranch creates a new branch and checks it out", async () => {
      await service.createBranch("feature/new");
      const summary = await service.getRepoSummary();
      expect(summary?.branch).toBe("feature/new");
      const branches = await service.getBranches();
      expect(branches).toContain("feature/new");
    });

    it("checkoutBranch switches to an existing branch", async () => {
      await git(["checkout", "-b", "other"], root);
      await git(["checkout", "main"], root);
      await service.checkoutBranch("other");
      const summary = await service.getRepoSummary();
      expect(summary?.branch).toBe("other");
    });
  });

  // ---- sync info ------------------------------------------------------------

  describe("getSyncInfo", () => {
    it("returns hasUpstream false when no remote is configured", async () => {
      const sync = await service.getSyncInfo();
      expect(sync.hasUpstream).toBe(false);
      expect(sync.ahead).toBe(0);
      expect(sync.behind).toBe(0);
    });
  });

  // ---- getCommitFiles edge cases --------------------------------------------

  describe("getCommitFiles — additional", () => {
    it("reports renamed files as R with the destination path", async () => {
      await git(["mv", "tracked.txt", "renamed.txt"], root);
      await git(["commit", "-m", "rename"], root);
      const history = await service.getHistory(1);
      const files = await service.getCommitFiles(history[0].hash);
      expect(files).toHaveLength(1);
      expect(files[0].status).toBe("R");
      expect(files[0].path).toBe("renamed.txt");
    });

    it("lists multiple changed files in a single commit", async () => {
      await writeFile(path.join(root, "a.ts"), "a\n");
      await writeFile(path.join(root, "b.ts"), "b\n");
      await git(["add", "a.ts", "b.ts"], root);
      await git(["commit", "-m", "add a and b"], root);
      const history = await service.getHistory(1);
      const files = await service.getCommitFiles(history[0].hash);
      expect(files.map((f) => f.path).sort()).toEqual(["a.ts", "b.ts"]);
      expect(files.every((f) => f.status === "A")).toBe(true);
    });
  });

  // ---- error handling -------------------------------------------------------

  describe("error handling", () => {
    it("throws GitServiceError when no root is set", async () => {
      const noRoot = new GitCliService(new TestLogger() as unknown as Logger);
      await expect(noRoot.getChanges()).rejects.toBeInstanceOf(GitServiceError);
    });

    it("throws GitServiceError with readable message when no root is set", async () => {
      const noRoot = new GitCliService(new TestLogger() as unknown as Logger);
      await expect(noRoot.getChanges()).rejects.toThrow("No active Git repository");
    });

    it("stageFiles with an empty array is a silent no-op", async () => {
      await expect(service.stageFiles([])).resolves.toBeUndefined();
      const changes = await service.getChanges();
      expect(changes.staged).toHaveLength(0);
    });

    it("unstageFiles with an empty array is a silent no-op", async () => {
      await expect(service.unstageFiles([])).resolves.toBeUndefined();
    });

    it("discardFiles with an empty array is a silent no-op", async () => {
      await writeFile(path.join(root, "tracked.txt"), "base\nchanged\n");
      await expect(service.discardFiles([], false)).resolves.toBeUndefined();
      // File should be untouched since we passed an empty list.
      expect(await readFile(path.join(root, "tracked.txt"), "utf8")).toBe("base\nchanged\n");
    });
  });

  // ---- fetchOrigin ----------------------------------------------------------

  describe("fetchOrigin", () => {
    let remoteDir: string;

    beforeEach(async () => {
      // Create a bare clone of the test repo to serve as a local "remote"
      remoteDir = await mkdtemp(path.join(os.tmpdir(), "gitable-remote-"));
      await git(["clone", "--bare", root, remoteDir], os.tmpdir());
      await git(["remote", "add", "origin", remoteDir], root);
    });

    afterEach(async () => {
      await rm(remoteDir, { recursive: true, force: true });
    });

    it("fetches from origin without error", async () => {
      await expect(service.fetchOrigin()).resolves.toBeUndefined();
    });

    it("updates remote-tracking refs after a new commit is pushed to origin", async () => {
      // Initial fetch + tracking setup so getSyncInfo can compare against origin/main
      await git(["fetch", "origin"], root);
      await git(["branch", "--set-upstream-to=origin/main", "main"], root);

      // Simulate a contributor pushing a new commit to the bare remote
      const contributorDir = await mkdtemp(path.join(os.tmpdir(), "gitable-contrib-"));
      try {
        await git(["clone", remoteDir, contributorDir], os.tmpdir());
        await git(["config", "user.email", "contrib@example.com"], contributorDir);
        await git(["config", "user.name", "Contributor"], contributorDir);
        await writeFile(path.join(contributorDir, "remote-change.txt"), "from remote\n");
        await git(["add", "remote-change.txt"], contributorDir);
        await git(["commit", "-m", "remote commit"], contributorDir);
        await git(["push"], contributorDir);
      } finally {
        await rm(contributorDir, { recursive: true, force: true });
      }

      // Before our fetch the local remote-tracking ref is stale — we look in sync
      const beforeFetch = await service.getSyncInfo();
      expect(beforeFetch.behind).toBe(0);

      // After fetchOrigin() the remote-tracking ref is updated
      await service.fetchOrigin();
      const afterFetch = await service.getSyncInfo();
      expect(afterFetch.hasUpstream).toBe(true);
      expect(afterFetch.behind).toBe(1);
      expect(afterFetch.ahead).toBe(0);
    });
  });

  describe("stash", () => {
    it("stashList returns empty array when there are no stashes", async () => {
      const stashes = await service.stashList();
      expect(stashes).toEqual([]);
    });

    it("stashStaged stashes only staged files, leaving unstaged untouched", async () => {
      await writeFile(path.join(root, "staged.txt"), "staged\n");
      await writeFile(path.join(root, "unstaged.txt"), "unstaged\n");
      await git(["add", "staged.txt"], root);

      await service.stashStaged();

      const changes = await service.getChanges();
      // staged.txt should be gone from staged (stashed)
      expect(changes.staged.map((f) => f.path)).not.toContain("staged.txt");
      // unstaged.txt should still be in unstaged
      expect(changes.unstaged.map((f) => f.path)).toContain("unstaged.txt");
    });

    it("stashList returns one entry after stashing", async () => {
      await writeFile(path.join(root, "a.txt"), "hello\n");
      await git(["add", "a.txt"], root);
      await service.stashStaged();

      const stashes = await service.stashList();
      expect(stashes).toHaveLength(1);
      expect(stashes[0].index).toBe(0);
      expect(stashes[0].ref).toBe("stash@{0}");
      expect(stashes[0].message).toMatch(/WIP on|On /);
      expect(stashes[0].date).toBeTruthy();
    });

    it("stashPop restores staged changes and removes the stash entry", async () => {
      await writeFile(path.join(root, "b.txt"), "content\n");
      await git(["add", "b.txt"], root);
      await service.stashStaged();

      await service.stashPop("stash@{0}");

      const stashes = await service.stashList();
      expect(stashes).toHaveLength(0);
      const changes = await service.getChanges();
      // file restored to unstaged (pop stages → working tree after pop)
      const allPaths = [...changes.staged, ...changes.unstaged].map((f) => f.path);
      expect(allPaths).toContain("b.txt");
    });

    it("stashApply restores changes and keeps the stash entry", async () => {
      await writeFile(path.join(root, "c.txt"), "apply-me\n");
      await git(["add", "c.txt"], root);
      await service.stashStaged();

      await service.stashApply("stash@{0}");

      const stashes = await service.stashList();
      expect(stashes).toHaveLength(1);
    });

    it("stashDrop removes the stash entry without applying", async () => {
      await writeFile(path.join(root, "d.txt"), "drop-me\n");
      await git(["add", "d.txt"], root);
      await service.stashStaged();
      expect(await service.stashList()).toHaveLength(1);

      await service.stashDrop("stash@{0}");

      expect(await service.stashList()).toHaveLength(0);
      // working tree unchanged — d.txt not restored
      const changes = await service.getChanges();
      const allPaths = [...changes.staged, ...changes.unstaged].map((f) => f.path);
      expect(allPaths).not.toContain("d.txt");
    });
  });

  describe("mergeBranch", () => {
    it("merges a feature branch into the current branch", async () => {
      // Create a feature branch with one commit
      await git(["checkout", "-b", "feature/merge-me"], root);
      await writeFile(path.join(root, "feature.txt"), "feature content\n");
      await git(["add", "feature.txt"], root);
      await git(["commit", "-m", "feat: add feature"], root);
      await git(["checkout", "main"], root);

      await service.mergeBranch("feature/merge-me");

      const history = await service.getHistory(5);
      const messages = history.map((c) => c.subject);
      expect(messages).toContain("feat: add feature");
    });

    it("throws GitServiceError when merging a branch with conflicts", async () => {
      // Create conflicting file on main
      await writeFile(path.join(root, "conflict.txt"), "main version\n");
      await git(["add", "conflict.txt"], root);
      await git(["commit", "-m", "main: add conflict file"], root);

      // Create a branch that edits the same file differently
      await git(["checkout", "-b", "conflicting"], root);
      await writeFile(path.join(root, "conflict.txt"), "branch version\n");
      await git(["add", "conflict.txt"], root);
      await git(["commit", "-m", "branch: edit conflict file"], root);
      await git(["checkout", "main"], root);

      // Overwrite the file on main again so the merge cannot auto-resolve
      await writeFile(path.join(root, "conflict.txt"), "main modified\n");
      await git(["add", "conflict.txt"], root);
      await git(["commit", "-m", "main: modify conflict file again"], root);

      await expect(service.mergeBranch("conflicting")).rejects.toThrow();
    });
  });
});
