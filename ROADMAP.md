# agents-sync Roadmap

This document covers planned work beyond v1.0.0. The two items below represent strategic bets,
not incremental features — both change what agents-sync fundamentally *is*.

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

## Sequencing note

v1.1 (GitHub App) and v1.2 (prettier positioning) are independent tracks that can be
parallelized. However:

- v1.1 depends on v1.0.0 being validated on real codebases first (the App is only valuable if
  the generation quality is high enough that auto-PRs don't generate noise)
- v1.2's hook integration can ship in a patch release before v1.1 is complete — it's a
  CLI-only change with no infrastructure dependency

Recommended order: ship v1.0.0 → observe user feedback for 2–4 weeks → start v1.2 hook
integration (quick win) → start v1.1 GitHub App in parallel once quality bar is confirmed.
