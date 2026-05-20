# AGENTS.md

<!-- Derived for Gemini CLI by agents-sync v1.0.0 on 2026-05-20 -->

## Project Overview

Acme Dashboard is an internal analytics and reporting platform for the sales team. Built with
Next.js 14 App Router, PostgreSQL via Prisma ORM, and NextAuth v4 for authentication.

## Tech Stack

- TypeScript / Next.js 14 (App Router)
- PostgreSQL via Prisma ORM
- Auth: NextAuth v4
- UI: shadcn/ui + Tailwind CSS
- Testing: Vitest (co-located)
- Deployment: Vercel + Neon

## Architecture

- `src/app/` — App Router pages and layouts
- `src/features/` — Domain modules
- `src/lib/db.ts` — Prisma client singleton
- `src/components/` — Shared UI

## Conventions

1. kebab-case filenames throughout
2. Named exports only
3. Zod for all external input validation
4. Co-locate tests
5. Server components by default

## Gotchas

1. Never import PrismaClient directly — use src/lib/db.ts
2. All API routes protected by middleware.ts
3. Date comparisons must use UTC (date-fns/utc)

## Boundaries

### Never
- Commit .env or .env.local
- Instantiate PrismaClient outside src/lib/db.ts
- Use TypeScript any
- Push directly to main

### Always do
- Run npm test before committing
- Validate external responses with Zod

## Testing

`npm test`

---

## Gemini CLI Notes

This file is managed by [agents-sync](https://github.com/googlarz/agents-sync). Edit `AGENTS.md`
then run `agents-sync sync` to regenerate all tool context files.
