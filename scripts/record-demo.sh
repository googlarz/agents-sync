#!/usr/bin/env bash
# Regenerate docs/demo.gif
# Usage: ANTHROPIC_API_KEY=sk-ant-... ./scripts/record-demo.sh
#
# Requires: vhs (https://github.com/charmbracelet/vhs)
#   brew install vhs   OR   go install github.com/charmbracelet/vhs@latest

set -euo pipefail

cd "$(dirname "$0")/.."

if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo "Error: ANTHROPIC_API_KEY not set"
  exit 1
fi

if ! command -v vhs &>/dev/null; then
  echo "Error: vhs not found. Install with: brew install vhs"
  exit 1
fi

if ! command -v agents-sync &>/dev/null; then
  echo "Error: agents-sync not found globally. Install with: npm i -g @googlarz/agents-sync"
  exit 1
fi

# ─── scaffold a clean demo project ───────────────────────────────────────────

echo "→ Setting up demo project at /tmp/demo-fresh..."
rm -rf /tmp/demo-fresh
mkdir -p /tmp/demo-fresh/src/{app,lib,components} /tmp/demo-fresh/src/app/api/tasks

cat > /tmp/demo-fresh/package.json <<'EOF'
{
  "name": "acme-dashboard",
  "version": "0.1.0",
  "description": "Internal analytics dashboard for the sales team",
  "scripts": { "dev": "next dev", "build": "next build", "test": "vitest" },
  "dependencies": {
    "next": "14.2.3",
    "react": "^18.3.1",
    "drizzle-orm": "^0.30.0",
    "@auth/core": "^0.18.0",
    "zod": "^3.23.8",
    "tailwindcss": "^3.4.4"
  },
  "devDependencies": {
    "typescript": "^5.4.5",
    "@types/react": "^18.3.3",
    "drizzle-kit": "^0.21.0",
    "vitest": "^1.6.0"
  }
}
EOF

cat > /tmp/demo-fresh/src/lib/db.ts <<'EOF'
// IMPORTANT: Never import db directly — use this singleton.
// Direct imports exhaust the connection pool in serverless environments.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client);
EOF

cat > /tmp/demo-fresh/src/lib/schema.ts <<'EOF'
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const tasks = pgTable("tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  status: text("status").notNull().default("todo"),
  createdAt: timestamp("created_at").defaultNow(),
});
EOF

cat > /tmp/demo-fresh/src/app/page.tsx <<'EOF'
import { db } from "../lib/db";
import { tasks } from "../lib/schema";

export default async function DashboardPage() {
  const allTasks = await db.select().from(tasks);
  return (
    <main>
      <h1>Dashboard</h1>
      <p>{allTasks.length} tasks</p>
    </main>
  );
}
EOF

cat > /tmp/demo-fresh/src/app/api/tasks/route.ts <<'EOF'
import { db } from "../../../lib/db";
import { tasks } from "../../../lib/schema";
import { z } from "zod";

const createTaskSchema = z.object({ title: z.string().min(1) });

export async function POST(req: Request) {
  const body = createTaskSchema.parse(await req.json());
  const [task] = await db.insert(tasks).values(body).returning();
  return Response.json(task, { status: 201 });
}
EOF

cat > /tmp/demo-fresh/src/components/TaskList.tsx <<'EOF'
"use client";
export function TaskList({ tasks }: { tasks: { id: string; title: string }[] }) {
  return (
    <ul>
      {tasks.map((t) => <li key={t.id}>{t.title}</li>)}
    </ul>
  );
}
EOF

cat > /tmp/demo-fresh/README.md <<'EOF'
# Acme Dashboard

Internal analytics and task management platform for the sales team.
Built with Next.js 14 App Router, Drizzle ORM, and Auth.js.
EOF

# Pre-write the dep-addition script so the tape can call it cleanly
cat > /tmp/demo-fresh/add-dep.sh <<'EOF'
#!/usr/bin/env bash
node -e "
const fs = require('fs');
const p = JSON.parse(fs.readFileSync('package.json', 'utf8'));
p.dependencies['resend'] = '^3.0.0';
fs.writeFileSync('package.json', JSON.stringify(p, null, 2));
"
EOF
chmod +x /tmp/demo-fresh/add-dep.sh

echo "→ Demo project ready (no generated files — init will run from scratch)"

# ─── record ──────────────────────────────────────────────────────────────────

echo "→ Recording GIF..."
echo "   Flow: init (~10s with Haiku) → ls → cat .cursorrules → change → drift"
export ANTHROPIC_API_KEY
export AGENTS_SYNC_MODEL="claude-haiku-4-5-20251001"
vhs docs/demo.tape

echo "✓ Saved to docs/demo.gif"
