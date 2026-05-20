#!/usr/bin/env bash
# agents-sync demo script
#
# Shows the full agents-sync workflow using a temporary Next.js fixture.
# Records cleanly with: asciinema rec demo.cast --command ./scripts/demo.sh
#
# Prerequisites:
#   export ANTHROPIC_API_KEY=sk-ant-...
#   npm run build  (or: npx @googlarz/agents-sync)

set -euo pipefail

AGENTS_SYNC="${AGENTS_SYNC_BIN:-node dist/cli.js}"
DEMO_DIR="$(mktemp -d)"
trap 'rm -rf "$DEMO_DIR"' EXIT

# ─── helpers ─────────────────────────────────────────────────────────────────

say()  { printf '\n\033[1;36m%s\033[0m\n' "$*"; }
run()  { printf '\033[0;33m$ %s\033[0m\n' "$*"; sleep 0.4; eval "$*"; }
pause(){ sleep "${1:-1.2}"; }

# ─── scaffold a minimal Next.js project ──────────────────────────────────────

say "Setting up a minimal Next.js project..."

mkdir -p "$DEMO_DIR/src/app" "$DEMO_DIR/src/lib" "$DEMO_DIR/src/components"

cat > "$DEMO_DIR/package.json" <<'EOF'
{
  "name": "acme-dashboard",
  "version": "0.1.0",
  "description": "Internal analytics dashboard for the sales team",
  "scripts": { "dev": "next dev", "build": "next build", "test": "vitest" },
  "dependencies": {
    "next": "14.2.3",
    "react": "^18.3.1",
    "@prisma/client": "^5.15.0",
    "next-auth": "^4.24.7",
    "zod": "^3.23.8",
    "tailwindcss": "^3.4.4"
  },
  "devDependencies": {
    "typescript": "^5.4.5",
    "prisma": "^5.15.0",
    "vitest": "^1.6.0"
  }
}
EOF

cat > "$DEMO_DIR/src/lib/db.ts" <<'EOF'
// IMPORTANT: Never import PrismaClient directly — use this singleton.
// Direct imports exhaust the connection pool in Vercel's serverless runtime.
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
export const db = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
EOF

cat > "$DEMO_DIR/src/app/page.tsx" <<'EOF'
import { db } from "../lib/db";

export default async function DashboardPage() {
  const stats = await db.report.count();
  return <main><h1>Dashboard</h1><p>Total reports: {stats}</p></main>;
}
EOF

cat > "$DEMO_DIR/README.md" <<'EOF'
# Acme Dashboard

Internal analytics and reporting platform for the sales team.

Built with Next.js 14, Prisma, and NextAuth.
EOF

pause

# ─── 1. agents-sync init ─────────────────────────────────────────────────────

say "Step 1: Initialize agents-sync (scans codebase → Claude API → generates all files)"
run "$AGENTS_SYNC init $DEMO_DIR"

pause 2

# ─── 2. show generated files ─────────────────────────────────────────────────

say "Step 2: View the generated files"
run "ls -1 $DEMO_DIR/*.md $DEMO_DIR/.cursor* $DEMO_DIR/.github/copilot-instructions.md $DEMO_DIR/GEMINI.md $DEMO_DIR/.windsurfrules $DEMO_DIR/.clinerules 2>/dev/null || ls $DEMO_DIR"

pause 1.5

say "The canonical AGENTS.md:"
run "head -40 $DEMO_DIR/AGENTS.md"

pause 1.5

say "The derived .cursorrules (directive-style, <400 words):"
run "cat $DEMO_DIR/.cursorrules"

pause

# ─── 3. simulate a codebase change ───────────────────────────────────────────

say "Step 3: Simulate a dependency change (add drizzle-orm)"
run "node -e \"const p=require('$DEMO_DIR/package.json'); p.dependencies['drizzle-orm']='^0.31.0'; require('fs').writeFileSync('$DEMO_DIR/package.json', JSON.stringify(p, null, 2));\""

# also add a new directory
run "mkdir -p $DEMO_DIR/src/workers && touch $DEMO_DIR/src/workers/report-worker.ts"

pause

# ─── 4. drift check ──────────────────────────────────────────────────────────

say "Step 4: Check what drifted"
run "$AGENTS_SYNC drift $DEMO_DIR"

pause 1.5

# ─── 5. re-sync ──────────────────────────────────────────────────────────────

say "Step 5: Re-sync to update all files"
run "$AGENTS_SYNC sync $DEMO_DIR"

pause

# ─── 6. validate ─────────────────────────────────────────────────────────────

say "Step 6: Validate all files are in sync"
run "$AGENTS_SYNC validate $DEMO_DIR"

pause

# ─── done ────────────────────────────────────────────────────────────────────

say "Done! One AGENTS.md, six tool files, always in sync."
printf '\n\033[0;32m%s\033[0m\n\n' "npx @googlarz/agents-sync — try it on your project"
