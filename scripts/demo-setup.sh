#!/usr/bin/env bash
# demo-setup.sh — creates two demo directories used by docs/demo.tape
#
# /tmp/demo-existing/  — simulates a project that already has AGENTS.md
# /tmp/demo-fresh/     — a plain Next.js project with no AI context files yet
#
# Run this once before recording: bash scripts/demo-setup.sh

set -euo pipefail

# ─── /tmp/demo-existing — project with an existing AGENTS.md ──────────────────

rm -rf /tmp/demo-existing
mkdir -p /tmp/demo-existing/src/app /tmp/demo-existing/src/lib

cat > /tmp/demo-existing/package.json << 'EOF'
{
  "name": "acme-api",
  "scripts": { "dev": "ts-node src/index.ts", "test": "vitest", "build": "tsc" },
  "dependencies": { "express": "^4.18.0", "zod": "^3.23.0" },
  "devDependencies": { "typescript": "^5.4.0", "vitest": "^1.6.0" }
}
EOF

cat > /tmp/demo-existing/AGENTS.md << 'EOF'
# AGENTS.md

## Architecture
src/app/ — route handlers. src/lib/ — shared utilities. tests/ — unit tests.
All DB access goes through src/lib/db.ts — never import the client directly.

## Commands
```
Build: npm run build
Test:  npm test
Dev:   npm run dev
```

## Guidelines
- Never use `any` type in TypeScript — use `unknown` and narrow it
- Always validate external input with Zod before trusting it
- Never commit .env files or API keys
EOF

# ─── /tmp/demo-fresh — Next.js project with AGENTS.md but no tool files yet ───
# (shows the common case: you have AGENTS.md, need to generate the tool files)

rm -rf /tmp/demo-fresh
mkdir -p /tmp/demo-fresh/src/app /tmp/demo-fresh/src/lib /tmp/demo-fresh/src/components

cat > /tmp/demo-fresh/package.json << 'EOF'
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

cat > /tmp/demo-fresh/src/lib/db.ts << 'EOF'
// IMPORTANT: Never import PrismaClient directly — use this singleton.
// Direct imports exhaust the connection pool in Vercel's serverless runtime.
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
export const db = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
EOF

cat > /tmp/demo-fresh/src/app/page.tsx << 'EOF'
import { db } from "../lib/db";

export default async function DashboardPage() {
  const stats = await db.report.count();
  return <main><h1>Dashboard</h1><p>Total reports: {stats}</p></main>;
}
EOF

cat > /tmp/demo-fresh/README.md << 'EOF'
# Acme Dashboard

Internal analytics and reporting platform for the sales team.
Built with Next.js 14, Prisma, and NextAuth.
EOF

# Pre-written AGENTS.md — derive uses this to generate all tool files
cat > /tmp/demo-fresh/AGENTS.md << 'EOF'
# AGENTS.md

## Architecture
src/app/ — Next.js App Router pages and layouts.
src/lib/ — shared utilities; db.ts exports the Prisma singleton (never import PrismaClient directly).
src/components/ — reusable React components.
All auth flows use NextAuth — never roll custom session logic.

## Commands
```
Dev:   npm run dev
Build: npm run build
Test:  npm test
Lint:  npx tsc --noEmit
```

## Guidelines
- Never import PrismaClient directly — always use the singleton from src/lib/db.ts
- Always validate external input with Zod before using it
- Never commit .env files or secrets — use .env.local for local overrides
- React Server Components are the default; add "use client" only when needed
- All database queries go through src/lib/db.ts — no raw SQL outside that file
EOF

# ─── helper: add-dep.sh — simulates a dependency change ──────────────────────

cat > /tmp/demo-fresh/add-dep.sh << 'EOF'
#!/usr/bin/env bash
# Simulate adding drizzle-orm and a new workers directory
node -e "
  const p = require('./package.json');
  p.dependencies['drizzle-orm'] = '^0.31.0';
  require('fs').writeFileSync('./package.json', JSON.stringify(p, null, 2));
"
mkdir -p src/workers && touch src/workers/report-worker.ts
EOF
chmod +x /tmp/demo-fresh/add-dep.sh

# ─── pre-derive + snapshot ────────────────────────────────────────────────────
# Run derive once so tool files exist, then write a snapshot that represents the
# clean state (before add-dep.sh). This lets `drift .` work during the demo.

cd /tmp/demo-fresh
agents-sync derive . 2>/dev/null

# Write snapshot using Node — matches agents-sync's sha256 and dep-format logic
node -e "
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function sha256(s) {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

// Match scanner/manifest.ts depsToStrings: 'name@version', max 25 deps / 15 devDeps
const deps = Object.entries(pkg.dependencies || {}).slice(0, 25).map(([n,v]) => n+'@'+v);
const dev  = Object.entries(pkg.devDependencies || {}).slice(0, 15).map(([n,v]) => n+'@'+v);
const manifestHash = sha256(deps.join('\n') + dev.join('\n'));

// Tool-file path → tool enum
const TOOL_MAP = {
  'AGENTS.md':                          'agents-md',
  'CLAUDE.md':                          'claude',
  '.cursorrules':                       'cursor',
  'GEMINI.md':                          'gemini',
  '.github/copilot-instructions.md':    'copilot',
  '.windsurfrules':                     'windsurf',
  '.clinerules':                        'cline',
  '.roomodes':                          'roo',
  'CONVENTIONS.md':                     'aider',
  '.kiro/steering/agents-sync.md':      'kiro',
  '.trae/rules/agents-sync.md':         'trae',
};

const filesManaged = Object.entries(TOOL_MAP)
  .filter(([f]) => { try { fs.statSync(f); return true; } catch { return false; } })
  .map(([f, tool]) => ({ path: f, sha256: sha256(fs.readFileSync(f, 'utf8')), tool }));

fs.mkdirSync('.agents-sync', { recursive: true });
fs.writeFileSync('.agents-sync/snapshot.json', JSON.stringify({
  version: '1.0',
  syncedAt: new Date().toISOString(),
  projectPath: process.cwd(),
  codebaseHash: sha256(manifestHash + 'src'),
  manifestHash,
  filesManaged,
  meta: {
    dependencyCount: deps.length,
    topLevelDirs: ['src'],
    language: 'typescript',
    framework: 'next.js',
    totalFiles: 5,
  },
}, null, 2));
console.log('snapshot written');
"

cd - > /dev/null

echo "done /tmp/demo-existing — project with AGENTS.md"
echo "done /tmp/demo-fresh    — Next.js project with tool files + snapshot"
echo ""
echo "Ready. Record with: vhs docs/demo.tape"
