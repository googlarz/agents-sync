# agents-sync Roadmap

---

## Shipped

### v1.0.0 — Initial release

Core pipeline: scan codebase → Claude API extraction → canonical `AGENTS.md` → derive tool files for Claude Code, Cursor, GitHub Copilot, Gemini, Windsurf, and Cline. MCP server + CLI. Custom section preservation. Drift detection, validate, status, export, snapshot.

### v1.1.0 — Lint command

`agents-sync lint` checks the codebase against every mechanically-verifiable `Never` rule in `AGENTS.md`. Returns a list of violations with file and line. `--ci` flag exits 1 for use in CI pipelines. `agents_sync_lint` MCP tool.

### v1.2.0 — Roo Code + Aider + project skills scanner

Added Roo Code (`.roomodes`) and Aider (`CONVENTIONS.md`) as derived tool targets — now supporting 8 AI coding tools. Added project-local skill scanner: detects `.claude/commands/` and `.claude/skills/` and surfaces them in the generated `CLAUDE.md`.

### v1.3.0 — MCP server detection + skill recommendations

Scanner detects MCP servers configured in `.claude/settings.json` and `.claude/settings.local.json`. Detected servers are documented in the generated `AGENTS.md` and `CLAUDE.md`. `CLAUDE.md` generation now includes stack-aware Claude Code skill recommendations (e.g. suggests `test-driven-development` for Vitest projects).

### v1.4.0 — `scan` command + improved first-run UX

`agents-sync scan .` (and `agents_sync_scan` MCP tool) runs the full scanner with no API key and prints what was detected — language, framework, dependencies, MCP servers, local skills, gotchas, and a ready-to-run `init` command. When `ANTHROPIC_API_KEY` is missing, `init`/`sync` now run `scan` first and show what was found before explaining setup — turning a dead-end error into a funnel.

### v1.5.0 — `install-hook` command

`agents-sync install-hook .` installs a pre-commit hook that blocks commits when AI context files have drifted from `AGENTS.md`. Auto-detects **husky**, **lefthook**, or plain **git hooks**. Idempotent — safe to re-run. `--dry-run` previews changes. `agents_sync_install_hook` MCP tool.

---

## Upcoming

Items are ordered roughly by expected implementation sequence.

---

## v2.0 — GitHub App: automated PR-based sync

### Problem

`agents-sync sync` is a command users must remember to run. After a large refactor, dependency
upgrade, or architecture change, context files go stale silently. The GitHub Action workflow
(see `docs/github-action.yml`) catches drift on a schedule, but it requires per-repo setup and
produces automated commits rather than reviewed changes.

### What we're building

A GitHub App that installs once per organization and handles sync automatically:

1. **Webhook listener** — monitors `push` events for changes to package.json, pyproject.toml,
   Cargo.toml, go.mod, and structural changes (new top-level directories).
2. **Drift analysis** — runs `agents-sync drift` against the updated branch. No Claude API call
   unless drift is HIGH.
3. **PR creation** — when drift is HIGH, calls the Claude API, re-generates all context files,
   and opens a PR titled `chore: sync AI context files` with a diff summary and drift report.
4. **Comment on existing PRs** — when a PR changes manifests or project structure, posts a
   comment: "⚠ This PR may drift AI context files. Run `/agents-sync sync` after merging."
5. **OAuth dashboard** — repo-level opt-in/opt-out, per-tool file toggles, API key management.

### Why this matters

The core value proposition of agents-sync is *zero maintenance*. The CLI and GitHub Action
require manual steps. A GitHub App makes sync truly automatic — install once, never think
about it again. This also enables multi-repo organizations: one app installation keeps dozens
of repos in sync.

### Key design decisions

- **Stateless compute**: App runs on Vercel Edge Functions or AWS Lambda. No persistent server.
- **No stored secrets**: Anthropic API keys are stored encrypted per-installation using GitHub's
  secret store API — never in agents-sync infrastructure.
- **Idempotent PRs**: if a sync PR is already open, the App updates it rather than opening a
  duplicate.
- **Permissions**: requests only `contents: write` and `pull_requests: write`. No repo-wide
  read access beyond the files it needs.
- **Rate limiting**: Claude API calls are debounced per-repo (max 1 extraction per 4 hours)
  to prevent runaway costs on repos with high commit frequency.

### Success criteria

- Organization installs the App → first sync PR appears within 10 minutes of the next
  qualifying push event, with no additional configuration.
- A repo with 3 PRs per day produces at most 3 sync PRs per week (debouncing works).
- Uninstalling the App removes all webhooks and stored tokens within 60 seconds.

### Open questions

- **Pricing model**: free tier (N repos) + paid for unlimited? per-seat? per-API-call?
- **Anthropic API key ownership**: user-provided key vs. proxied through agents-sync?
- **Monorepo support**: per-subdirectory AGENTS.md files — out of scope for v2.0.

### Estimated effort

Large — 3–4 weeks for a production-ready v1 including OAuth dashboard.

---

## v2.1 — Multi-LLM backends

### Problem

agents-sync is hard-wired to Anthropic's Claude API. This blocks adoption in teams with
Gemini or Azure OpenAI contracts, teams in jurisdictions where Anthropic service is
unavailable, and teams running air-gapped environments with local models.

### What we're building

A provider abstraction layer:

```json
// agents-sync.config.json
{
  "llm": {
    "provider": "openai",
    "model": "gpt-4o",
    "apiKeyEnv": "OPENAI_API_KEY"
  }
}
```

Supported providers at launch:
- **Anthropic** (default) — `claude-sonnet-4-6` / `claude-haiku-4-5` selectable
- **OpenAI** — `gpt-4o`, `gpt-4o-mini`
- **Google Gemini** — `gemini-2.0-flash`, `gemini-2.5-pro`
- **Ollama** (local) — any model served at `localhost:11434`
- **OpenAI-compatible** — any endpoint matching the OpenAI chat completions API (Azure, Together, Groq) via `baseUrl` override

### Architecture

`callClaude` in `src/lib/claude-client.ts` becomes `callLLM` with a provider interface:

```typescript
interface LLMProvider {
  complete(system: string, user: string, maxTokens: number): Promise<{ content: string }>;
}
```

### Success criteria

- `agents-sync init .` with `provider: "openai"` produces AGENTS.md of comparable quality
  to Claude on the standard Next.js fixture.
- Ollama integration works with `llama3.1:8b` — may produce lower-quality output but must
  not crash.
- Switching providers requires only config changes.

### Estimated effort

Medium — 1–2 weeks. Provider interface is clean; prompt tuning for non-Claude models is where
most time goes.

---

## v2.2 — VS Code extension

### What we're building

A lightweight VS Code extension (compatible with VS Code, Cursor, and Windsurf):

- **Status bar**: `$(check) AI context: in sync` / `$(warning) AI context: drifted`
- **Commands**: Initialize, Sync now, Check drift, Validate — all from the Command Palette
- **Explorer decorations**: managed files show sync status; clicking opens diff vs. what
  `export` would regenerate

The extension shells out to the CLI — no bundled copy of the core library. This keeps it
lightweight and ensures it uses the version in `devDependencies`.

### Success criteria

- Installs from VS Code Marketplace in < 30 seconds
- Status bar updates within 2 seconds of a `package.json` save
- Works in Cursor and Windsurf
- Read-only operations (drift, validate, status) require no API key

### Estimated effort

Medium-large — 2–3 weeks for a publishable extension with status bar, commands, and decorations.

---

## v2.3 — File watcher daemon

### What we're building

`agents-sync watch .` — a long-running daemon that monitors for meaningful changes and
re-syncs automatically. Applies the same drift detection logic as `drift`: only triggers
a Claude API call when drift reaches HIGH severity. Changes are debounced to prevent
thrashing during active refactors.

```
[agents-sync] watching /your/project
[agents-sync] 14:22:01 LOW drift detected (3 new files in src/features/)
[agents-sync] 14:35:17 HIGH drift: new dependency drizzle-orm detected
[agents-sync] 14:35:47 syncing… (30s quiet period elapsed)
[agents-sync] 14:36:12 ✓ synced — 4 files updated
```

Integrates with the VS Code extension via a Unix socket when both are running.

### Success criteria

- Consumes < 50MB RAM on a 50k-file TypeScript monorepo
- No more than 3 Claude API calls per hour in normal development
- Re-sync after `npm install` completes within 90 seconds

### Estimated effort

Medium — 1.5–2 weeks.

---

## Sequencing note

```
v1.5.0 (current) ──► v2.0 (GitHub App)
                 └──► v2.1 (multi-LLM)
                 └──► v2.2 (VS Code extension) ──► v2.3 (file watcher daemon)
```

- **v2.0** (GitHub App) is highest leverage: zero-maintenance sync for teams and organizations.
- **v2.1** (multi-LLM) and **v2.0** are independent tracks.
- **v2.2** (VS Code extension) depends on a stable CLI API.
- **v2.3** (file watcher) benefits from v2.2 IPC — start last.
- **v2.1** (multi-LLM) unlocks enterprise/air-gapped market; prioritize if API key friction
  proves to be the top adoption barrier.
