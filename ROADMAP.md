# agents-sync Roadmap

Items are ordered roughly by expected implementation sequence. v1.1 and v1.2 are strategic bets
that change what agents-sync *is*; v1.3–v1.5 are capability expansions that widen the addressable
audience.

---

## v1.1 — GitHub App: Automated PR-based sync

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

### Open questions before building

- **Pricing model**: free tier (N repos) + paid for unlimited? per-seat? per-API-call?
  This determines infrastructure choices significantly.
- **Anthropic API key ownership**: does the user provide their own key, or do we proxy through
  agents-sync's key and charge per-use? Proxying simplifies onboarding but adds cost/liability.
- **Monorepo support**: repos with multiple sub-projects need per-subdirectory AGENTS.md files.
  Out of scope for v1.1 but must be designed for.

### Prerequisites

- v1.0.0 published and validated against real user codebases
- OAuth app registered with GitHub
- Infrastructure decision (Vercel vs. AWS vs. Fly.io)

### Estimated effort

Large — 3–4 weeks for a production-ready v1 of the App including OAuth dashboard.

---

## v1.2 — Category leadership: "The prettier of AI context"

### Problem

agents-sync is currently a *generator* — it writes files that users check in and maintain.
The promise is strong, but the positioning is weak: "generate AI context files" competes with
"write it yourself once." The real moat is not generation, it's *continuous enforcement*.

Prettier succeeded not because it *helped* teams format code, but because it made formatting
a *non-decision*. You commit, prettier runs, formatting is enforced. No one argues about tabs
vs. spaces ever again.

agents-sync can occupy the same position for AI context files: **the tool that ensures your
AI tools always see the correct context, automatically, without human intervention.**

### What we're building

Three capabilities that together make agents-sync non-optional:

#### 1. Pre-commit hook / lefthook integration

```bash
# .lefthook.yml
pre-commit:
  commands:
    agents-sync:
      run: npx @googlarz/agents-sync drift . --ci
      fail_text: "AI context files are out of sync. Run: agents-sync sync ."
```

A first-class `lefthook` + `husky` integration that blocks commits when drift is HIGH.
Ships as a documented one-liner in the README, with a `agents-sync install-hook` command
that writes the config automatically.

**Why this matters**: forces sync *at the commit boundary*, not "sometime later." Stale context
becomes impossible to commit, not just discouraged.

#### 2. `agents-sync validate --strict` for CI

Extend the existing validate command with a `--strict` flag that exits 1 on ANY drift
(not just HIGH). Provides a GitHub Actions step:

```yaml
- name: Verify AI context files are in sync
  run: npx @googlarz/agents-sync validate . --strict
```

Teams can gate PRs on this check. agents-sync becomes part of the definition of "green CI."

#### 3. VSCode / Cursor extension (stretch goal)

A lightweight IDE extension that:
- Shows a status bar item: "AI context: in sync ✓" or "AI context: drifted ⚠"
- Offers a one-click "Sync now" action
- Highlights stale sections in CLAUDE.md / AGENTS.md when the underlying code has changed

This is the *ambient* positioning — the tool is always present, always visible, always enforcing
consistency. Teams stop thinking about it as something to run and start thinking of it as
infrastructure.

### Positioning statement (after v1.2)

> agents-sync is the prettier of AI context files. Install it once. It enforces consistency
> automatically, at every commit and PR. Your AI tools always see the correct project context —
> no matter which tool, no matter which developer, no matter how fast the codebase moves.

This is structurally difficult for competitors to copy:
- **Cursor** generates `.cursorrules` but doesn't enforce consistency with other tools
- **Claude Code** has `CLAUDE.md` but no drift detection or cross-tool sync
- **copilot-instructions.md** is static — no tooling around it

agents-sync owns the *consistency* layer that every tool assumes someone else handles.

### Success criteria

- `agents-sync install-hook` command works for husky and lefthook in < 30 seconds
- `validate --strict` exits 1 on files with any drift from AGENTS.md
- 3 public repos adopt the CI check within 30 days of release (measurable via GitHub search)

### Open questions

- **VSCode extension**: worth building before meaningful GitHub App traction? Risk: too much
  surface area before product-market fit. Lean toward CLI-first, extension only after v1.1
  traction confirms the core loop.
- **Lint rule integration**: should agents-sync expose an ESLint/oxc rule that warns when
  conventions in AGENTS.md are violated in code? High complexity, unclear demand.

### Prerequisites

- v1.0.0 with real user feedback on what drift scenarios are most painful
- At least 50 GitHub stars (signal that the core loop resonates before expanding surface)

### Estimated effort

Medium — 1–2 weeks for hook integration and strict CI mode. Extension is a separate track
(2–3 weeks minimum for a publishable VSCode extension).

---

## v1.3 — Multi-LLM backends

### Problem

agents-sync is hard-wired to Anthropic's Claude API. This blocks adoption in three segments:
teams with Gemini or Azure OpenAI contracts, teams in jurisdictions where Anthropic service
is unavailable, and teams running air-gapped environments with local models (Ollama, LM Studio).
Today those users simply cannot use agents-sync.

### What we're building

A provider abstraction layer that lets users swap out the LLM backend without changing anything
else:

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
- **Anthropic** (default, unchanged) — `claude-sonnet-4-5` / `claude-haiku-4-5` selectable
- **OpenAI** — `gpt-4o`, `gpt-4o-mini`
- **Google Gemini** — `gemini-1.5-pro`, `gemini-1.5-flash`
- **Ollama** (local) — any model served at `localhost:11434`
- **OpenAI-compatible** — any endpoint matching the OpenAI chat completions API (Azure, Together,
  Groq, etc.) via `baseUrl` override

### Architecture

The `callClaude` function in `src/lib/claude-client.ts` becomes `callLLM` with a provider
interface:

```typescript
interface LLMProvider {
  complete(system: string, user: string, maxTokens: number): Promise<{ content: string }>;
}
```

Each provider implements this interface. The loader (`src/lib/llm-provider.ts`) reads config and
returns the appropriate provider. No other code changes — extractor, generator, and derivers are
all provider-agnostic.

### Quality considerations

Extraction quality varies significantly by model. The structured JSON extraction prompt was tuned
for Claude. GPT-4o produces comparable results; smaller/local models often fail Zod validation.

Mitigation:
- Add a `--validate-extraction` flag that runs the extraction against a known fixture and reports
  quality metrics before using a non-default provider in production.
- Document per-provider quality benchmarks (precision/recall on convention extraction from test
  fixtures).

### Success criteria

- `agents-sync init .` with `provider: "openai"` produces AGENTS.md of comparable quality to
  Claude on the standard Next.js fixture (validated by the fixture test suite).
- Ollama integration works with `llama3.1:8b` on the Django fixture — may produce lower-quality
  output but must not crash.
- Switching providers does not require code changes, only config changes.

### Open questions

- **Prompt tuning per provider**: Claude's prompt uses specific XML-like structure that other
  models handle differently. Maintain one prompt or per-provider prompts? Per-provider is
  higher quality but doubles maintenance surface.
- **Token counting**: Claude uses its own token counting; OpenAI uses tiktoken. The scanner
  budget logic (`src/lib/token-estimate.ts`) currently uses a rough char/4 estimate — good
  enough for Claude, may cause context overflow with smaller context-window models.

### Estimated effort

Medium — 1–2 weeks. Provider interface is clean to implement; prompt tuning for non-Claude
models is where most time will go.

---

## v1.4 — VS Code extension

### Problem

The CLI and MCP integration serve developers who already know agents-sync exists. A VS Code
extension installs it at the point of work: when a developer opens a project, they see
immediately whether context files are in sync, and can sync with one click. This is the
*discovery* surface — the place where most developers will first encounter agents-sync.

The extension also makes agents-sync visible in the editor where Cursor, Copilot, and Cline
operate — a natural fit for a tool that manages their context.

### What we're building

A lightweight VS Code extension (compatible with VS Code, Cursor, and Windsurf's VS Code fork):

#### Status bar

```
$(sync~spin) AI context: syncing…   →   $(check) AI context: in sync   →   $(warning) AI context: drifted
```

Clicking the status bar item opens the agents-sync output panel.

#### Commands (Command Palette)

- `agents-sync: Initialize project` — runs `init` in the workspace root
- `agents-sync: Sync now` — runs `sync`
- `agents-sync: Check drift` — runs `drift`, shows results in a panel
- `agents-sync: Validate` — runs `validate`, highlights out-of-sync files in Explorer

#### Workspace decorations

Files managed by agents-sync (`CLAUDE.md`, `.cursorrules`, etc.) get a subtle decoration
in the Explorer indicating sync status. Clicking opens the diff between current content and
what `export` would regenerate.

#### Settings

```json
{
  "agents-sync.autoCheckOnSave": true,
  "agents-sync.checkIntervalMinutes": 60,
  "agents-sync.anthropicApiKey": ""
}
```

### Technical approach

The extension shells out to the CLI (`npx @googlarz/agents-sync`) — no bundled copy of the
core library. This keeps the extension lightweight and ensures it always uses the version
installed in the project (`devDependencies`), not a pinned copy.

For the MCP case (Claude Code / Cursor with MCP enabled), the extension detects the MCP server
and delegates to it via the VS Code MCP client API rather than shelling out.

### Success criteria

- Extension installs from VS Code Marketplace in < 30 seconds (no heavy bundled dependencies)
- Status bar updates within 2 seconds of a `package.json` save
- Works in Cursor and Windsurf (VS Code API surface used is limited to stable APIs present in
  both forks)
- Does not require an Anthropic API key for read-only operations (drift, validate, status)

### Open questions

- **JetBrains**: there is no VS Code extension compatibility. A separate JetBrains plugin would
  require a full Java/Kotlin implementation. Out of scope until VS Code extension has traction.
- **Telemetry**: anonymous usage telemetry (which commands are used, which providers) would
  inform product decisions significantly. Requires explicit opt-in and a privacy policy.

### Prerequisites

- v1.2 (CLI hook integration) shipped so the extension has a stable `validate --strict` command
  to surface in the UI
- Stable semver CLI interface (no breaking changes after v1.0.0)

### Estimated effort

Medium-large — 2–3 weeks for a publishable extension with status bar, commands, and basic
decorations. Marketplace listing and CI publishing pipeline add 2–3 days.

---

## v1.5 — File watcher daemon

### Problem

The CLI is pull-based: users must remember to run `sync` after significant changes. The GitHub
Action catches drift on a schedule or on push. The pre-commit hook catches it at commit time.
But none of these provide *real-time* feedback during active development — the moment when a
developer is in the middle of a refactor and their context files are drifting away from reality.

A file watcher daemon provides ambient, continuous sync: context files stay current at all times,
without any manual trigger.

### What we're building

A long-running daemon (`agents-sync watch`) that monitors the project for meaningful changes
and re-syncs automatically:

```bash
agents-sync watch .            # watches project, re-syncs on significant changes
agents-sync watch . --dry-run  # logs what would be synced without writing
```

#### Trigger logic

Not every file save triggers a re-sync — that would make dozens of API calls per hour.
The daemon applies the same drift detection logic as `agents-sync drift`:

1. Monitor `package.json` / `pyproject.toml` / `Cargo.toml` / `go.mod` for changes
2. Monitor top-level directory structure (new dirs, removed dirs)
3. Monitor `src/` for new files (scan every 5 minutes, not on every save)

A re-sync triggers only when drift reaches HIGH severity. LOW and MEDIUM drift are accumulated
and reported in the terminal but do not trigger an API call.

#### Debouncing

File changes are debounced: after a qualifying change, the daemon waits 10 seconds before
running drift detection (coalesces rapid successive changes). If drift is HIGH, it waits for
a configurable quiet period (default: 30 seconds with no further qualifying changes) before
calling the Claude API. This prevents thrashing during active refactors.

#### Output

```
[agents-sync] watching /your/project
[agents-sync] 14:22:01 LOW drift detected (3 new files in src/features/)
[agents-sync] 14:35:17 HIGH drift: new dependency drizzle-orm detected
[agents-sync] 14:35:47 syncing… (30s quiet period elapsed)
[agents-sync] 14:36:12 ✓ synced — 4 files updated
```

#### Process management

The daemon is a plain Node.js process using `fs.watch` / chokidar. It writes a PID file to
`.agents-sync/daemon.pid` so `agents-sync watch --stop` can terminate it cleanly. A systemd
unit file and launchd plist are provided for users who want daemon-level persistence.

### Integration with the VS Code extension

When the extension detects a running daemon (via the PID file), it subscribes to daemon output
via a Unix socket rather than polling the filesystem. This gives instant status bar updates
without the extension managing its own file watching.

### Success criteria

- Daemon consumes < 50MB RAM on a 50k-file TypeScript monorepo
- Triggers no more than 3 Claude API calls per hour in normal development (measured on the
  agents-sync repo itself during active development)
- `agents-sync watch --stop` terminates the daemon within 1 second
- Re-sync after `npm install` (adding a new package) completes within 90 seconds of the
  package.json change being written

### Open questions

- **chokidar vs. native `fs.watch`**: chokidar is more reliable on macOS but adds a dependency.
  Native `fs.watch` has well-documented issues on macOS (event coalescing, no recursive watch
  in older Node versions). Decision: use chokidar for v1 and revisit.
- **API cost controls**: the daemon should enforce a per-day API call limit (configurable).
  Exceeding the limit disables auto-sync for the rest of the day and logs a warning. The default
  limit (10 calls/day) prevents runaway cost on machines that are left on overnight.
- **Multi-project support**: developers often have multiple projects open simultaneously. Each
  project should have its own daemon instance, managed independently. The `watch` command should
  detect an already-running daemon for the project and connect to it rather than starting a new
  one.

### Prerequisites

- v1.2 (pre-commit hook) complete — daemon and hook share the same drift detection logic and
  should share the implementation
- v1.4 (VS Code extension) ideally complete or in progress — daemon/extension IPC is easier to
  design when both sides are being built together

### Estimated effort

Medium — 1.5–2 weeks for the daemon itself. The VS Code extension IPC adds 3–5 days. systemd /
launchd integration is a separate, optional deliverable (1–2 days).

---

## Sequencing note

```
v1.0.0 ──► v1.2 (hook + strict CI)   ──► v1.4 (VS Code extension)
       └──► v1.1 (GitHub App)         └──► v1.5 (file watcher daemon)
       └──► v1.3 (multi-LLM)
```

- **v1.2** is first because it's the fastest path to being in the developer's workflow.
- **v1.1** (GitHub App) and **v1.3** (multi-LLM) are independent and can run in parallel with
  other tracks.
- **v1.4** (VS Code extension) depends on a stable CLI API — start after v1.0.0 ships.
- **v1.5** (file watcher) shares infrastructure with v1.2 (drift detection) and benefits from
  v1.4 (extension IPC) — start last.
- **v1.3** (multi-LLM) unlocks the enterprise and air-gapped market. Worth prioritizing if early
  user feedback shows API key friction is a top barrier to adoption.
