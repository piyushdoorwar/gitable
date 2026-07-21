import { vi } from "vitest";

export const workspace = {
  workspaceFolders: [] as { uri: { fsPath: string } }[]
};

export const window = {
  createOutputChannel(_name: string) {
    return {
      appendLine() {},
      show() {},
      dispose() {}
    };
  }
};

// Spyable stubs used by VsCodeGitService tests.
// These are vi.fn() so callers can configure return values and assert calls.

export const extensions = {
  getExtension: vi.fn((_id: string): any => undefined)
};

export const Uri = {
  file: vi.fn((filePath: string) => ({ fsPath: filePath, scheme: "file" })),
  from: vi.fn((components: Record<string, unknown>) => components)
};

export const commands = {
  executeCommand: vi.fn((..._args: unknown[]): any => Promise.resolve())
};

/** Minimal Disposable used by VsCodeGitService.registerChangeListener. */
export class Disposable {
  constructor(private readonly fn: () => void) {}
  dispose(): void {
    this.fn();
  }
}
