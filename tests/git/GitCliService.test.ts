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
