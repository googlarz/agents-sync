import { describe, it, expect } from "vitest";
import { validateAgentsMd } from "../../src/generator/validator.js";

const GOOD_AGENTS_MD = `# AGENTS.md

## Project Overview
Acme Dashboard is an internal analytics tool built with Next.js 14, Prisma ORM, and NextAuth.
It serves as the primary interface for internal analytics and reporting across all business units.
The project is owned by the platform team and deployed to Vercel on every merge to main.

## Tech Stack
- TypeScript / Next.js 14 (App Router)
- PostgreSQL via Prisma ORM — schema lives in \`prisma/schema.prisma\`
- NextAuth v4 for authentication — config in \`src/lib/auth.ts\`
- Zustand for client-side state management
- TanStack Query for server state and caching
- Vitest for unit and integration tests
- Tailwind CSS for styling

## Architecture
- \`src/app/\` — Next.js App Router pages and layouts
- \`src/features/\` — feature modules (dashboard, users, reports)
- \`src/lib/\` — shared utilities (db singleton, auth config, api client)
- \`src/components/\` — shared UI components
- \`src/hooks/\` — shared React hooks
- \`prisma/\` — database schema and migrations

## Conventions
1. Use kebab-case for all filenames
2. Named exports only — no default exports except page components
3. All external input must be validated with Zod schemas before use
4. Co-locate tests with source (\`*.test.ts\` next to source file)
5. Feature modules own their own types, hooks, and components
6. Server components by default; add \`"use client"\` only when needed

## Gotchas
1. Never import PrismaClient directly — use \`lib/db.ts\` singleton (causes pool exhaustion in serverless)
2. All API routes require auth middleware — check \`middleware.ts\` before adding new routes
3. next-auth v4 has a specific config shape — do not destructure the NextAuth() return value
4. TanStack Query keys must be arrays — plain strings cause cache misses
5. Prisma \`auto_now\` fields are read-only — do not include them in create/update payloads

## Testing
- Framework: Vitest
- Command: \`npm test\`
- Location: co-located (\`*.test.ts\` next to source file)
- Integration tests under \`tests/integration/\`
- Run \`npx prisma generate\` before tests if schema changed

## Boundaries

### Always
- Run \`npm test\` before committing
- Run \`npx prisma generate\` after schema changes
- Use the \`lib/db.ts\` singleton for all database access

### Ask First
- Database schema changes (coordinate with platform team)
- Adding new dependencies (discuss bundle size impact)
- New environment variables (must be added to Vercel config)

### Never
- Commit .env files or secrets
- Instantiate PrismaClient directly outside \`lib/db.ts\`
- Bypass auth middleware on API routes`;

describe("validateAgentsMd", () => {
  it("passes on a good AGENTS.md", () => {
    const result = validateAgentsMd(GOOD_AGENTS_MD, ["src", "tests"]);
    expect(result.passed).toBe(true);
    expect(result.failures).toHaveLength(0);
  });

  it("fails on missing header", () => {
    const result = validateAgentsMd("# Wrong Header\n\nsome content");
    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.includes("AGENTS.md"))).toBe(true);
  });

  it("fails on too-short content", () => {
    const result = validateAgentsMd("# AGENTS.md\n\nToo short.");
    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.includes("short"))).toBe(true);
  });

  it("fails on missing Never section", () => {
    const withoutNever = GOOD_AGENTS_MD.replace(/### Never[\s\S]*$/, "");
    const result = validateAgentsMd(withoutNever);
    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.includes("Never"))).toBe(true);
  });

  it("warns on generic phrases", () => {
    const withGeneric = GOOD_AGENTS_MD.replace(
      "Use kebab-case for all filenames",
      "follow best practices for naming",
    );
    const result = validateAgentsMd(withGeneric);
    expect(result.warnings.some((w) => w.includes("best practices"))).toBe(true);
  });
});
