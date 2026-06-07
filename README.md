# Gitable

**AI-powered Git workflow panel for VS Code.** Generate commit messages, review changes, and manage Git visually using your own AI API key — all from a clean, visual panel in the left sidebar.

## What Gitable does

Gitable brings a focused, visual Git workflow into VS Code. Instead of typing Git
commands, you stage and unstage files, write commits, and browse history from a
sidebar panel. When you're ready to commit, Gitable can read your **staged diff**
and ask your configured AI provider to draft a clean, Conventional-Commits-style
message for you — which you can edit before committing.

Everything runs locally in the extension host. There is no backend, no telemetry,
and no database. Your API keys are stored with VS Code SecretStorage, and only the
selected Git diff is ever sent to the AI provider you choose.

## Features

- 🗂️ **Changes tab** — unified file list where a checked checkbox means staged and unchecked means unstaged. Check or uncheck any file to stage/unstage it instantly; "Check all" / "Uncheck all" buttons act on everything at once. File status (added, modified, deleted, renamed, untracked) is shown on each row. Right-click any file to discard it.
- ⚠️ **Conflict resolution** — after a merge or pull with conflicts, conflicted files appear in a dedicated section with "Open in merge editor" and "Mark as resolved" actions. Commit is blocked until all conflicts are cleared.
- 📦 **Stash** — stash only your staged files with one click, then pop/apply/drop stashes from the same panel.
- 🔀 **Merge branch** — right-click any branch → "Merge into current"; conflict detection surfaces the error inline.
- 📝 **Commit box** — summary and description inputs with a one-click commit.
- ✨ **AI commit messages** — generate a commit message from your staged changes; review and edit before committing (never auto-commits).
- 🕑 **History tab** — recent commits for the current branch with short hash, subject, author, and relative date.
- ⚙️ **Settings tab** — pick a provider, securely store an API key, validate it, and choose a model.
- 🔌 **Repository selector** — switch between open repositories; current branch is always visible.
- 🛡️ **Diff safety** — generated/noisy files (lockfiles, `dist/`, `*.min.js`, …) are excluded and large diffs are truncated before being sent to AI.

## Supported providers

| Provider | Validation & models | Commit generation |
| -------- | ------------------- | ----------------- |
| **OpenAI** | `GET /v1/models` | `POST /v1/chat/completions` (JSON mode) |
| **Gemini** | `GET /v1beta/models` | `:generateContent` (JSON output) |
| **Claude** | `GET /v1/models` | `POST /v1/messages` |

You bring your own API key for whichever provider you prefer.

## Setup

```bash
npm install
npm run compile
code .
```

Then press **F5** to launch the **Extension Development Host**. The Gitable icon
appears in the Activity Bar — click it to open the panel.

## Adding your API key

1. Open the **Settings** tab in the Gitable panel.
2. Choose your **provider** (OpenAI, Gemini, or Claude).
3. Paste your **API key** and click **Save key**. The key is stored using VS Code
   SecretStorage — never in settings or any plain-text file.
4. Click **Validate key** to confirm it works. On success, the **Model** dropdown
   is populated live from the provider (with a static fallback list).
5. Pick a model and click **Save model**.

## Generating commit messages

1. Check the files you want to commit in the Changes tab (check a file to stage it, or click **Check all** to stage everything).
2. Click **✨ Generate AI message**.
3. Gitable reads your staged diff, filters noisy files, truncates if needed, and
   asks your provider for a concise message.
4. The **Summary** and **Description** fields are filled in — edit them as you like.
5. Click **Commit**.

## Privacy

> Only the selected Git diff is sent to your configured AI provider. API keys are
> stored using VS Code SecretStorage. Gitable does not send data to any server
> owned by this extension.

- No telemetry, no analytics, no backend.
- API keys live only in SecretStorage.
- Generated/noisy files are excluded, and diffs are capped (default 40,000 chars)
  before any AI request.

## Roadmap

- Inline commit/diff detail view when selecting a file or commit.
- Branch switching and creation from the panel.
- Push/pull/sync controls.
- Per-repository provider/model overrides.
- Configurable ignore patterns and diff size limit.
- Amend last commit and undo last commit.

## Development

Requires **Node.js 24** (see `.nvmrc`; run `nvm use` to switch) and VS Code 1.96+.

```bash
npm install        # install dev dependencies
npm run compile    # bundle with esbuild -> dist/extension.js
npm run watch      # rebuild on change
npm run typecheck  # tsc --noEmit (type checking only)
```

Press **F5** in VS Code to run the Extension Development Host with the extension
loaded. Source lives under `src/` and is organized by concern (`git/`, `ai/`,
`config/`, `views/`, `utils/`). See [`.github/CLAUDE.md`](.github/CLAUDE.md) for the
architecture overview.

## Packaging

```bash
npm install -g @vscode/vsce
vsce package
```

This produces a `gitable-<version>.vsix` you can install via
**Extensions: Install from VSIX…**.

## License

[MIT](LICENSE) © Piyush Doorwar
