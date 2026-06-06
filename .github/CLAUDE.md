# Gitable — Architecture & Contributor Guide

This document is the high-level map of the Gitable codebase. The README covers
*using* the extension; this file covers *how it is built* so a contributor (human
or AI) can orient quickly.

## Overview

Gitable is a VS Code extension that renders a GitHub Desktop–style Git workflow
panel in the left sidebar (a Webview View) and can generate commit messages from
the staged diff using a user-supplied AI provider key. It has **no backend, no
telemetry, and no database** — everything runs in the VS Code extension host.

## Tech stack

- **TypeScript** (target ES2022), compiled/bundled with **esbuild** (`target: node24`) to `dist/extension.js`.
- **Node.js 24** dev toolchain (see `.nvmrc`); VS Code 1.96+ (`engines.vscode`).
- **VS Code Extension API** for the view container, webview, commands, secrets, and state.
- **Built-in `vscode.git` extension API** for repository state, staging, committing, and change events.
- **`child_process.execFile`** as a cross-platform Git CLI fallback (no shell strings).
- **Global `fetch`** (available in the Node 18+ extension host) for AI provider HTTP calls — no SDKs, no runtime dependencies.

## Project structure

```
media/                     Webview assets (vanilla JS/CSS) + Activity Bar icon
  icon.svg, main.css, main.js
src/
  extension.ts             activate(): wires services, registers the view + 11 commands, Git watchers
  constants.ts             command ids, secret/state keys, MAX_DIFF_CHARS, HISTORY_LIMIT, MODEL_FETCH_LIMIT
  views/
    GitableViewProvider.ts WebviewViewProvider: message protocol + orchestration + state
  git/
    models.ts              FileChange / CommitInfo / RepoSummary + status mapping
    GitService.ts          GitService interface + GitServiceError
    VsCodeGitService.ts    primary: Git API for read/stage/commit/watch; delegates the rest to CLI
    GitCliService.ts       execFile-based implementation of the full contract (fallback)
  ai/
    AiProvider.ts          AiProvider interface, error mapping, defensive JSON parsing
    OpenAiProvider.ts      chat/completions (JSON mode) + /v1/models
    GeminiProvider.ts      :generateContent (JSON mime) + /v1beta/models
    ClaudeProvider.ts      /v1/messages + /v1/models
    AiProviderFactory.ts   create(providerId) -> AiProvider
    prompts.ts             buildCommitPrompt(diff, diffStat)
  config/
    SecretService.ts       API keys via context.secrets (SecretStorage only)
    SettingsService.ts     provider + per-provider model via context.globalState
  utils/
    DiffLimiter.ts         ignore noisy files + truncate to MAX_DIFF_CHARS
    Logger.ts              OutputChannel("Gitable")
tests/
  git/
    GitCliService.test.ts  integration tests for all CLI operations (real git repo via mkdtemp)
    models.test.ts         unit tests for vscodeStatusToLetter + cliStatusToLetter
  ai/
    AiProvider.test.ts     unit tests for parseGeneratedMessage + mapStatusToMessage + throwForStatus
    prompts.test.ts        unit tests for buildCommitPrompt
  utils/
    DiffLimiter.test.ts    unit tests for isIgnored + prepare (ignore, truncate, empty)
  mocks/
    vscode.ts              minimal vscode API stub (workspace, window) for the test environment
```

## Services & data flow

1. **`extension.ts`** instantiates the services, creates `GitableViewProvider`,
   registers it for the `gitable.panel` view, registers the seven commands, and
   subscribes to Git change events (`VsCodeGitService.registerChangeListener`).
2. **`GitableViewProvider`** is the single orchestrator. The webview posts intent
   messages; the provider performs the work via the Git/AI/config services and
   posts back **one `state` object** that fully describes the UI.
3. **Git layer** prefers the built-in API (`VsCodeGitService`) and falls back to
   the CLI (`GitCliService`) for diffs, `--stat`, unstaging, and history — or
   entirely, if the Git API is unavailable.
4. **AI layer** is reached only for validate / list-models / generate, always with
   a key read from `SecretService` at call time.

### Webview message protocol

- **Webview → host:** `ready`, `refresh`, `selectRepo`, `stageFile`, `unstageFile`,
  `stageFiles`, `unstageFiles`, `stageAll`, `unstageAll`, `discard`, `commit`,
  `generateCommitMessage`, `saveProvider`, `saveApiKey`, `validateApiKey`,
  `saveModel`, `fetchModels`, `openDiff`, `toggleCommit`, `openCommitFile`,
  `push`, `pull`, `createBranch`, `switchBranch`, `checkoutBranchWithChanges`,
  `checkoutBranchKeepingChanges`, `restoreBranchChanges`.
- **Host → webview:** `state` (full snapshot), `setCommitFields`,
  `clearCommitFields`, `switchTab`, `commitFiles`.

The `state` payload: `{ repositoryName, branchName, activeRoot, repositories,
changes:{staged,unstaged}, history, branches, syncInfo, provider, model, models,
hasApiKey, busyKind, busyText, error, notice }`.

The `commitFiles` message carries `{ type:"commitFiles", hash, files:FileChange[] }` —
sent lazily on first expand of a commit row in the History tab.

## Conventions (mirrors the author's other projects)

- Concrete, single-responsibility `{Domain}Service` classes; interfaces only where
  polymorphism is real (`GitService`, `AiProvider`).
- One class/concern per file, named after the class.
- User-facing errors surface in both a VS Code notification **and** the webview
  (`state.error`); internals go to the `Logger` output channel.
- No secrets outside SecretStorage; no network calls from the webview (tight CSP).

## Security & privacy

- API keys: **SecretStorage only** (`gitable.<provider>.apiKey`). Never in settings,
  globalState, or files.
- Only the prepared staged diff is sent to the selected provider; `DiffLimiter`
  strips generated/noisy files and caps size (default 40,000 chars).
- The webview uses a strict CSP with a per-load nonce; all AI HTTP happens in the
  extension host, so the webview needs no external `connect-src`.
- Git CLI calls use `execFile` with argument arrays — no shell interpolation.

## Build, run, package, test

```bash
npm install
npm run compile      # esbuild -> dist/extension.js  (npm run watch to rebuild on change)
npm run typecheck    # tsc --noEmit
npm test             # vitest run  (unit + integration tests)
# F5 in VS Code -> Extension Development Host
vsce package         # produce a .vsix
```

Tests live in `tests/` and are run by **Vitest** (`vitest.config.mts`). The `vscode`
module is aliased to `tests/mocks/vscode.ts` so host-side TypeScript compiles and
runs outside VS Code. Git integration tests create a real temporary repository via
`mkdtemp` and clean it up with `rm -rf` in `afterEach`.

## Notable design decisions

- **Hybrid Git access.** All local mutations (stage/unstage/commit/discard) go through
  the CLI because the stable VS Code Git API's command execution is unreliable on some
  setups. Reads, watches, and push/pull prefer the API (credential/UI integration) with
  a transparent CLI fallback via `apiOrCli()`.
- **OpenAI uses `chat/completions` JSON mode** (rather than `/v1/responses`) because
  commit generation needs reliable structured `{summary, description}` output. Auth,
  validation, and model-listing patterns follow the same conventions as the other
  providers.
- **Live model lists only.** `FALLBACK_MODELS`/`DEFAULT_MODELS` were removed. Models
  are fetched from the provider on validate and then cached via `preloadModels()` on
  webview ready, so the dropdown is always fresh and the user never sees stale data.
- **Expandable commit history.** Clicking a commit in the History tab expands it
  inline (like VS Code's built-in Git view). Files are lazy-loaded on first expand
  using `git diff-tree --no-commit-id --name-status -r --root <hash>` (the `--root`
  flag handles the initial commit). Results are cached in the webview so background
  refreshes do not collapse expanded rows. Clicking a file opens the parent↔commit
  diff via `toGitUri` + `vscode.diff`.
- **API keys in SecretStorage only.** Keys are written with `context.secrets` under
  `gitable.<provider>.apiKey` and read back at call time — they never touch settings,
  globalState, or any file.
