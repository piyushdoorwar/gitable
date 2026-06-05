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
  extension.ts             activate(): wires services, registers the view + 7 commands, Git watchers
  constants.ts             command ids, secret/state keys, MAX_DIFF_CHARS, fallback models
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
  `stageFiles`, `unstageFiles`, `stageAll`, `unstageAll`, `commit`,
  `generateCommitMessage`, `saveProvider`, `saveApiKey`, `validateApiKey`,
  `saveModel`, `fetchModels`.
- **Host → webview:** `state` (full snapshot), `setCommitFields`,
  `clearCommitFields`, `switchTab`.

The `state` payload: `{ repositoryName, branchName, activeRoot, repositories,
changes:{staged,unstaged}, history, provider, model, models, hasApiKey, isLoading,
error, notice }`.

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

## Build, run, package

```bash
npm install
npm run compile      # esbuild -> dist/extension.js  (npm run watch to rebuild on change)
npm run typecheck    # tsc --noEmit
# F5 in VS Code -> Extension Development Host
vsce package         # produce a .vsix
```

## Notable design decisions

- **Hybrid Git access.** The stable Git API has no reliable "unstage" and no
  `--stat`/rich `log`, so those go through the CLI while reads/staging/commit/watch
  use the API. This keeps behavior predictable and cross-platform.
- **OpenAI uses `chat/completions` JSON mode** (rather than `/v1/responses`) because
  commit generation needs reliable structured `{summary, description}` output. Auth,
  validation, and model-listing patterns follow the same conventions as the other
  providers.
- **Live model lists with static fallback** (`FALLBACK_MODELS` in `constants.ts`)
  so the dropdown is accurate when online and still usable offline.
