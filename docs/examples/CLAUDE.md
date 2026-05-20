# CLAUDE.md

<!-- Derived from AGENTS.md by agents-sync v1.0.0 on 2026-05-20 -->
<!-- Source: AGENTS.md — edit that file, then run /agents-sync sync -->

## Project Overview

Acme Dashboard is an internal analytics and reporting platform for the sales team. Built with
Next.js 14 App Router, PostgreSQL via Prisma ORM, and NextAuth v4 for authentication. Deployed
on Vercel with a Neon managed Postgres instance.

## Tech Stack

- **Language:** TypeScript
- **Framework:** Next.js 14 (App Router)
- **Database:** PostgreSQL via Prisma ORM
- **Auth:** NextAuth v4
- **UI:** shadcn/ui + Tailwind CSS
- **Testing:** Vitest (co-located)
- **Deployment:** Vercel + Neon

## Architecture

- `src/app/` — Next.js App Router pages and layouts (server components by default)
- `src/features/` — Feature modules, one directory per domain
- `src/lib/db.ts` — Prisma client singleton (do not instantiate PrismaClient elsewhere)
- `src/lib/auth.ts` — NextAuth configuration
- `src/components/` — Shared, reusable UI components

## Conventions

1. kebab-case filenames throughout (`user-profile.tsx`, not `UserProfile.tsx`)
2. Named exports only — no default exports except Next.js page/layout components
3. All external API responses validated with Zod before use
4. Co-locate tests: `Button.test.tsx` lives next to `Button.tsx`
5. Use `cn()` from `lib/utils.ts` for conditional className strings
6. Server components by default; add `'use client'` only when hooks or browser APIs are required
7. All database queries go through `src/lib/db.ts`

## Gotchas

1. **Never import `PrismaClient` directly** — connection pool exhaustion. Use `src/lib/db.ts`.
2. **All API routes require auth middleware** — `middleware.ts` matcher covers `/api/**`.
3. **Date comparisons must use UTC** — use `date-fns/utc` variants throughout.
4. **`src/app/` is server-first** — no hooks/browser APIs unless `'use client'` is declared.

## Boundaries

### Always do

- Run `npm test` before committing
- Validate external API responses with Zod
- Check `middleware.ts` before adding new `/api/` routes
- Use `src/lib/db.ts` for all Prisma queries

### Ask first

- Database schema changes
- Adding new npm dependencies
- Changes to authentication flow
- Modifying `middleware.ts`

### Never

- Commit `.env` or `.env.local`
- Instantiate `PrismaClient` outside of `src/lib/db.ts`
- Use TypeScript `any`
- Push directly to `main`
- Use `console.log` in production

## Commands

```bash
npm run dev          # local dev server
npm test             # run tests
npm run test:watch   # watch mode
npm run build        # production build
npm run lint         # lint
npx prisma studio    # database GUI
npx prisma migrate dev  # run migrations locally
```

## Claude Code notes

- When adding API routes, check `middleware.ts` first to understand auth coverage
- For UI work, use existing shadcn/ui components from `src/components/ui/`
- Feature work lives in `src/features/<name>/` — match the existing module structure
- The Prisma schema is in `prisma/schema.prisma`
