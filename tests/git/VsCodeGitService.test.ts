import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscodeMock from "../mocks/vscode";
import { GitCliService } from "../../src/git/GitCliService";
import { VsCodeGitService } from "../../src/git/VsCodeGitService";
import { Logger } from "../../src/utils/Logger";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

class SilentLogger {
  info(): void {}
  warn(): void {}
  error(): void {}
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

function makeDisposable() {
  return { dispose: vi.fn() };
}

function makeMockRepo(repoRoot: string) {
  return {
    rootUri: { fsPath: repoRoot },
    state: {
      HEAD: {
        name: "main",
        ahead: 0,
        behind: 0,
        upstream: { name: "origin/main" }
      } as any,
      refs: [{ name: "main", type: 0 }],
      indexChanges: [] as any[],
      workingTreeChanges: [] as any[],
      mergeChanges: [] as any[],
      onDidChange: vi.fn(() => makeDisposable())
    },
    add: vi.fn(),
    commit: vi.fn(),
    push: vi.fn().mockResolvedValue(undefined) as ReturnType<typeof vi.fn>,
    pull: vi.fn().mockResolvedValue(undefined) as ReturnType<typeof vi.fn>,
    checkout: vi.fn(),
    createBranch: vi.fn()
  };
}

function makeMockApi(repo: ReturnType<typeof makeMockRepo>) {
  return {
    repositories: [repo],
    onDidOpenRepository: vi.fn(() => makeDisposable()),
    onDidCloseRepository: vi.fn(() => makeDisposable()),
    toGitUri: vi.fn((uri: any, ref: string) => ({ fsPath: uri.fsPath, scheme: "git", ref }))
  };
}

function makeMockExtension(api: ReturnType<typeof makeMockApi>) {
  return {
    isActive: true,
    exports: {
      enabled: true,
      getAPI: (_version: number) => api
    }
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("VsCodeGitService", () => {
  let root: string;
  let logger: Logger;
  let cli: GitCliService;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "gitable-vsvc-"));
    await git(["init", "-b", "main"], root);
    await git(["config", "user.email", "test@test.com"], root);
    await git(["config", "user.name", "Test"], root);
    await writeFile(path.join(root, "file.ts"), "initial\n");
    await git(["add", "file.ts"], root);
    await git(["commit", "-m", "init"], root);

    logger = new SilentLogger() as unknown as Logger;
    cli = new GitCliService(logger);

    // Reset vscode stubs to known defaults before each test.
    vscodeMock.extensions.getExtension.mockReset(); // returns undefined → no API
    (vscodeMock.commands.executeCommand as ReturnType<typeof vi.fn>).mockReset();
    (vscodeMock.commands.executeCommand as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (vscodeMock.Uri.file as ReturnType<typeof vi.fn>).mockReset();
    (vscodeMock.Uri.file as ReturnType<typeof vi.fn>).mockImplementation((p: string) => ({
      fsPath: p,
      scheme: "file"
    }));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  // ---- no Git API — full CLI fallback ---------------------------------------

  describe("no Git API — CLI fallback", () => {
    let service: VsCodeGitService;

    beforeEach(async () => {
      // extensions.getExtension returns undefined → api stays undefined after initialize()
      service = new VsCodeGitService(cli, logger);
      await service.initialize();
      service.setActiveRoot(root);
    });

    it("getChanges falls back to CLI and reports real file changes", async () => {
      await writeFile(path.join(root, "file.ts"), "changed\n");
      const changes = await service.getChanges();
      expect(changes.unstaged).toHaveLength(1);
      expect(changes.unstaged[0]).toMatchObject({ path: "file.ts", status: "M" });
    });

    it("stageFiles works via CLI when API is unavailable", async () => {
      await writeFile(path.join(root, "file.ts"), "changed\n");
      await service.stageFiles(["file.ts"]);
      const changes = await service.getChanges();
      expect(changes.staged).toHaveLength(1);
      expect(changes.staged[0].path).toBe("file.ts");
    });

    it("commit works via CLI when API is unavailable", async () => {
      await writeFile(path.join(root, "file.ts"), "changed\n");
      await service.stageFiles(["file.ts"]);
      await service.commit("fix: cli fallback commit");
      const history = await service.getHistory(1);
      expect(history[0].subject).toBe("fix: cli fallback commit");
    });

    it("getHistory returns real commits via CLI", async () => {
      const history = await service.getHistory(5);
      expect(history.length).toBeGreaterThanOrEqual(1);
      expect(history[0].subject).toBe("init");
    });

    it("getBranches returns branches via CLI", async () => {
      const branches = await service.getBranches();
      expect(branches).toContain("main");
    });

    it("registerChangeListener returns a no-op disposable when no API", () => {
      const listener = service.registerChangeListener(() => {});
      expect(() => listener.dispose()).not.toThrow();
    });
  });

  // ---- with mock Git API ----------------------------------------------------

  describe("with mock Git API", () => {
    let service: VsCodeGitService;
    let mockRepo: ReturnType<typeof makeMockRepo>;
    let mockApi: ReturnType<typeof makeMockApi>;

    beforeEach(async () => {
      mockRepo = makeMockRepo(root);
      mockApi = makeMockApi(mockRepo);
      vscodeMock.extensions.getExtension.mockReturnValue(makeMockExtension(mockApi));

      service = new VsCodeGitService(cli, logger);
      await service.initialize();
      service.setActiveRoot(root);
    });

    // -- mutation routing always goes to CLI, not the API --------------------

    it("stageFiles calls CLI, not repo.add()", async () => {
      const cliSpy = vi.spyOn(cli, "stageFiles").mockResolvedValue(undefined);
      await service.stageFiles(["file.ts"]);
      expect(cliSpy).toHaveBeenCalledWith(["file.ts"]);
      expect(mockRepo.add).not.toHaveBeenCalled();
    });

    it("unstageFiles calls CLI, not the API", async () => {
      const cliSpy = vi.spyOn(cli, "unstageFiles").mockResolvedValue(undefined);
      await service.unstageFiles(["file.ts"]);
      expect(cliSpy).toHaveBeenCalledWith(["file.ts"]);
    });

    it("commit calls CLI, not repo.commit()", async () => {
      const cliSpy = vi.spyOn(cli, "commit").mockResolvedValue(undefined);
      await service.commit("feat: test", "body");
      expect(cliSpy).toHaveBeenCalledWith("feat: test", "body");
      expect(mockRepo.commit).not.toHaveBeenCalled();
    });

    it("stageAll calls CLI", async () => {
      const cliSpy = vi.spyOn(cli, "stageAll").mockResolvedValue(undefined);
      await service.stageAll();
      expect(cliSpy).toHaveBeenCalled();
    });

    it("unstageAll calls CLI", async () => {
      const cliSpy = vi.spyOn(cli, "unstageAll").mockResolvedValue(undefined);
      await service.unstageAll();
      expect(cliSpy).toHaveBeenCalled();
    });

    // -- reads use the API state ---------------------------------------------

    it("getChanges reads staged changes from API indexChanges", async () => {
      mockRepo.state.indexChanges = [
        { uri: { fsPath: path.join(root, "staged.ts") }, originalUri: { fsPath: path.join(root, "staged.ts") }, status: 1 }
      ];
      const changes = await service.getChanges();
      expect(changes.staged).toHaveLength(1);
      expect(changes.staged[0]).toMatchObject({ path: "staged.ts", status: "A", staged: true });
    });

    it("getChanges reads unstaged changes from API workingTreeChanges", async () => {
      mockRepo.state.workingTreeChanges = [
        { uri: { fsPath: path.join(root, "modified.ts") }, originalUri: { fsPath: path.join(root, "modified.ts") }, status: 5 }
      ];
      const changes = await service.getChanges();
      expect(changes.unstaged).toHaveLength(1);
      expect(changes.unstaged[0]).toMatchObject({ path: "modified.ts", status: "M", staged: false });
    });

    it("getSyncInfo reads ahead/behind counts from API HEAD", async () => {
      mockRepo.state.HEAD = { name: "main", ahead: 3, behind: 1, upstream: { name: "origin/main" } };
      const sync = await service.getSyncInfo();
      expect(sync).toEqual({ ahead: 3, behind: 1, hasUpstream: true });
    });

    it("getSyncInfo returns hasUpstream false when HEAD has no upstream", async () => {
      mockRepo.state.HEAD = { name: "main" };
      const sync = await service.getSyncInfo();
      expect(sync).toEqual({ ahead: 0, behind: 0, hasUpstream: false });
    });

    it("getRepoSummary reads name and branch from API repository state", async () => {
      const summary = await service.getRepoSummary();
      expect(summary?.branch).toBe("main");
      expect(summary?.root).toBe(root);
    });

    // -- openDiff routing ----------------------------------------------------

    it("openDiff for an unstaged modified file opens a working-tree diff", async () => {
      await service.openDiff("file.ts", false, "M");
      expect(vscodeMock.commands.executeCommand).toHaveBeenCalledWith(
        "vscode.diff",
        { fsPath: path.join(root, "file.ts"), scheme: "git", ref: "~" },
        { fsPath: path.join(root, "file.ts"), scheme: "file" },
        "file.ts (Working Tree)"
      );
    });

    it("openDiff for a staged modified file opens a HEAD-vs-index diff", async () => {
      await service.openDiff("file.ts", true, "M");
      expect(vscodeMock.commands.executeCommand).toHaveBeenCalledWith(
        "vscode.diff",
        { fsPath: path.join(root, "file.ts"), scheme: "git", ref: "HEAD" },
        { fsPath: path.join(root, "file.ts"), scheme: "git", ref: "~" },
        "file.ts (Staged)"
      );
    });

    it("openDiff for an untracked file opens the file directly", async () => {
      await service.openDiff("file.ts", false, "U");
      expect(vscodeMock.commands.executeCommand).toHaveBeenCalledWith(
        "vscode.open",
        { fsPath: path.join(root, "file.ts"), scheme: "file" }
      );
    });

    it("openDiff for a staged deletion opens the HEAD version read-only", async () => {
      await service.openDiff("file.ts", true, "D");
      expect(vscodeMock.commands.executeCommand).toHaveBeenCalledWith(
        "vscode.open",
        { fsPath: path.join(root, "file.ts"), scheme: "git", ref: "HEAD" }
      );
    });

    it("openDiff for an unstaged deletion opens the index version read-only", async () => {
      await service.openDiff("file.ts", false, "D");
      expect(vscodeMock.commands.executeCommand).toHaveBeenCalledWith(
        "vscode.open",
        { fsPath: path.join(root, "file.ts"), scheme: "git", ref: "~" }
      );
    });

    // -- openCommitDiff routing -----------------------------------------------

    it("openCommitDiff opens a parent-vs-commit diff with the short hash in the title", async () => {
      const hash = "abc1234def5678";
      await service.openCommitDiff(hash, "file.ts", "M");
      expect(vscodeMock.commands.executeCommand).toHaveBeenCalledWith(
        "vscode.diff",
        { fsPath: path.join(root, "file.ts"), scheme: "git", ref: `${hash}~1` },
        { fsPath: path.join(root, "file.ts"), scheme: "git", ref: hash },
        `file.ts (${hash.slice(0, 7)})`
      );
    });

    // -- apiOrCli push / pull -------------------------------------------------

    it("push uses the API when it succeeds", async () => {
      const cliSpy = vi.spyOn(cli, "push").mockResolvedValue(undefined);
      await service.push();
      expect(mockRepo.push).toHaveBeenCalled();
      expect(cliSpy).not.toHaveBeenCalled();
    });

    it("push falls back to CLI when the API throws", async () => {
      mockRepo.push.mockRejectedValue(new Error("network error"));
      const cliSpy = vi.spyOn(cli, "push").mockResolvedValue(undefined);
      await service.push();
      expect(mockRepo.push).toHaveBeenCalled();
      expect(cliSpy).toHaveBeenCalled();
    });

    it("pull uses the API when it succeeds", async () => {
      const cliSpy = vi.spyOn(cli, "pull").mockResolvedValue(undefined);
      await service.pull();
      expect(mockRepo.pull).toHaveBeenCalled();
      expect(cliSpy).not.toHaveBeenCalled();
    });

    it("pull falls back to CLI when the API throws", async () => {
      mockRepo.pull.mockRejectedValue(new Error("network error"));
      const cliSpy = vi.spyOn(cli, "pull").mockResolvedValue(undefined);
      await service.pull();
      expect(mockRepo.pull).toHaveBeenCalled();
      expect(cliSpy).toHaveBeenCalled();
    });

    // -- registerChangeListener ----------------------------------------------

    it("registerChangeListener fires the callback when a repo state changes", () => {
      let capturedCallback: (() => void) | undefined;
      (mockRepo.state.onDidChange as any).mockImplementation((cb: () => void) => {
        capturedCallback = cb;
        return makeDisposable();
      });

      let callCount = 0;
      service.registerChangeListener(() => {
        callCount++;
      });

      expect(capturedCallback).toBeDefined();
      capturedCallback!();
      expect(callCount).toBe(1);
    });

    it("registerChangeListener dispose() stops the listener", () => {
      const disposeInner = vi.fn();
      mockRepo.state.onDidChange.mockReturnValue({ dispose: disposeInner });

      const disposable = service.registerChangeListener(() => {});
      disposable.dispose();

      expect(disposeInner).toHaveBeenCalled();
    });
  });
});
