# Acme Dashboard

Internal analytics dashboard built with Next.js 14, Prisma, and NextAuth.

## Development
- `npm run dev` — start dev server on :3000
- `npm test` — run vitest unit tests
- `npm run build` — production build

## Architecture
- `src/app/` — Next.js App Router pages and layouts
- `src/features/` — feature modules (dashboard, users, reports)
- `src/lib/` — shared utilities (db singleton, auth config, api client)
- `src/components/` — shared UI components

## Important
- Always use `lib/db.ts` singleton — never instantiate PrismaClient directly
- All API routes require auth middleware (`middleware.ts`)
- Run `npx prisma generate` after schema changes
