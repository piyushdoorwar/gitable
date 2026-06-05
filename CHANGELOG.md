# Changelog

All notable changes to the **Gitable** extension are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/piyushdoorwar/gitable/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/piyushdoorwar/gitable/releases/tag/v0.0.1
