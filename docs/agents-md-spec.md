# AGENTS.md Specification

> Version 1.0  ·  Published by [agents-sync](https://github.com/googlarz/agents-sync)

AGENTS.md is a plain-text file at the root of a software project that describes the project's conventions, boundaries, and context for AI coding assistants. This document is the canonical format specification.

---

## Overview

AGENTS.md serves as the **single source of truth** for AI context in a project. Tool-specific files (CLAUDE.md, .cursorrules, copilot-instructions.md, GEMINI.md, .windsurfrules, .clinerules) are derived from it by agents-sync. Authors edit AGENTS.md; agents-sync keeps the derived files in sync.

```
AGENTS.md  ──►  CLAUDE.md           (Claude Code)
           ──►  .cursorrules         (Cursor)
           ──►  copilot-instructions.md  (GitHub Copilot)
           ──►  GEMINI.md            (Gemini CLI)
           ──►  .windsurfrules       (Windsurf)
           ──►  .clinerules          (Cline)
```

---

## File Location

Always at the **project root**: `<project-root>/AGENTS.md`

---

## Canonical Structure

```markdown
# AGENTS.md

## Project
<!-- Brief project description. One paragraph. -->

## Stack
<!-- Technology choices: language, framework, database, test runner, deploy target. -->

## Architecture
<!-- Key directories and what lives in them. Entry points. -->

## Conventions
<!-- Specific rules the AI must follow when writing code. -->

## Boundaries
### Always
<!-- Things the AI should always do. -->
### Ask first
<!-- Things the AI should confirm before doing. -->
### Never
<!-- Hard prohibitions. These are machine-checkable by agents-sync lint. -->

## Testing
<!-- How to run tests. Where tests live. Coverage expectations. -->

## Deployment
<!-- How to deploy. Environment variables. CI/CD details. -->

## Gotchas
<!-- Known pitfalls, surprising behavior, non-obvious constraints. -->
```

---

## Section Reference

### `## Project`

A short description of what the project does and who it's for. Include the project name.

```markdown
## Project
Acme Billing — a SaaS invoice management platform built for small businesses.
Backend: Node.js / Express. Frontend: React + TypeScript.
```

### `## Stack`

List the concrete technology choices. Be specific — include package names and versions where relevant.

```markdown
## Stack
- **Language**: TypeScript 5.4
- **Framework**: Next.js 14 (App Router)
- **Database**: PostgreSQL 16 via Prisma ORM
- **Auth**: NextAuth.js v5
- **Testing**: Vitest + React Testing Library
- **Deploy**: Vercel (preview + production)
```

### `## Architecture`

Describe how the codebase is organized. Focus on what the AI needs to know to place files correctly.

```markdown
## Architecture
- `app/` — Next.js App Router pages and layouts
- `app/api/` — API route handlers
- `src/lib/` — shared utilities (no framework dependencies)
- `src/components/` — reusable React components
- `src/db/` — Prisma client and query helpers
- `tests/` — unit and integration tests mirroring `src/`
```

### `## Conventions`

Specific, observable rules for the AI to follow. Every convention must be **falsifiable** — it should be possible to look at a piece of code and determine whether the convention is followed.

**Good conventions:**
```markdown
- Use named exports only; no default exports except in `app/` pages
- File names: kebab-case (e.g., `user-profile.ts`, not `UserProfile.ts`)
- API routes return `{ data, error }` envelopes — never naked objects
- All DB queries go through `src/db/` helpers, never direct Prisma client calls
```

**Bad conventions (too vague):**
```markdown
- Follow best practices
- Write clean code
- Keep things simple
```

### `## Boundaries`

Three tiers of constraint:

| Tier | Meaning | AI behavior |
|------|---------|-------------|
| **Always** | Must do by default | Do this in every relevant context |
| **Ask first** | Requires human approval | Propose and wait for a ✓ before acting |
| **Never** | Hard prohibitions | Refuse; explain the rule if asked |

```markdown
### Always
- Run `npm test` before considering a task complete
- Add a test for every new function in `src/lib/`
- Import from `@/lib/db` — never use PrismaClient directly

### Ask first
- Adding or removing npm dependencies
- Changing the database schema
- Modifying CI/CD pipeline files

### Never
- Commit `.env` files or any file containing secrets
- Use `console.log` in production code (use the `logger` utility instead)
- Use TypeScript `any` type (use `unknown` or proper types)
- Call `process.env` directly (use `src/lib/config.ts` instead)
```

> **Note:** Rules in `### Never` are checked by `agents-sync lint`. Write them as specific, machine-checkable statements.

### `## Testing`

```markdown
## Testing
- **Framework**: Vitest
- **Run all**: `npm test`
- **Run unit**: `npm run test:unit`
- **Coverage**: `npm run test:coverage` (target: 80%)
- **Location**: `tests/` mirrors `src/` structure; test files named `*.test.ts`
- **Policy**: every new public function must have at least one test
```

### `## Deployment`

```markdown
## Deployment
- **Target**: Vercel (auto-deploy from `main`)
- **Preview**: every PR gets a preview URL
- **Env vars**: see `.env.example` — required: `DATABASE_URL`, `NEXTAUTH_SECRET`
- **Migrations**: `npx prisma migrate deploy` (runs automatically in CI)
```

### `## Gotchas`

Surprising behavior, footguns, or non-obvious constraints that would catch a new contributor (or AI) off guard.

```markdown
## Gotchas
- `lib/auth.ts` wraps NextAuth — do not import `next-auth` directly elsewhere
- Prisma queries in API routes must be wrapped in try/catch; errors are not automatically forwarded
- `app/` directory uses React Server Components by default — add `"use client"` explicitly for interactive components
- The `tests/` directory uses a separate `tsconfig.test.json` — do not add test utilities to the main `tsconfig.json`
```

---

## Custom Sections

agents-sync preserves any content inside these markers across re-syncs:

```markdown
<!-- AGENTS-SYNC:CUSTOM:START -->
...your hand-written content here...
<!-- AGENTS-SYNC:CUSTOM:END -->
```

Use custom sections for project-specific context that agents-sync cannot detect automatically (e.g., business logic rules, team preferences, domain-specific terminology).

---

## Machine-Checkable Rules

`agents-sync lint` parses the `### Never` section and checks for violations using pattern matching. To maximize automated coverage, write Never rules in one of these forms:

| Pattern | Example |
|---------|---------|
| `console.log` | "Never use `console.log`" |
| TypeScript `any` | "Never use TypeScript `any` type" |
| Default exports | "Never use default exports" |
| Direct import | "Never import `PrismaClient` directly" |
| `.env` in git | "Never commit `.env` files" |
| `process.env` access | "Never access `process.env` directly" |

Rules that don't match a known pattern are marked `skipped: No automated check available` in the lint report — they are still enforced by convention but not automatically verified.

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-05-20 | Initial specification |

---

## Contributing

To propose changes to this specification, open an issue at [googlarz/agents-sync](https://github.com/googlarz/agents-sync/issues) with the label `spec`.
