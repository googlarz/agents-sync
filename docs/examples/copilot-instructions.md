<!-- Managed by agents-sync v1.0.0. Source: AGENTS.md -->
# GitHub Copilot Instructions — Acme Dashboard

**Stack:** TypeScript · Next.js 14 App Router · Prisma + Neon PostgreSQL · NextAuth v4 · shadcn/ui

## Code rules

- kebab-case filenames; named exports only (default exports for Next.js pages/layouts only)
- Validate external data with Zod before use
- Tests co-located: `Foo.test.tsx` next to `Foo.tsx`
- Server components by default; `'use client'` only for hooks/browser APIs

## Critical constraints

- Database: always use `src/lib/db.ts` singleton — never `new PrismaClient()`
- Auth: all `/api/` routes are protected by `middleware.ts`; check before adding routes
- Dates: use `date-fns/utc` variants — dashboard is multi-timezone
- No `console.log` in production; no TypeScript `any`; no `.env` commits

## Tests

```
npm test
```
