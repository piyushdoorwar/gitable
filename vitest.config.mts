import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      vscode: path.resolve(__dirname, "tests/mocks/vscode.ts")
    }
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    pool: "threads"
  }
});
