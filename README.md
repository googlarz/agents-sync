# agents-sync

**Write your AI context once. Stay in sync everywhere.**

`agents-sync` reads your codebase, generates a canonical `AGENTS.md`, and automatically derives tool-specific files for every AI coding tool you use — Claude Code, Cursor, GitHub Copilot, and more.

One source of truth. No more manually maintaining five config files that are always out of sync.

---

## The Problem

Every AI coding tool expects its own context file:

| Tool | File |
|---|---|
| Claude Code | `CLAUDE.md` |
| Cursor | `.cursorrules` |
| GitHub Copilot | `.github/copilot-instructions.md` |
| Codex / Amp | `AGENTS.md` |
| Gemini CLI | `GEMINI.md` |
| Windsurf | `.windsurfrules` |
| Cline | `.clinerules` |

If you use more than one tool — and most teams do — you're maintaining these manually. They drift. Conventions you updated in `CLAUDE.md` are still wrong in `.cursorrules`. Your new database is still Postgres in Copilot's mind. A new engineer using Cursor gets guidance that contradicts what Claude Code users know.

This is [GitHub issue #6235](https://github.com/anthropics/claude-code/issues/6235) — **AGENTS.md portability**, **3,914 upvotes**, the most demanded feature in the Claude Code repo. `agents-sync` solves it.

---

## How It Works

```
Your codebase
     │
     ▼
[scan]  manifests · directory tree · source samples · README · FIXME/HACK comments
     │
     ▼
[extract]  Claude API → structured project metadata (stack, conventions, gotchas, boundaries)
     │
     ▼
[generate]  canonical AGENTS.md  ←─── one source of truth
     │
     ├──▶  CLAUDE.md          (superset + Claude Code-specific additions)
     ├──▶  .cursorrules       (directive-style, < 400 words)
     ├──▶  .github/copilot-instructions.md  (code-level focus, < 300 words)
     ├──▶  GEMINI.md          (full AGENTS.md + Gemini CLI section)
     ├──▶  .windsurfrules     (directive-style, < 400 words)
     └──▶  .clinerules        (Always/Never sections, < 400 words)
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

---

## Usage

### First run

```
/agents-sync init
```

```
✓ AGENTS.md → /your/project/AGENTS.md
✓ AGENTS.md → /your/project/AGENTS.md
✓ claude → /your/project/CLAUDE.md
✓ cursor → /your/project/.cursorrules
✓ copilot → /your/project/.github/copilot-instructions.md
✓ gemini → /your/project/GEMINI.md
✓ windsurf → /your/project/.windsurfrules
✓ cline → /your/project/.clinerules

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

### Standalone CLI

agents-sync also works as a standalone CLI without an MCP host:

```bash
# Initialize a project
npx @googlarz/agents-sync init .

# Check drift
npx @googlarz/agents-sync drift .

# Re-sync
npx @googlarz/agents-sync sync .

# Validate all files
npx @googlarz/agents-sync validate .

# Re-derive a single tool file (no Claude API call)
npx @googlarz/agents-sync export cursor .

# CI mode — exit 1 when drift is HIGH
npx @googlarz/agents-sync drift . --ci
```

---

## GitHub Action

Keep context files in sync automatically. Copy [`docs/github-action.yml`](docs/github-action.yml) to `.github/workflows/agents-sync.yml` in your repo, then add `ANTHROPIC_API_KEY` to repository secrets.

The workflow:
- Runs every Monday at 9am UTC
- Triggers on `package.json` / `pyproject.toml` / `Cargo.toml` / `go.mod` changes
- Checks drift; when drift is HIGH, re-syncs and opens a PR

---

## Sample Output

### Generated AGENTS.md (abbreviated)

```markdown
# AGENTS.md

<!-- Generated by agents-sync v1.0.0 on 2026-05-20 -->

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
1. Never import `PrismaClient` directly — use `lib/db.ts` singleton. Direct imports
   cause connection pool exhaustion in Vercel's serverless runtime.
2. All API routes require auth middleware. Check `middleware.ts` before adding routes.

## Boundaries

### Never
- Commit `.env` or `.env.local`
- Instantiate `PrismaClient` outside of `lib/db.ts`
- Use `any` type — use `unknown` and narrow
```

### Derived `.cursorrules` (abbreviated)

```
# .cursorrules — managed by agents-sync
# Language: TypeScript / Next.js 14

- Always: use kebab-case filenames
- Always: named exports only (no default exports except page/layout components)
- Always: validate external input with Zod
- Always: co-locate tests (*.test.ts next to source)
- Never: import PrismaClient directly (use lib/db.ts — pool exhaustion risk)
- Never: add API routes without auth middleware (check middleware.ts)
- Never: commit .env or .env.local
- Never: use `any` type
- Tests: `npm test`
```

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
| `ANTHROPIC_API_KEY` | Yes (for init/sync) | Your Anthropic API key |
| `AGENTS_SYNC_DEBUG=1` | No | Verbose debug output to stderr |
| `NO_COLOR=1` | No | Disable ANSI color in output |

---

## MCP Tools Reference

agents-sync exposes 6 MCP tools directly:

| Tool | Description |
|---|---|
| `agents_sync_init` | Full init: scan, extract, generate, derive, snapshot |
| `agents_sync_sync` | Re-sync from current codebase state |
| `agents_sync_drift` | Check what changed since last sync (read-only) |
| `agents_sync_export` | Re-derive a single tool file |
| `agents_sync_validate` | Check if all tool files match AGENTS.md |
| `agents_sync_status` | Show sync status and managed files |

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
