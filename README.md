# Gitable

**AI-powered Git workflow panel for VS Code.** Stage files, generate commit messages, run security reviews, and manage Git visually using your own AI API key — all from a clean sidebar panel.

Works in VS Code, Cursor, and Windsurf.

## What Gitable does

Gitable brings a focused, visual Git workflow into VS Code. Instead of typing Git commands, you stage and unstage files, write commits, and browse history from a sidebar panel. When you're ready to commit, Gitable can read your **staged diff** and ask your configured AI provider to draft a clean, Conventional-Commits-style message for you — which you can edit before committing.

Before merging, you can run an **AI security review** on staged changes, unstaged changes, or selected commits to catch vulnerabilities early.

Everything runs locally in the extension host. There is no backend, no telemetry, and no database. Your API keys are stored with VS Code SecretStorage, and only the selected Git diff is ever sent to the AI provider you choose.

## Features

- 🗂️ **Changes tab** — files are pre-checked by default; uncheck what you don't want to include. File status (added, modified, deleted, renamed, untracked) is shown on each row. Right-click any file to discard it.
- ✨ **AI commit messages** — generate a summary and description from your staged diff; review and edit before committing (never auto-commits).
- 🛡️ **AI security review** — scan staged changes, unstaged changes, or selected commits for vulnerabilities before merging. Findings are shown inline with severity levels.
- 🕑 **AI history summaries** — select multiple commits in the History tab and ask AI for a readable summary of what changed.
- 📝 **JIRA prefix** — enable a persistent prefix (e.g. `GIT-142`) that is prepended to every generated or manually written commit summary.
- 💰 **Token budgets** — set Low / Mid / High token limits per AI feature (commits, summaries, security) to control cost.
- ⚠️ **Conflict resolution** — after a merge, pull, or rebase with conflicts, conflicted files appear in a dedicated section with "Open in merge editor" and "Mark as resolved" actions. Commit is blocked until all conflicts are cleared.
- 📦 **Stash** — stash only your staged files with one click, then pop/apply/drop stashes from the same panel.
- 🔀 **Merge branch** — right-click any branch → "Merge into current"; conflict detection surfaces the error inline.
- ♻️ **Rebase** — right-click any branch → "Rebase onto this"; conflict resolution flows through the existing merge-editor integration with dedicated **Continue Rebase** and **Abort Rebase** actions in the Changes tab. Multi-commit rebases cycle through each conflict automatically.
- ✏️ **Amend last commit** — right-click the top commit in History → "Amend commit…"; lands on Staged with the message pre-filled. Edit the message and/or stage extra files, then click **Amend commit**. Pure message edits work too.
- 🔁 **Force push with lease** — a rejected push automatically offers **Force Push** using `--force-with-lease`, which refuses if someone else pushed in the meantime.
- 🔌 **Repository selector** — switch between open repositories; current branch is always visible.
- 🛡️ **Diff safety** — generated/noisy files (lockfiles, `dist/`, `*.min.js`, …) are excluded and large diffs are truncated before being sent to AI.

## Supported providers

| Provider | Validation & models | AI features |
| -------- | ------------------- | ----------- |
| **OpenAI** | `GET /v1/models` | Commit messages, security review, history summaries |
| **Gemini** | `GET /v1beta/models` | Commit messages, security review, history summaries |
| **Claude** | `GET /v1/models` | Commit messages, security review, history summaries |

You bring your own API key for whichever provider you prefer.

## Setup

```bash
npm install
npm run compile
code .
```

Then press **F5** to launch the **Extension Development Host**. The Gitable icon appears in the Activity Bar — click it to open the panel.

## Adding your API key

1. Open the **Settings** tab in the Gitable panel.
2. Choose your **provider** (OpenAI, Gemini, or Claude).
3. Paste your **API key** and click **Save key**. The key is stored using VS Code SecretStorage — never in settings or any plain-text file.
4. Click **Validate key** to confirm it works. On success, the **Model** dropdown is populated live from the provider (with a static fallback list).
5. Pick a model and click **Save model**.

## Generating commit messages

1. Stage the files you want to commit in the Changes tab.
2. Click **✨ Generate** in the commit card.
3. Gitable reads your staged diff, filters noisy files, truncates if needed, and asks your provider for a concise message.
4. The **Summary** and **Description** fields are filled in — edit them as you like.
5. Click **Commit**.

## Running a security review

1. In the **Changes tab**, click the shield icon next to Working or Staged to review those changes.
2. In the **History tab**, select one or more commits and click **Security** to review them.
3. Gitable sends the diff to your AI provider and displays findings with severity levels inline.

## JIRA prefix

Enable the prefix toggle in the commit card and enter a ticket number (e.g. `GIT-142`). The prefix is persisted across sessions and prepended to every commit summary — both manually written and AI-generated.

## Privacy

> Only the selected Git diff is sent to your configured AI provider. API keys are stored using VS Code SecretStorage. Gitable does not send data to any server owned by this extension.

- No telemetry, no analytics, no backend.
- API keys live only in SecretStorage.
- Generated/noisy files are excluded, and diffs are capped before any AI request.

## Roadmap

- Inline commit/diff detail view when selecting a file or commit.
- Checkout remote tracking branches from the panel.
- Delete remote branches when deleting a local branch.
- "Stash all" button (stash staged + unstaged + untracked in one click).
- Per-repository provider/model overrides.
- Configurable ignore patterns and diff size limit.

## Development

Requires **Node.js 24** (see `.nvmrc`; run `nvm use` to switch) and VS Code 1.96+.

```bash
npm install        # install dev dependencies
npm run compile    # bundle with esbuild -> dist/extension.js
npm run watch      # rebuild on change
npm run typecheck  # tsc --noEmit (type checking only)
```

Press **F5** in VS Code to run the Extension Development Host with the extension loaded. Source lives under `src/` and is organized by concern (`git/`, `ai/`, `config/`, `views/`, `utils/`). See [`.github/CLAUDE.md`](.github/CLAUDE.md) for the architecture overview.

## Packaging

```bash
npm install -g @vscode/vsce
vsce package
```

This produces a `gitable-<version>.vsix` you can install via **Extensions: Install from VSIX…**.

## License

[MIT](LICENSE) © Piyush Doorwar
