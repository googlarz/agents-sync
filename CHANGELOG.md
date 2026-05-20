# Changelog

All notable changes to `@googlarz/agents-sync` are documented here.

---

## [1.5.2] — 2026-05-20

### Fixed
- **Validate now correctly detects drift in tool files** — snapshots previously stored `sha256("")` for all tool files, making all hash comparisons false. `init`, `sync`, and `export` now store the actual content hash. The spurious bypass `&& managed.sha256 !== ""` in validate is removed.
- **`roo` (`.roomodes`) and `aider` (`CONVENTIONS.md`) now validated** — both tools were generated but excluded from `TOOL_PATHS` in validate, so they were never checked.
- **Semantic drift MEDIUM correctly upgrades LOW structural drift** — previously a MEDIUM semantic signal (e.g. deployment target mismatch) was ignored when structural drift was already `LOW`.
- **`export` inserts new snapshot entry when tool was never previously tracked** — previously the hash update only mapped existing entries; if the tool wasn't in the snapshot it was silently skipped.
- **`derivers/index.ts` now exposes `contentHash`** on `DerivationResult` — eliminates the need for callers to re-read written files to get a hash.

### Tests added
- `tests/unit/validate.test.ts` — 7 tests covering in-sync, drifted, missing, no-snapshot, roo, aider, and report format
- `tests/unit/status.test.ts` — 6 tests covering all status paths
- `tests/unit/export.test.ts` — 4 tests covering throws, writes, and snapshot-hash update
- `tests/unit/drift.test.ts` — 2 new tests: MEDIUM severity path and semantic signal detection

---

## [1.5.1] — 2026-05-20

### Fixed
- `init` and `sync` now emit progress to stderr (`scanning codebase…` / `extracting with Claude…`) so you can see what's happening during long runs
- `export` now updates the snapshot hash after writing — `validate` no longer flags freshly exported files as drifted
- `uninstall-hook` — removes agents-sync pre-commit hook from husky, lefthook, or plain git hooks
- `validate` without `--strict` now exits 0 (informational) — pass `--strict` or `--ci` to get exit 1 in CI
- `agents_sync_uninstall_hook` MCP tool added

---

## [1.5.0] — 2026-05-20

### Added
- `agents-sync install-hook .` — installs a pre-commit hook that blocks commits when AI context files have drifted from `AGENTS.md`
  - Auto-detects **husky**, **lefthook**, or plain **git hooks**
  - `--husky`, `--lefthook`, `--git` flags to force a specific manager
  - `--dry-run` previews changes without writing
  - Idempotent — safe to re-run
- `agents_sync_install_hook` MCP tool
- `validate --strict` / `validate --ci` — exits 1 when any file is out of sync (CI gate)
- `agents_sync_validate` MCP tool now accepts `strict` parameter

---

## [1.4.0] — 2026-05-20

### Added
- `agents-sync scan .` — scans codebase with no API key, prints detected language, framework, dependencies, MCP servers, local skills, and gotchas
- `agents_sync_scan` MCP tool
- When `ANTHROPIC_API_KEY` is missing, `init`/`sync` now run `scan` first and show what was detected before explaining setup
- Roo Code (`.roomodes`) and Aider (`CONVENTIONS.md`) as derived tool targets (now 9 AI tools total)
- Project-local skill scanner: detects `.claude/commands/` and `.claude/skills/`

---

## [1.3.0] — 2026-05-20

### Added
- MCP server detection from `.claude/settings.json` and `.claude/settings.local.json`
- Detected servers documented in generated `AGENTS.md` and `CLAUDE.md`
- Stack-aware Claude Code skill recommendations in `CLAUDE.md` (e.g. suggests `test-driven-development` for Vitest projects)

---

## [1.2.0] — 2026-05-20

### Added
- Roo Code (`.roomodes`) as a derived tool target
- Aider (`CONVENTIONS.md`) as a derived tool target
- Project-local skill scanner: detects `.claude/commands/` and `.claude/skills/` and surfaces them in the generated `CLAUDE.md`

---

## [1.1.0] — 2026-05-20

### Added
- `agents-sync lint` — checks codebase against every mechanically-verifiable `Never` rule in `AGENTS.md`
- Returns violations with file and line number
- `--ci` flag exits 1 for use in CI pipelines
- `agents_sync_lint` MCP tool
- Semantic drift detection: compares AGENTS.md stack claims against actual manifests

---

## [1.0.0] — 2026-05-20

### Added
- Core pipeline: scan → Claude API extraction → canonical `AGENTS.md` → derive tool files
- Supported tools: Claude Code (`CLAUDE.md`), Cursor (`.cursorrules`), GitHub Copilot (`copilot-instructions.md`), Gemini CLI (`GEMINI.md`), Windsurf (`.windsurfrules`), Cline (`.clinerules`)
- MCP server with `init`, `sync`, `drift`, `export`, `validate`, `status` tools
- CLI with all commands + `--dry-run`, `--fast`, `--ci`, `--tools` flags
- Custom section preservation — manual additions survive every resync
- Drift detection with snapshot-based comparison
- `--repomix-output` flag to use repomix XML as source corpus
- GitHub Action workflow (`docs/github-action.yml`)
