import * as vscode from "vscode";
import { OUTPUT_CHANNEL_NAME } from "../constants";

/**
 * Thin wrapper over a VS Code output channel.
 * Mirrors the project's pragmatic style: one small, concrete service, no framework.
 */
export class Logger {
  private readonly channel: vscode.OutputChannel;

  constructor() {
    this.channel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  }

  info(message: string): void {
    this.write("INFO", message);
  }

  warn(message: string): void {
    this.write("WARN", message);
  }

  error(message: string, error?: unknown): void {
    const detail = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : error ? String(error) : "";
    this.write("ERROR", detail ? `${message} — ${detail}` : message);
  }

  show(): void {
    this.channel.show(true);
  }

  dispose(): void {
    this.channel.dispose();
  }

  private write(level: string, message: string): void {
    const timestamp = new Date().toISOString();
    this.channel.appendLine(`[${timestamp}] [${level}] ${message}`);
  }
}
