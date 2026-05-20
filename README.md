# agents-sync

**Write your AI context once. Derive it everywhere — automatically.**

**9 AI tools supported · 6 commands need no API key · 100% local**

[![npm](https://img.shields.io/npm/v/@googlarz/agents-sync?style=flat-square&label=npm)](https://www.npmjs.com/package/@googlarz/agents-sync)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green?style=flat-square)](https://nodejs.org)

![Windows](https://img.shields.io/badge/Windows-supported-0078D6?style=flat-square)
![macOS](https://img.shields.io/badge/macOS-supported-555555?style=flat-square)
![Linux](https://img.shields.io/badge/Linux-supported-1793D1?style=flat-square)

[![Claude Code](https://img.shields.io/badge/Claude_Code-supported-E8670A?style=flat-square)](https://claude.ai/code)
[![Cursor](https://img.shields.io/badge/Cursor-supported-4B6EF5?style=flat-square)](https://cursor.com)
[![Codex CLI](https://img.shields.io/badge/Codex_CLI-supported-412991?style=flat-square)](https://github.com/openai/codex)
[![opencode](https://img.shields.io/badge/opencode-supported-7C3AED?style=flat-square)](https://opencode.ai)

`agents-sync` reads your codebase, generates a canonical `AGENTS.md`, and automatically derives tool-specific files for every AI coding tool you use.

One source of truth. No more manually maintaining nine config files that are always out of sync.

---

## The Problem

Every AI coding tool expects its own context file:

| Tool | File |
|---|---|
| Claude Code | `CLAUDE.md` |
| Cursor | `.cursorrules` |
| GitHub Copilot | `.github/copilot-instructions.md` |
| Codex / Amp | `AGENTS.md` |
| opencode | `AGENTS.md` |
| Gemini CLI | `GEMINI.md` |
| Windsurf | `.windsurfrules` |
| Cline | `.clinerules` |
| Roo Code | `.roomodes` |
| Aider | `CONVENTIONS.md` |

If you use more than one tool — and most teams do — you're maintaining these manually. They drift. Conventions you updated in `CLAUDE.md` are still wrong in `.cursorrules`. Your new database is still Postgres in Copilot's mind. A new engineer using Cursor gets guidance that contradicts what Claude Code users know.

This is [GitHub issue #6235](https://github.com/anthropics/claude-code/issues/6235) — **AGENTS.md portability**, **3,914 upvotes**, the most demanded feature in the Claude Code repo. `agents-sync` solves it.

---

## How It Works

```
Your codebase
     │
     ▼
[scan]  manifests · directory tree · source samples · README · FIXME/HACK comments
        MCP servers (.claude/settings.json) · local skills (.claude/commands/)
     │
     ▼
[extract]  Claude API → structured project metadata (stack, conventions, gotchas, boundaries)
     │
     ▼
[generate]  canonical AGENTS.md  ←─── one source of truth
     │
     ├──▶  AGENTS.md         (canonical — read directly by Codex CLI and opencode)
     ├──▶  CLAUDE.md          (superset + Claude Code-specific additions, skill recommendations)
     ├──▶  .cursorrules       (directive-style, < 400 words)
     ├──▶  .github/copilot-instructions.md  (code-level focus, < 300 words)
     ├──▶  GEMINI.md          (full AGENTS.md + Gemini CLI section)
     ├──▶  .windsurfrules     (directive-style, < 400 words)
     ├──▶  .clinerules        (Always/Never sections, < 400 words)
     ├──▶  .roomodes          (Roo Code custom modes)
     └──▶  CONVENTIONS.md    (Aider conventions file)
```

---

## Install

```bash
# No global install needed — use npx
npx @googlarz/agents-sync --help

# Or install globally
npm install -g @googlarz/agents-sync
```

---

## Quick Start

```bash
# See what agents-sync can detect about your project (no API key needed)
npx @googlarz/agents-sync scan .

# Generate all context files
ANTHROPIC_API_KEY=sk-ant-... npx @googlarz/agents-sync init .
```

---

## Setup

### Claude Code

Add to `~/.claude/claude_desktop_config.json` or your project's `.claude/settings.json`:

```json
{
  "mcpServers": {
    "agents-sync": {
      "command": "npx",
      "args": ["@googlarz/agents-sync"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-..."
      }
    }
  }
}
```

Restart Claude Code. Then use the `/agents-sync` skill.

### Cursor

Add to `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "agents-sync": {
      "command": "npx",
      "args": ["@googlarz/agents-sync"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-..."
      }
    }
  }
}
```

### Codex CLI

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.agents-sync]
command = "npx"
args = ["@googlarz/agents-sync"]
env = { ANTHROPIC_API_KEY = "sk-ant-..." }
```

### opencode

Add to `~/.config/opencode/config.json`:

```json
{
  "mcpServers": {
    "agents-sync": {
      "type": "local",
      "command": ["npx", "@googlarz/agents-sync"],
      "environment": {
        "ANTHROPIC_API_KEY": "sk-ant-..."
      }
    }
  }
}
```

> **Note for Codex CLI and opencode users:** agents-sync uses the Anthropic API only for `init` and `sync` — the commands that analyze your codebase and generate context files. All other commands (`scan`, `drift`, `lint`, `validate`, `status`, `export`) make no API calls. Get a key at [console.anthropic.com](https://console.anthropic.com/) — the free tier is sufficient for occasional syncs.

---

## Usage

### Scan first (no API key needed)

Run `scan` before `init` to see exactly what agents-sync detected about your codebase. No API call, no cost, no config required.

```bash
npx @googlarz/agents-sync scan .
```

```
agents-sync scan — my-project

▸ Project
  Language:    typescript
  Framework:   next.js
  Runtime:     node
  Name:        my-project
  Pkg manager: npm

▸ Dependencies
  24 production, 18 dev
  Notable: next, react, prisma, @auth/core, zod, tailwindcss +18 more

▸ Structure
  Top-level dirs: src, public, prisma
  Total files:    ~347
  Entry points:   src/app/page.tsx
  Test dirs:      src

▸ MCP Servers (.claude/settings.json)
  ✓ postgres — PostgreSQL database access
  ✓ github — GitHub API integration

▸ Local Skills & Commands
  ✓ /deploy — Production deployment checklist
  ✓ /db-migrate — Database migration workflow

▸ Gotchas found in source
  FIXME src/lib/auth.ts:42 — token refresh race condition, needs mutex
  HACK  src/api/payments.ts:88 — retry logic bypasses rate limiting

Scanned in 312ms · ~18,400 tokens of context

→ Ready to init. Run:
  ANTHROPIC_API_KEY=<key> npx @googlarz/agents-sync init .
  Get a key: https://console.anthropic.com/
```

### First run

```
/agents-sync init
```

```
✓ AGENTS.md → /your/project/AGENTS.md
✓ claude → /your/project/CLAUDE.md
✓ cursor → /your/project/.cursorrules
✓ copilot → /your/project/.github/copilot-instructions.md
✓ gemini → /your/project/GEMINI.md
✓ windsurf → /your/project/.windsurfrules
✓ cline → /your/project/.clinerules
✓ roo → /your/project/.roomodes
✓ aider → /your/project/CONVENTIONS.md

✓ Snapshot saved to .agents-sync/
  → Add AGENTS.md to git. Add .agents-sync/ to .gitignore.
```

### Check for drift

```
/agents-sync drift
```

```
agents-sync drift report (2026-05-20)
Last sync: 12 days ago

HIGH  New dependency detected: drizzle-orm
      (package.json changed — possible architecture shift)
HIGH  New top-level directory: src/workers/

MED   3 new files with new naming pattern

Recommendation: Re-sync recommended. Run /agents-sync sync.
```

### Re-sync

```
/agents-sync sync
```

```
✓ claude → /your/project/CLAUDE.md
✓ cursor → /your/project/.cursorrules
✓ copilot → /your/project/.github/copilot-instructions.md

  2 custom section(s) preserved
```

### Lint against your AGENTS.md rules

```bash
npx @googlarz/agents-sync lint .
```

Checks your codebase against every mechanically-verifiable rule in your `AGENTS.md` `Never` section — things like "Never instantiate PrismaClient directly" or "Never use `any` type".

```
agents-sync lint

✓ No violations found (12 rules checked)
```

Or with violations:

```
⚠ 2 violation(s) found

  any-type      src/api/webhook.ts:34    parameter typed as 'any' — use 'unknown'
  direct-db     src/jobs/cleanup.ts:12   direct PrismaClient import outside lib/db.ts

Run `agents-sync sync` to refresh your rules, or fix the violations above.
```

Use `--ci` to exit 1 when violations are found (for CI pipelines).

### Validate files are in sync

```
/agents-sync validate
```

```
AGENTS.md (canonical)  ✓

✓ claude      in sync   /your/project/CLAUDE.md
⚠ cursor      DRIFTED   /your/project/.cursorrules
              File was modified after last sync
✓ copilot     in sync   /your/project/.github/copilot-instructions.md

Some files are out of sync. Run /agents-sync sync to fix.
```

### CLI reference

```bash
npx @googlarz/agents-sync scan .                    # No API key — see what scanner detects
npx @googlarz/agents-sync init .                    # Generate all context files
npx @googlarz/agents-sync sync .                    # Re-sync after codebase changes
npx @googlarz/agents-sync drift .                   # Check what changed
npx @googlarz/agents-sync lint .                    # Verify codebase against Never rules
npx @googlarz/agents-sync validate .                # Check files match AGENTS.md
npx @googlarz/agents-sync export cursor .           # Re-derive one file (no API call)
npx @googlarz/agents-sync status .                  # Show sync status
npx @googlarz/agents-sync drift . --ci              # Exit 1 on HIGH drift
npx @googlarz/agents-sync lint . --ci               # Exit 1 on any violations
npx @googlarz/agents-sync init . --tools claude,cursor,roo  # Specific tools only
```

---

## GitHub Action

Keep context files in sync automatically. Copy [`docs/github-action.yml`](docs/github-action.yml) to `.github/workflows/agents-sync.yml` in your repo, then add `ANTHROPIC_API_KEY` to repository secrets.

The workflow:
- Runs every Monday at 9am UTC
- Triggers on `package.json` / `pyproject.toml` / `Cargo.toml` / `go.mod` changes
- Checks drift; when drift is HIGH, re-syncs and opens a PR

---

## What Gets Generated

### Canonical AGENTS.md (abbreviated)

```markdown
# AGENTS.md

<!-- Generated by agents-sync v1.3.0 on 2026-05-20 -->

## Project Overview
Acme Dashboard is an internal analytics tool for the sales team, built with
Next.js 14 App Router, PostgreSQL via Prisma, and NextAuth.

## Tech Stack
- TypeScript / Next.js 14 (App Router)
- PostgreSQL via Prisma ORM
- Authentication: NextAuth v4
- Testing: Vitest (co-located)
- Deploy: Vercel

## Architecture
- `src/app/` — Next.js pages and layouts (App Router)
- `src/features/` — feature modules (dashboard, users, reports)
- `src/lib/` — shared utilities: db singleton, auth config, api client
- `src/components/` — shared UI components

## Conventions
1. kebab-case filenames throughout
2. Named exports only — no default exports except Next.js page/layout components
3. All external input validated with Zod before use
4. Co-locate tests: `Button.test.tsx` next to `Button.tsx`

## Gotchas
1. Never import `PrismaClient` directly — use `lib/db.ts` singleton
2. All API routes require auth middleware — check `middleware.ts` before adding routes

## Boundaries

### Never
- Commit `.env` or `.env.local`
- Instantiate `PrismaClient` outside of `lib/db.ts`
- Use `any` type — use `unknown` and narrow

## MCP Servers
- **postgres** — PostgreSQL database access
- **github** — GitHub API integration
```

### CLAUDE.md additions

On top of the full AGENTS.md content, the generated `CLAUDE.md` includes:

- **MCP server documentation** — each detected server with its purpose
- **Skill recommendations** — suggests relevant Claude Code skills based on your stack (e.g. `test-driven-development` for Vitest projects, `debugging-and-error-recovery` for Express APIs)
- **Local skill references** — documents your project's own `.claude/commands/` and `.claude/skills/`

---

## Custom Sections

Add permanent, sync-safe customizations to any managed file:

```markdown
<!-- AGENTS-SYNC:CUSTOM:START -->
When working on the payments module, check with @alice before shipping.
Use staging Stripe keys (in .env.staging) for all local testing.
<!-- AGENTS-SYNC:CUSTOM:END -->
```

These blocks survive every `/agents-sync sync`. Edit them freely.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes (for init/sync only) | Your Anthropic API key |
| `AGENTS_SYNC_DEBUG=1` | No | Verbose debug output to stderr |
| `NO_COLOR=1` | No | Disable ANSI color in output |

`scan`, `drift`, `validate`, `status`, `export`, and `lint` never call the Claude API.

---

## MCP Tools Reference

| Tool | Description |
|---|---|
| `agents_sync_scan` | Show what scanner detected — no API key needed |
| `agents_sync_init` | Full init: scan, extract, generate, derive, snapshot |
| `agents_sync_sync` | Re-sync from current codebase state |
| `agents_sync_drift` | Check what changed since last sync (read-only) |
| `agents_sync_export` | Re-derive a single tool file |
| `agents_sync_validate` | Check if all tool files match AGENTS.md |
| `agents_sync_status` | Show sync status and managed files |
| `agents_sync_lint` | Verify codebase against Never rules in AGENTS.md |

---

## Supported Stacks

Tested on:

- **TypeScript/JavaScript**: Next.js, Express, Fastify, Remix, SvelteKit
- **Python**: Django, FastAPI, Flask
- **Rust**: Cargo workspaces, Axum, Actix
- **Go**: standard modules, Gin, Echo
- **PHP**: Composer projects, Laravel

Language-agnostic analysis — works on any codebase with a manifest file.

---

## How Is This Different From [agents-sync on npm]?

The existing `agents-sync` package (v0.2.0) is a file watcher that mirrors format changes between static files. It has no AI component.

This package **reads and understands your codebase using Claude**, then generates content from scratch — conventions, gotchas, architecture descriptions — specific to your project. It's not a format converter. It's an analyst.

---

## Contributing

Issues and PRs welcome. The codebase is straightforward TypeScript:

```bash
git clone https://github.com/googlarz/agents-sync
cd agents-sync
npm install
npm run dev      # watch mode
npm test         # unit tests
```

Integration tests require `ANTHROPIC_API_KEY` and run against real fixtures:

```bash
npm run test:integration
```

---

## License

MIT
