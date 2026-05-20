/**
 * Creates a temporary project fixture for integration tests.
 *
 * Usage:
 *   const dir = await createFixture("nextjs-minimal");
 *   // ... run agents-sync against dir ...
 *   await cleanupFixture(dir);
 */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export interface Fixture {
  dir: string;
  cleanup: () => Promise<void>;
}

export type FixturePreset = "nextjs-minimal" | "django-minimal" | "rust-minimal" | "empty";

export async function createFixture(preset: FixturePreset): Promise<Fixture> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `agents-sync-int-${preset}-`));

  await applyPreset(dir, preset);

  return {
    dir,
    cleanup: () => fs.rm(dir, { recursive: true, force: true }),
  };
}

async function applyPreset(dir: string, preset: FixturePreset): Promise<void> {
  switch (preset) {
    case "nextjs-minimal":
      await applyNextjsMinimal(dir);
      break;
    case "django-minimal":
      await applyDjangoMinimal(dir);
      break;
    case "rust-minimal":
      await applyRustMinimal(dir);
      break;
    case "empty":
      // No files — tests the fallback behavior
      break;
  }
}

// ─── Presets ─────────────────────────────────────────────────────────────────

async function applyNextjsMinimal(dir: string): Promise<void> {
  await fs.mkdir(path.join(dir, "src", "app"), { recursive: true });
  await fs.mkdir(path.join(dir, "src", "lib"), { recursive: true });

  await fs.writeFile(
    path.join(dir, "package.json"),
    JSON.stringify(
      {
        name: "acme-dashboard",
        version: "0.1.0",
        description: "Internal analytics dashboard",
        scripts: { test: "vitest", build: "next build" },
        dependencies: {
          next: "14.2.3",
          react: "^18.3.1",
          "@prisma/client": "^5.15.0",
          "next-auth": "^4.24.7",
          zod: "^3.23.8",
        },
        devDependencies: {
          typescript: "^5.4.5",
          vitest: "^1.6.0",
        },
      },
      null,
      2,
    ),
  );

  await fs.writeFile(
    path.join(dir, "src", "lib", "db.ts"),
    `// IMPORTANT: Never import PrismaClient directly — causes connection pool exhaustion
import { PrismaClient } from "@prisma/client";
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
export const db = globalForPrisma.prisma ?? new PrismaClient();
`,
  );

  await fs.writeFile(
    path.join(dir, "README.md"),
    `# Acme Dashboard\n\nInternal analytics platform for the sales team.\n`,
  );
}

async function applyDjangoMinimal(dir: string): Promise<void> {
  await fs.mkdir(path.join(dir, "acme"), { recursive: true });

  await fs.writeFile(
    path.join(dir, "pyproject.toml"),
    `[project]
name = "acme-api"
version = "0.1.0"
description = "Internal API for the sales team"
dependencies = ["django>=5.0", "djangorestframework>=3.15", "psycopg2-binary>=2.9"]

[project.optional-dependencies]
dev = ["pytest-django>=4.8", "pytest>=8.0"]
`,
  );

  await fs.writeFile(
    path.join(dir, "acme", "views.py"),
    `# TODO: FIXME: rate limiting not implemented — will be DoS'd in production
from django.views import View

class ReportView(View):
    def get(self, request):
        return JsonResponse({"status": "ok"})
`,
  );
}

async function applyRustMinimal(dir: string): Promise<void> {
  await fs.mkdir(path.join(dir, "src"), { recursive: true });

  await fs.writeFile(
    path.join(dir, "Cargo.toml"),
    `[package]
name = "acme-worker"
version = "0.1.0"
edition = "2021"

[dependencies]
tokio = { version = "1", features = ["full"] }
axum = "0.7"
serde = { version = "1", features = ["derive"] }
`,
  );

  await fs.writeFile(
    path.join(dir, "src", "main.rs"),
    `use axum::{routing::get, Router};

#[tokio::main]
async fn main() {
    let app = Router::new().route("/health", get(|| async { "ok" }));
    axum::serve(tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap(), app)
        .await
        .unwrap();
}
`,
  );
}
