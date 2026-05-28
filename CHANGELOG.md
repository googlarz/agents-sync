# Changelog

All notable changes to `@googlarz/agents-sync` are documented here.

---

## [1.7.0] — 2026-05-28

### Added
- **`@AGENTS.md` import in CLAUDE.md** — `CLAUDE.md` now starts with `@AGENTS.md` so Claude Code reads the canonical context file directly instead of a duplicated copy. Claude Code-specific additions (skill recommendations, local skills, management note) are appended after the import. Existing AGENTS.md + CLAUDE.md users get this automatically on the next sync — no action required.
- **SessionStart hook** — `install-hook` now also writes a `SessionStart` hook to `.claude/settings.json` that auto-loads `AGENTS.md` as a `<system-reminder>` at the start of every Claude Code session. Works even in nested subdirectories (walks to git root). Opt-out with `--no-session-hook` flag or `sessionHook: false` in the MCP tool.
- **Uninstall removes SessionStart hook** — `uninstall-hook` now also cleans up the SessionStart entry from `.claude/settings.json`, leaving other hooks untouched.

### Tests
- 8 new unit tests: SessionStart hook creation, merge with existing settings, idempotency, dry-run, opt-out, uninstall (single-entry removal), uninstall (multi-entry preservation)

---

## [1.6.0] — 2026-05-23

### Added
- **Single-call Claude pipeline** — `init` and `sync` now make one API call instead of two (corpus → AGENTS.md directly). Cuts latency from 30-60s to ~15-30s and halves API cost. No output quality loss — Claude has the full corpus context when writing AGENTS.md.
- **Template-based zero-cost init** — when `ANTHROPIC_API_KEY` is not set, `init` and `sync` fall back to stack-specific templates (TypeScript/Node, Python, Go, Rust, Java, generic). Generates a complete, usable AGENTS.md with no API call. Upgrade to AI-powered output at any time by adding an API key.
- **`--dry-run` now shows content** — init/sync/derive dry-run output shows the first 40 lines of the generated AGENTS.md and a per-tool preview (first 25 lines each), so you can see exactly what would be written before committing.
- **Published GitHub Action** — `action.yml` at the repo root enables `uses: googlarz/agents-sync@v1` in any CI workflow. Inputs: `anthropic-api-key`, `project-path`, `tools`, `fast`, `create-pr`. Outputs: `changed`, `pr-url`. Auto-creates a PR when context files drift.
- **`metadataFromCorpus`** — new exported function that infers `ProjectMetadata` (language, framework, testing, database, auth, deploy, other stack) from the scanner corpus without any API call. Used by templates, skill recommendations, and snapshot metadata.

### Tests
- 33 new unit tests: 14 for templates (stack detection + per-stack rendering), 13 for `metadataFromCorpus` (all inferred fields), 6 for dry-run preview in `deriveAll`

---

## [1.5.8] — 2026-05-22

### Fixed
- **`agents-sync.config.json` now accepts `kiro` and `trae`** — `ToolNameSchema` was missing the two new tools; passing them in the config `tools` array would throw a Zod parse error

### Docs
- `skill/SKILL.md` — added `derive` command, full 11-tool list, complete MCP dispatch table
- `docs/github-action.yml` — PR body now lists all 11 generated files
- `docs/agents-md-spec.md` — derivation diagram updated for all 10 tool files

---

## [1.5.7] — 2026-05-22

### Added
- **Kiro IDE support** — derives `.kiro/steering/agents-sync.md` (Amazon Kiro uses steering docs for AI context)
- **Trae IDE support** — derives `.trae/rules/agents-sync.md` (ByteDance Trae VS Code fork)
- **`derive` command / MCP tool** — re-derives all tool files from the current AGENTS.md without re-running the scanner or calling the Claude API; use after manually editing AGENTS.md
- **Codegraph section in AGENTS.md** — when a `.codegraph/` index is present, `init`/`sync` appends a Code Graph section surfacing hub nodes and communities
- **Fast sync refreshes MCP + codegraph sections** — free, no API call required; prints ⚡ notice when fast mode is active
- **Drift detects deleted managed files** — if `.cursorrules`, `.kiro/steering/agents-sync.md`, or any other managed file is deleted, `drift` now flags HIGH severity

### Tests
- 20 new unit tests: kiro deriver (10), trae deriver (10)

---

## [1.5.6] — 2026-05-22

### Fixed
- **Husky v9 compatibility** — generated hooks no longer write `. "$(dirname "$0")/_/husky.sh"` on projects where that file is absent (husky v9 removed it); the sourcing line is included only when `_/husky.sh` actually exists
- **Husky hook now blocks commits on failure** — added explicit `echo + exit 1` so drift failures are surfaced with a message, not silently ignored
- **`install-hook` lefthook target** — writes to the project's actual lefthook config file (`lefthook.yml`, `.lefthook.yaml`, etc.) instead of always creating `.lefthook.yml`
- **`validate --strict` no longer fails on fresh clones** — context files that exist without a snapshot baseline are reported as `in-sync` (no comparison possible); only missing files fail `--strict`
- **`drift --ci` catches deleted AGENTS.md** — a missing AGENTS.md now returns HIGH drift immediately, so pre-commit hooks block the commit
- **`sync --fast` updates snapshot timestamp** — `syncedAt` is saved after fast syncs so `daysSinceSync` in `status` stays accurate
- **CLI `export` validates tool name** — unknown tool names now exit with a clear error instead of silently succeeding

### Tests
- 10 new unit tests covering all 7 fixes: validate no-snapshot behavior, drift missing-AGENTS.md, husky v8/v9 detection, husky failure message, lefthook config file resolution, lefthook glob filter, and fast sync timestamp update

---

## [1.5.5] — 2026-05-20

### Added
- **Spinner during extraction** — "extracting with Claude…" now shows a cycling spinner in TTY environments instead of hanging silently for 15-30s; falls back to a plain log line in CI/pipes
- **`AGENTS_SYNC_MODEL` env var** — override the Claude model used for extraction (e.g. `AGENTS_SYNC_MODEL=claude-haiku-4-5-20251001` for faster/cheaper runs)

---

## [1.5.4] — 2026-05-20

### Tests added
- `tests/unit/scanner/manifest.test.ts` — 4 new tests covering Maven (pom.xml), Gradle (build.gradle), Ruby (Gemfile), and PHP (composer.json) parsers added in v1.5.3

---

## [1.5.3] — 2026-05-20

### Fixed
- **Config schema now includes `roo` and `aider`** — `agents-sync.config.json` previously rejected these tools with a cryptic Zod parse error.
- **`uninstall-hook` uses sentinel blocks** — the previous line-filter approach could destroy unrelated hook content. All installs now wrap the drift check in `# BEGIN agents-sync` / `# END agents-sync` sentinels; uninstall removes only that block, leaving the rest of the hook file intact. Line-filter fallback retained for older installs and lefthook YAML.
- **`status` detects when AGENTS.md has been edited** — `driftScore` is now `"modified"` when the AGENTS.md hash differs from the snapshot, giving an actionable signal without a full codebase scan.
- **`agents_sync_drift` MCP tool supports `ci` param** — pass `ci: true` to get `isError: true` in the response when drift is HIGH, enabling programmatic pre-commit blocking via MCP.
- **`export --dry-run` now honoured** — the `--dry-run` flag was parsed by the CLI but not forwarded to `runExport`; the tool always wrote files regardless of the flag.
- **`lint` report now includes skipped rule count** — reports how many rules could not be checked mechanically so users know to review them manually.
- **Java (Maven/Gradle), Ruby, and PHP manifest parsing** — `scanManifest` now parses `pom.xml`, `build.gradle`/`build.gradle.kts`, `Gemfile`, and `composer.json`.

### Tests added
- `tests/unit/sync.test.ts` — fast-mode logic and error path tests
- `tests/unit/scan-report.test.ts` — report structure and language detection tests

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
