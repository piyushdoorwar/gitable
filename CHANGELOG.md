# Changelog

All notable changes to the **Gitable** extension are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.13] - 2026-06-06

### Fixed

- Tooltips now render inside the webview instead of relying on native browser `title` behavior, so they show reliably in VS Code.

## [0.0.12] - 2026-06-06

### Changed

- Expanded tooltips and accessibility labels across webview controls, including AI generation, push/pull, branch management, file actions, stage/unstage controls, and settings actions.

## [0.0.11] - 2026-06-06

### Changed

- Replaced verbose stage/unstage section actions with compact icon buttons and hover labels.

## [0.0.10] - 2026-06-06

### Added

- Branch switching now prompts when local changes exist, with options to bring changes to the target branch or keep them saved on the current branch.

## [0.0.9] - 2026-06-06

### Changed

- The header branch name is now a plain button that opens branch management; the visible tab bar is back to **Changes** and **History**.
- Branch lists now read local heads from the Git CLI, so branches like `test` appear even when VS Code's Git API refs are stale.

## [0.0.8] - 2026-06-06

### Added

- Marketplace/Extensions **icon** (`media/icon.png`) — a navy app-icon tile with the coral Gitable mark, so the logo shows in the Extensions view.

## [0.0.7] - 2026-06-06

### Changed

- Refined the logo/icon: the chat bubble is now an outlined navy border (no fill) and enlarged for clearance around the leaves.

## [0.0.6] - 2026-06-06

### Added

- **Click a changed file** to open its diff in VS Code's native diff editor — index↔working-tree for unstaged, HEAD↔index for staged (untracked files just open).
- Models now **auto-load on startup** from the saved key, so you don't re-validate after a restart.

### Changed

- **Refresh** and **Settings (gear)** moved to the view's title bar; removed from the in-panel header. The gear still opens the Settings (AI models) tab.
- The API-key field shows a "stored — paste to replace" placeholder when a key is already saved (keys live in VS Code SecretStorage — persistent and never written to the repo).

## [0.0.5] - 2026-06-06

### Added

- A dedicated **Branches** tab: create a branch inline, filter the list, and switch with one click (the current branch is marked). Replaces the cramped header dropdown so new branches are always visible.

### Changed

- The header now shows the current branch as a chip that opens the Branches tab.
- Redesigned **push / pull** icons (cloud upload / download) for clarity.
- The Commit button now reads **"Commit to ‹branch›"**.

## [0.0.4] - 2026-06-06

### Fixed

- Staging a file from the panel ("+") no longer fails with "Failed to execute git". Local Git mutations (stage / unstage / commit) now run through the bundled CLI path; push / pull / branch ops use the Git API with a CLI fallback.

### Changed

- **Settings** moved to a top-right gear icon; the tab bar now shows just **Changes** and **History**.
- **Generate** and **Commit** are enabled only when there are staged changes.

## [0.0.3] - 2026-06-06

### Added

- **Push** and **Pull** from the panel header, with ahead/behind counts shown on the buttons.
- **Branch switcher** dropdown with a "Create new branch…" action, plus `Gitable: Push / Pull / Create Branch / Switch Branch` commands.
- SVG icons on the Changes / History / Settings tabs.
- Extension-based **file-type icons** on file rows (broad coverage across major languages — JS/TS, Python, Java, C#/.NET, C/C++, Go, Rust, Ruby, PHP, Swift, Kotlin, Dart, Scala, shells, batch/PowerShell, SQL, config — and images), and right-side **status markers** (yellow dot = modified, green + = added/untracked, red − = deleted, blue dot = renamed).
- Visible **working indicator** (button spinner + status text) during AI generation, key validation, model loading, and push/pull.

### Changed

- AI generation moved **into the Summary field** as an inline action (divider + sparkle) with a hover tooltip showing the active provider and model.
- Removed the repository switcher dropdown (the header now shows the repo name) and the redundant view-title action icons.

## [0.0.2] - 2026-06-05

### Added

- Brand redesign of the panel using the Gitable logo palette (navy + pastel pink).
- Provider brand icons (OpenAI, Gemini, Claude) shown in the provider dropdown and settings status.
- Inline SVG icons throughout (no emojis/unicode glyphs).

### Changed

- Replaced native `<select>` elements with custom dropdowns that work reliably in the webview.
- Models are fetched **live** from the provider and filtered with regex to main chat models (max 12); the model dropdown now appears only after the API returns models. Nothing is hardcoded.

### Removed

- Static `FALLBACK_MODELS` / `DEFAULT_MODELS` lists.

## [0.0.1] - 2026-06-05

### Added

- Initial MVP of the Gitable sidebar panel (GitHub Desktop–style) in the VS Code Activity Bar.
- Repository selector, current branch display, and refresh.
- **Changes** tab: staged/unstaged file lists with status, per-file and bulk stage/unstage, and selection-based actions.
- Commit summary and description inputs with a Commit action.
- **History** tab: recent commits (short hash, subject, author, relative date).
- **Settings** tab: provider selection, secure API key storage (SecretStorage), key validation, and live-fetched model list with a static fallback.
- AI commit-message generation from the staged diff for **OpenAI**, **Gemini**, and **Claude**.
- `DiffLimiter` that excludes generated/noisy files and truncates diffs (default 40,000 characters).
- Git integration preferring the built-in VS Code Git API with a cross-platform `execFile`-based CLI fallback.
- Commands: `gitable.refresh`, `gitable.generateCommitMessage`, `gitable.commit`, `gitable.stageAll`, `gitable.unstageAll`, `gitable.openSettings`, `gitable.validateApiKey`.

[Unreleased]: https://github.com/piyushdoorwar/gitable/compare/v0.0.13...HEAD
[0.0.13]: https://github.com/piyushdoorwar/gitable/compare/v0.0.12...v0.0.13
[0.0.12]: https://github.com/piyushdoorwar/gitable/compare/v0.0.11...v0.0.12
[0.0.11]: https://github.com/piyushdoorwar/gitable/compare/v0.0.10...v0.0.11
[0.0.10]: https://github.com/piyushdoorwar/gitable/compare/v0.0.9...v0.0.10
[0.0.9]: https://github.com/piyushdoorwar/gitable/compare/v0.0.8...v0.0.9
[0.0.8]: https://github.com/piyushdoorwar/gitable/compare/v0.0.7...v0.0.8
[0.0.7]: https://github.com/piyushdoorwar/gitable/compare/v0.0.6...v0.0.7
[0.0.6]: https://github.com/piyushdoorwar/gitable/compare/v0.0.5...v0.0.6
[0.0.5]: https://github.com/piyushdoorwar/gitable/compare/v0.0.4...v0.0.5
[0.0.4]: https://github.com/piyushdoorwar/gitable/compare/v0.0.3...v0.0.4
[0.0.3]: https://github.com/piyushdoorwar/gitable/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/piyushdoorwar/gitable/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/piyushdoorwar/gitable/releases/tag/v0.0.1
