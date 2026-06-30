# Gitable — Architecture & Contributor Guide

This document is the high-level map of the Gitable codebase. The README covers
*using* the extension; this file covers *how it is built* so a contributor (human
or AI) can orient quickly.

## Overview

Gitable is a VS Code extension that renders a visual Git workflow panel in the
left sidebar (a Webview View). It can generate commit messages, explain one or
more selected commits in plain English, and review staged/unstaged or selected
commit diffs for security risks — all using a user-supplied AI provider key. It
has **no backend, no telemetry, and no database** — everything runs in the VS
Code extension host.

## Tech stack

- **TypeScript** (target ES2022), compiled/bundled with **esbuild** (`target: node24`) to `dist/extension.js`.
- **Node.js 24** dev toolchain (see `.nvmrc`); VS Code 1.96+ (`engines.vscode`).
- **VS Code Extension API** for the view container, webview, commands, secrets, state, and badges.
- **Built-in `vscode.git` extension API** for repository state, staging, committing, and change events.
- **`child_process.execFile`** as a cross-platform Git CLI fallback (no shell strings).
- **Global `fetch`** (available in the Node 18+ extension host) for AI provider HTTP calls — no SDKs, no runtime dependencies.

## Project structure

```
media/                     Webview assets (vanilla JS/CSS) + Activity Bar icon
  icon.svg, main.css, main.js
src/
  extension.ts             activate(): wires services, registers the view + commands, Git watchers
  constants.ts             command ids, secret/state keys, MAX_DIFF_CHARS, HISTORY_LIMIT, MODEL_FETCH_LIMIT
  analytics/
    UsageStore.ts          records AI call history in globalState (provider, model, type, timestamp)
  views/
    GitableViewProvider.ts WebviewViewProvider: message protocol + orchestration + state
  git/
    models.ts              FileChange / RepoChanges / CommitInfo / CommitStat / RepoSummary / SyncInfo / StashEntry
    GitService.ts          GitService interface + GitServiceError
    VsCodeGitService.ts    primary: Git API for read/stage/commit/watch; delegates rest to CLI
    GitCliService.ts       execFile-based implementation of the full contract (fallback)
  ai/
    AiProvider.ts          AiProvider interface, error mapping, SecurityFinding/SecurityReview types
    OpenAiProvider.ts      chat/completions (JSON mode) + /v1/models
    GeminiProvider.ts      :generateContent (JSON mime) + /v1beta/models
    ClaudeProvider.ts      /v1/messages + /v1/models
    AiProviderFactory.ts   create(providerId) -> AiProvider
    prompts.ts             buildCommitPrompt / buildCommitSummaryPrompt / buildSecurityReviewPrompt
  config/
    SecretService.ts       API keys via context.secrets (SecretStorage only)
    SettingsService.ts     provider + per-provider model via context.globalState
  utils/
    DiffLimiter.ts         ignore noisy files + truncate to MAX_DIFF_CHARS
    Logger.ts              OutputChannel("Gitable")
tests/
  git/
    GitCliService.test.ts  integration tests for all CLI operations (real git repo via mkdtemp)
    VsCodeGitService.test.ts unit tests for Git API routing + CLI delegation
    models.test.ts         unit tests for status letter mapping
  ai/
    AiProvider.test.ts     unit tests for parseGeneratedMessage + error mapping
    prompts.test.ts        unit tests for buildCommitPrompt
  utils/
    DiffLimiter.test.ts    unit tests for isIgnored + prepare
  mocks/
    vscode.ts              minimal vscode API stub for the test environment
```

## Services & data flow

1. **`extension.ts`** instantiates all services, creates `GitableViewProvider`,
   registers it for `gitable.panel`, registers commands, and subscribes to Git
   change events. On panel visibility change the provider auto-fetches from origin.
2. **`GitableViewProvider`** is the single orchestrator. The webview posts intent
   messages; the provider performs work and posts back **one `state` object** that
   fully describes the UI.
3. **Git layer** prefers the built-in API (`VsCodeGitService`) and falls back to the
   CLI (`GitCliService`) for diffs, stat, unstaging, history, fetch, and revert.
4. **AI layer** is reached for validate / list-models / generate, with a key read
   from `SecretService` at call time. Successful calls are recorded in `UsageStore`.
5. **`UsageStore`** persists AI call history in `context.globalState` under
   `gitable.usageLog` (max 5,000 entries, 90-day retention). Separate from
   workspace files — never committed to the repo.

### Webview message protocol

**Webview → host:**
- Git: `ready`, `refresh`, `loadMoreHistory`, `stateRendered`, `selectRepo`,
  `stageFile`, `unstageFile`, `stageFiles`, `unstageFiles`, `stageAll`, `unstageAll`,
  `discardFiles`, `commit`, `amend`,
  `openDiff`, `openFile`, `openCommitFile`, `copyFilePath`, `copyRelativePath`, `revealFile`,
  `push`, `pull`, `fetchOrigin`,
  `createBranch`, `switchBranch`, `checkoutBranchWithChanges`, `checkoutBranchKeepingChanges`,
  `restoreBranchChanges`, `renameBranch`, `deleteBranch`, `copyBranchName`, `setUpstream`,
  `mergeBranch`, `rebaseBranch`, `rebaseContinue`, `rebaseAbort`,
  `copySha`, `copyTag`, `revertCommit`, `cherryPickCommit`,
  `openMergeEditor`, `markResolved`,
  `stashStaged`, `stashPop`, `stashApply`, `stashDrop`,
  `createTag {hash}`, `deleteTag {name}`, `pushTags`,
  `addToGitignore {filePath}`, `undoLastCommit`,
  `openJiraIssue {key}`
- AI: `generateCommitMessage`, `summarizeCommit`, `summarizeCommits`,
  `securityReview`, `securityReviewCommits`,
  `saveAndValidate`, `saveProvider`, `saveModel`, `fetchModels`, `copySummaryText`
- Analytics: `getReports`

**Host → webview:**
- `state` (full snapshot on every change)
- `setCommitFields`, `clearCommitFields`, `switchTab`, `changesSubTab`
- `commitFiles` (lazy-loaded on first expand of a commit row)
- `commitSummary` (AI result for a specific commit hash)
- `securityReview` (AI security findings)
- `reports` (30-day usage entries array)

**`state` payload:**
```
repositoryName, branchName, activeRoot, repositories,
changes:{staged, unstaged, conflicts}, stashes,
history, branches, hasMoreHistory,
ahead, behind, hasUpstream, syncAction, syncError, lastFetchedAt,
pendingTagCount, canUndoCommit, lastCommitSummary,
lastCommit:{summary, description} | null,
rebaseState:{inProgress, branch?, onto?},
hasConflicts,
provider, model, models, hasApiKey, providerIcons,
busyKind, busyText, isLoading, error, notice,
jiraConfig:{baseUrl, email}, jiraHasToken
```

### AI result panels (overlays)

AI summary and security review are shown as **absolute-position overlays** that
cover the full panel area, not as new tabs. They use `position: absolute; inset: 0;
z-index: 20` over the `#app` container (which has `position: relative`). The main
tab bar always has only Changes and History — overlays stack on top when the user
triggers an AI action.

### Split Pull / Push buttons

The branch row holds three items: the branch button (grows to fill), then two
compact icon buttons — **Pull/incoming** (`#pullBtn`, action `pullSync`) and
**Push/outgoing** (`#pushBtn`, action `pushSync`). Ahead and behind are
independent dimensions, so a diverged branch lights up **both** buttons at once
— something the old single combo button could not represent. `updateSync(s)`
drives both:

| State | Pull button | Push button |
|---|---|---|
| `syncAction` set | spinner if the op is incoming, else pull icon | spinner if push/publish, else push icon (both disabled) |
| No upstream | refresh icon, "Fetch origin" | push icon, "Publish branch to origin" |
| `behind > 0` | pull icon + `N↓` badge | (per ahead/tags below) |
| `ahead > 0` | (per behind above) | push icon + `N↑` (· `M🏷` if pending tags) |
| Pending tags only | — | push icon + `M🏷` |
| Up to date | refresh icon, "Fetch origin" | disabled, "Nothing to push" |

The webview click handlers (`pullSync` / `pushSync`) translate to host messages:
`pullSync` posts `pull` when behind+has-upstream, else `fetchOrigin`; `pushSync`
posts `push` (publish when no upstream), or `pushTags` when only tags are pending.

On panel visibility change the provider calls `silentFetchAndRefresh()` which
fetches from origin and sets `syncAction = "Refreshing repository"` while doing
so, keeping ahead/behind counts fresh without user interaction.

Pull/push/fetch each use `runSyncOp(label, globalBusy, fn)`:
- Sets `syncAction` for inline button feedback.
- When `globalBusy=true` (pull/push) also sets `busyKind` to disable the commit UI.
- Clears both after completion.
- Sync operations do not show info/error notification popups — feedback is inline.

**Divergence-aware pull.** `pullWithLocalChangesCheck()` reads `getSyncInfo()`
first. When the branch is diverged (`ahead > 0 && behind > 0`) it shows a modal
**Merge / Rebase / Cancel** prompt and passes the chosen `PullStrategy` to
`git.pull(strategy)` — no silent strategy from ambient `pull.rebase` config. A
plain fast-forward pull (only behind) passes no strategy. `GitCliService.pull`
runs `git pull` with `--rebase`, `--no-rebase`, or no flag accordingly — **no
`--autostash`**: local working-tree changes are carried by the provider's
explicit stash → pull → restore wrapper so there is a single conflict surface. A
rebase pull that conflicts leaves `.git/rebase-merge`, which the existing
`rebaseState` Continue/Abort bar picks up automatically. `VsCodeGitService.pull`
routes any explicit strategy to the CLI (the Git API's `repo.pull()` cannot force
rebase/merge); a strategy-less pull still prefers the API.

If the branch has no upstream, `push` routes through `pushCurrentBranch()`:
- With multiple remotes, the user picks a remote.
- With one remote, Gitable uses it directly.
- It runs `git push -u <remote> <branch>` so tracking is set immediately.
- If no remotes exist, it surfaces a clear panel error.

The current branch context menu includes **Set upstream…**, which prompts for a
remote and remote branch, then runs `git branch --set-upstream-to`.

## Conventions

- Concrete, single-responsibility `{Domain}Service` classes; interfaces only where
  polymorphism is real (`GitService`, `AiProvider`).
- One class/concern per file, named after the class.
- User-facing errors surface in both a VS Code notification **and** `state.error`;
  internals go to the `Logger` output channel.
- Sync operations (fetch/pull/push) surface feedback inline in the Pull/Push
  buttons rather than info notifications.
- No secrets outside SecretStorage; no network calls from the webview (tight CSP).

## Security & privacy

- API keys: **SecretStorage only** (`gitable.<provider>.apiKey`). Never in
  settings, globalState, or files.
- Only the prepared diff is sent to the selected provider; `DiffLimiter` strips
  generated/noisy files and caps size (default 40,000 chars).
- The webview uses a strict CSP with a per-load nonce; all AI HTTP happens in the
  extension host.
- Git CLI calls use `execFile` with argument arrays — no shell interpolation.
- `CommitInfo.hash` stores the full 40-char SHA (`%H`). The webview truncates to
  7 chars for display (`.slice(0, 7)`) but passes the full hash for all operations
  (copy, diff, summarize, revert, cherry-pick).

## Build, run, package, test

```bash
npm install
npm run compile      # esbuild -> dist/extension.js
npm run watch        # rebuild on change
npm run typecheck    # tsc --noEmit
npm test             # vitest run (unit + integration)
# F5 in VS Code -> Extension Development Host
vsce package         # produce .vsix
```

Tests live in `tests/` and run under **Vitest**. The `vscode` module is aliased
to `tests/mocks/vscode.ts`. Git integration tests create real temporary
repositories via `mkdtemp` and clean up in `afterEach`. The remote tests set up
a local bare remote to verify fetch, publish (`push -u`), and after-the-fact
upstream tracking.

## Analytics (UsageStore)

Every successful AI call records `{ ts, provider, model, type }` where
`type` is `"commitMessage" | "commitSummary" | "security"`. The Reports panel
(opened via the bar-chart icon in the webview header) shows:
- Total call count for the last 30 days
- Sparkline (30-day daily bar chart, CSS-only)
- Breakdown by type and by provider (CSS horizontal bars)
- Top models list

Data lives in `context.globalState` under `gitable.usageLog` — outside the
workspace, never committed to the repo.

## Notable design decisions

- **Hybrid Git access.** Local mutations go through CLI; watches and ordinary
  push/pull prefer the built-in API for credential/UI integration, with a
  transparent CLI fallback via `apiOrCli()`. `getChanges()` and `getSyncInfo()`
  always use the CLI so the badge, file list, and ahead/behind counts are always
  fresh — the VS Code Git API's in-memory cache (`indexChanges`/`workingTreeChanges`
  and `repo.state.HEAD.ahead/behind`) can lag after commits, discards, and fetches.
  In particular a CLI `git fetch` does not invalidate the API's ahead/behind cache,
  so reading counts from `repo.state.HEAD` made pull items appear only after 2-3
  fetches; `getSyncInfo()` resolves `@{upstream}` via `git rev-list` instead.
  Remote-aware publishing and upstream tracking are CLI-backed because they need
  explicit `remote` and tracking arguments (`push -u`, `branch --set-upstream-to`).
- **Full SHA in history.** `git log` uses `%H` (40-char). Display truncates to 7
  chars. All git operations (diff, revert, cherry-pick, AI summary) use the full hash.
- **History pagination.** `historyLimit` starts at `HISTORY_LIMIT` (30) and grows by
  `HISTORY_LIMIT` each time the webview posts `loadMoreHistory` (a "Show more commits"
  button rendered at the bottom of the list when `state.hasMoreHistory`). `buildState()`
  requests `historyLimit + 1` commits; if more come back than the limit it sets
  `hasMoreHistory` and slices to the limit. Switching repos resets `historyLimit`.
- **Background auto-fetch.** A timer (`restartAutoFetch()`) fetches from origin every
  `gitable.autoFetch.intervalMinutes` (VS Code setting, default 5, `0` disables) so
  ahead/behind stay current while the panel sits open. It only runs while the view is
  visible and no other sync op is in flight, and is restarted on configuration change
  (`onDidChangeConfiguration` in `extension.ts`). This complements the existing
  fetch-on-visibility behavior.
- **Surfaced fetch failures.** `silentFetchAndRefresh()` no longer swallows errors:
  on failure (and only when a remote actually exists — local-only repos are not an
  error) it stores `lastSyncError`, exposed as `state.syncError`. The pull button then
  shows a warning icon (`gx-sync-error`) and tooltip "Couldn't reach origin — click to
  retry" instead of a clean "up to date". Any successful fetch/pull/push clears it.
- **Branch-row stability.** The sync buttons keep their badges visible during an
  in-flight op (only the icon swaps to a 13×13 spinner that matches the icon slot) so
  clicking refresh does not shift the row (CLS). The sync segments are chunky
  (`min-width: 56px`, `padding: 4px 14px`) and pinned to the right edge while the branch
  button flexes to fill; the width also damps the shift when a count first appears. A
  webview `setInterval` re-runs
  `updateSync` every 60s so the "Last fetched … ago" tooltip stays current between states.
- **Unpushed commit indicator.** `getHistory()` computes the set of local-only
  commits via `git rev-list HEAD --not --remotes` (reachable from HEAD but not from
  any remote ref) and sets `CommitInfo.unpushed` per commit. `--remotes` keeps this
  correct whether the branch tracks an upstream, is published under a different name,
  or has no upstream yet (with no remotes configured, every HEAD commit is local).
  The History tab shows an "Unpushed" pill (outgoing color) next to the subject and
  a left accent border on those rows, so you can see which commits still live only
  in your local repository.
- **Live model lists only.** No hardcoded fallback lists. Models are fetched from
  the provider on Save & Validate, then cached via `preloadModels()` on `ready`.
- **Selectable commit history.** Files are lazy-loaded on first expand and cached
  in the webview so refreshes do not collapse expanded rows. Commit cards have
  checkboxes; shift-click selects a contiguous range. The History action bar
  enables batch **Summary**, **Security**, and **Clear** actions once one or more
  commits are selected. Batch AI combines selected commit diffs and uses
  `DiffLimiter`; oversized selections analyze a safe subset and display a note.
- **Settings UX.** "Save key" + "Validate" are merged into one "Save & Validate"
  button (enabled when the input has text or a key is already saved). Model
  auto-saves on dropdown change. Refresh is a small icon next to the Model label.
  The settings icon lives inside the webview header (top-right), not in the VS Code
  toolbar.
- **AI key storage.** Keys are written with `context.secrets` under
  `gitable.<provider>.apiKey` and read back at call time — never touch settings,
  globalState, or files.
- **Tabbed Changes UI.** The Changes parent tab contains three subtabs:
  **Working**, **Staged**, and **Stashes**. Counts live in the subtabs. The
  default is Working; staging moves the user to Staged, unstaging and successful
  commits move back to Working, stashing staged changes moves to Stashes, and
  stash pop/apply moves to Working. The commit summary panel is active only on
  Staged. Checkboxes select rows for bulk actions; they do not represent staged
  state. A file with both staged and unstaged hunks appears in both Working and
  Staged with a `Partial` marker, matching standard Git behavior.
- **File row actions and status markers.** Normal file rows do not expose
  one-click stage/unstage actions; users stage/unstage via selected/all toolbar
  buttons. Right-side status markers stay visible and expose tooltips
  (`Modified`, `Added`, `Untracked`, etc.). File path hover changes color only;
  it does not underline like a web link.
- **Changes notices.** Errors, notices, and busy messages render in a reserved
  bottom notice slot above the commit summary panel. This avoids pushing the file
  list/tabs around when a message appears.
- **Activity bar badge.** The Gitable icon shows the count of changed files as a
  badge, mirroring VS Code's built-in SCM indicator. `countChangedFiles()` counts
  *distinct* paths across staged ∪ unstaged ∪ conflicts (a partial file appears in
  both staged and unstaged but is one file). `updateBadge()` **debounces** the
  `view.badge` write (80 ms): a single commit makes the Git API fire several
  `onDidChange` events in quick succession, and writing the badge on each can leave
  VS Code rendering a stale intermediate value while dropping the final write — so
  the count appeared not to clear after a commit. Coalescing to one settled write
  fixes it. `lastBadgeCount` skips redundant writes and is reset on view re-resolve.
- **Conflict resolution state.** When a pull or merge leaves unresolved conflicts,
  `RepoChanges.conflicts` is populated (CLI detects XY porcelain codes containing `U`,
  `AA`, or `DD`; VS Code Git API uses `mergeChanges`). The Changes tab shows a
  warning banner and a dedicated Conflicts section. Each file gets two row actions:
  "Open in merge editor" (`git.openMergeEditor` command, falls back to plain open)
  and "Mark as resolved" (stages the file via `stageFiles`). The Commit and AI
  generate buttons are disabled until all conflicts are cleared.
- **Stash (staged-only).** `git stash push --staged` stashes only currently staged
  files, leaving unstaged changes intact. Pop / Apply restores the stash with
  `--index` so previously staged files return checked. The Stashes subtab lists
  all stash entries with Pop / Apply / Drop actions.
- **Remote publishing and upstream tracking.** When the current branch has no
  upstream, the Push button's Publish flow chooses a remote (or uses the only
  configured remote) and runs `push -u`. The current-branch context menu also
  exposes **Set upstream…** for branches that already exist remotely but are not
  tracking yet.
- **Merge branch.** Right-click a branch in the Branches tab → "Merge into current".
  Conflict detection surfaces the error as a panel notice pointing users to the
  conflict resolution flow.
- **Add to .gitignore.** Right-clicking an untracked file (status `U`) in the Changes list shows "Add to .gitignore" in the context menu. The host appends the relative path to `<repo-root>/.gitignore` (creating it if absent, skipping if the path is already listed). The entry only appears for untracked files; `openFileMenu` toggles it based on `data-status === "U"`.
- **Undo last commit.** After a commit, `GitableViewProvider` stores the commit summary in `lastCommitSummary` and sets `canUndoCommit: true` in state. The Changes tab shows an undo bar below the Commit button. Clicking "Undo" posts `undoLastCommit` → `git reset --soft HEAD~1`, moving staged changes back to the index. The bar disappears after undo or after a successful push. Auto-stage tracking is reset on undo so the re-staged files remain checked. The History commit context menu also exposes **"Undo commit (drop)"** on the latest commit *only while it is unpushed* (`isHead && ahead > 0`); it switches to Changes → Staged and posts the same `undoLastCommit`. Distinct from **Revert commit** (`git revert`, which adds an inverse commit and never removes history). Revert and cherry-pick clear `lastCommitSummary` so a stale Undo bar can't `reset --soft` the newly created commit.
- **Tag management.** Tags are created via right-click on a commit row → "Create tag…"
  (VS Code input box for the name, validated inline). Existing tag badges in the History
  tab are interactive (`gx-tag-btn`): clicking opens a mini `tagContextMenu` with
  "Delete tag…" (triggers a modal confirmation with "Local only" / "Local + origin").
  Unpushed tags are tracked in-memory in `GitableViewProvider.pendingTagPushes` (a
  `Set<string>`). The Push button badge shows pending tags alongside commits (`N↑ · M🏷`).
  When `ahead > 0` the push also calls `pushAllTags()` and clears the set. When
  `ahead === 0` the Push button badge shows `M🏷` and `pushSync` posts `pushTags`.
  Pending tags are reset on any successful push and when a tag is deleted.
- **Rebase with conflict resolution.** Right-click any non-current branch → "Rebase onto this". `GitableViewProvider` shows a modal confirmation, then calls `git rebase`. On conflict, `getRebaseState()` detects `.git/rebase-merge/head-name` and sets `rebaseState.inProgress: true` in state. The Changes tab shows a rebase bar with **Continue Rebase** and **Abort** buttons. `rebaseContinue()` uses `GIT_EDITOR=true` to suppress the editor. Multi-commit rebases cycle through each conflict automatically. The commit card and commit button are hidden during rebase.
- **Amend last commit.** Right-click the HEAD commit in History → "Amend commit…". The handler switches to Changes → Staged, pre-fills the commit fields from `state.lastCommit` (fetched fresh via `git log -1 --format=%B` on every state build), and checks the amend toggle. The toggle label changes to "Amending — uncheck to cancel" when active. On submit the webview posts `amend` instead of `commit`; the host calls `git commit --amend`. Works with or without new staged files (pure message edit is valid). `clearCommitFields` also resets the toggle.
- **Force push with lease.** A normal push that is rejected (error matches `/rejected|non-fast-forward|fetch first/i`) triggers a VS Code warning modal offering **Force Push**. If confirmed, `git push --force-with-lease` is used — this refuses if someone else has pushed to the remote since the last fetch, preventing accidental clobbers.
- **Auto-select file checkboxes.** Files in the Working and Staged lists are checked by default when they first appear. A `_seenFileKeys` Set tracks which keys have been seen; only genuinely new keys are auto-checked. Files the user explicitly unchecks stay unchecked across re-renders. Moving a file between Working and Staged changes its key (`path:false` vs `path:true`), so it is auto-checked in its new section. The "Stage all" and "Unstage all" buttons were removed — "Stage selected" / "Unstage selected" cover all cases when everything is pre-checked.
- **Tree/flat file view.** `ui.config.fileView` (`"flat" | "tree"`, localStorage-persisted) controls how files are displayed in Working and Staged. In tree mode `buildFileTree(files)` converts flat path arrays into a nested node structure; `renderFileTree(nodes, isStaged, partialPaths)` renders folder rows (chevron + pink folder icon + folder checkbox) with `<ul class="gx-tree-children">` for indentation — no inline styles so the CSP is satisfied. `ui.collapsedFolders` (a `Set<string>`) persists fold state across renders. `applyFolderIndeterminate(listEl, isStaged)` runs after every render to set `.indeterminate` on folder checkboxes; it skips collapsed folders (detected by the absence of a rendered `<ul class="gx-tree-children">` child) so collapsing never unintentionally unchecks files. Toggled via Flat / Tree buttons in Settings → Config.
- **Config panel info icons.** Each section header in Settings → Config (Appearance, Jira Integration, File View, AI Token Budget) carries an inline `ICONS.info` icon (13×13 px, `gx-info-icon gx-ic sm`) with a `title` attribute instead of a hint paragraph below the label. The icon is muted by default and turns pink on hover. Token budget Low/Mid/High buttons each carry a `title` with the exact char limit ("~10,000 chars of diff" etc.).
- **Jira integration.** Optional panel (toggled in Settings → Jira). Credentials (base URL, email, API token via SecretStorage) connect to Jira Cloud's REST API v3. Issues assigned to the current user and not Done are fetched (`maxResults=50`). Search is local-only (filters the cached 50 results). Status badges use keyword matching (`jiraStatusClass()`). Three-dot menu per issue: Copy key, Copy branch name, Open in Jira (via `vscode.env.openExternal`). Sort by any column cycles asc → desc → off. All Jira and AI network calls use `fetchWithTimeout` (45 s) which throws `RequestTimeoutError` on abort.
- **History tab sticky header.** The history action bar (selected count + Summary/Security/Clear buttons) is a `flex: 0 0 auto` header; only the commit list below it scrolls. Same flex-column + scroll-wrapper pattern as the Changes panel (`#panel-history { display:flex; flex-direction:column; overflow:hidden }` + `.gx-history-scroll { flex:1 1 auto; overflow-y:auto }`).
