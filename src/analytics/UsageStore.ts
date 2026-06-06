import * as vscode from "vscode";

export type UsageType = "commitMessage" | "commitSummary" | "security";

export interface UsageEntry {
  ts: number;
  provider: string;
  model: string;
  type: UsageType;
}

const STATE_KEY = "gitable.usageLog";
const MAX_ENTRIES = 5000;
const RETENTION_MS = 90 * 86_400_000; // 90 days stored, 30 days shown

export class UsageStore {
  constructor(private readonly state: vscode.Memento) {}

  record(entry: Omit<UsageEntry, "ts">): void {
    const all = this.readAll();
    all.push({ ...entry, ts: Date.now() });
    const cutoff = Date.now() - RETENTION_MS;
    let pruned = all.filter((e) => e.ts >= cutoff);
    if (pruned.length > MAX_ENTRIES) {
      pruned = pruned.slice(pruned.length - MAX_ENTRIES);
    }
    // fire-and-forget — write errors are non-fatal
    void this.state.update(STATE_KEY, pruned);
  }

  getLast30Days(): UsageEntry[] {
    const cutoff = Date.now() - 30 * 86_400_000;
    return this.readAll().filter((e) => e.ts >= cutoff);
  }

  private readAll(): UsageEntry[] {
    return this.state.get<UsageEntry[]>(STATE_KEY, []);
  }
}
