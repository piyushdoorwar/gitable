import { execFile } from "node:child_process";
import { mkdtemp, rm, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
    expect(history[0].hash).toMatch(/^[a-f0-9]{7}$/);
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
});
