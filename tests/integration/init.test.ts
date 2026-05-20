/**
 * Integration tests — require ANTHROPIC_API_KEY and make real API calls.
 *
 * Run:
 *   ANTHROPIC_API_KEY=sk-ant-... npm run test:integration
 */
import { describe, it, expect } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { runInit } from "../../src/tools/init.js";
import { runSync } from "../../src/tools/sync.js";
import { loadSnapshot } from "../../src/snapshot/writer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, "../fixtures");

async function copyFixture(fixtureName: string): Promise<string> {
  const src = path.join(FIXTURES, fixtureName);
  const dest = await fs.mkdtemp(path.join(os.tmpdir(), `agents-sync-int-${fixtureName}-`));
  await fs.cp(src, dest, { recursive: true });
  return dest;
}

describe.skipIf(!process.env.INTEGRATION)("init integration", () => {
  it("initializes a Next.js project", async () => {
    const projectPath = await copyFixture("nextjs");

    const result = await runInit({ projectPath, dryRun: false });

    expect(result.success).toBe(true);
    expect(result.filesWritten.length).toBeGreaterThan(0);

    // AGENTS.md exists and has content
    const agentsMd = await fs.readFile(path.join(projectPath, "AGENTS.md"), "utf-8");
    expect(agentsMd).toContain("# AGENTS.md");
    expect(agentsMd.length).toBeGreaterThan(500);

    // References real directories
    expect(agentsMd.toLowerCase()).toMatch(/src|app|lib/);

    // CLAUDE.md derived
    const claudeMd = await fs.readFile(path.join(projectPath, "CLAUDE.md"), "utf-8");
    expect(claudeMd).toContain("Claude Code");

    // .cursorrules derived and short
    const cursorrules = await fs.readFile(path.join(projectPath, ".cursorrules"), "utf-8");
    const words = cursorrules.split(/\s+/).length;
    expect(words).toBeLessThan(500);

    // Snapshot saved
    const snapshot = await loadSnapshot(projectPath);
    expect(snapshot).not.toBeNull();
    expect(snapshot?.meta.language).toBe("typescript");

    await fs.rm(projectPath, { recursive: true });
  }, 60_000);

  it("initializes a Django project", async () => {
    const projectPath = await copyFixture("django");
    const result = await runInit({ projectPath });
    expect(result.success).toBe(true);
    const agentsMd = await fs.readFile(path.join(projectPath, "AGENTS.md"), "utf-8");
    expect(agentsMd.toLowerCase()).toMatch(/python|django/);
    await fs.rm(projectPath, { recursive: true });
  }, 60_000);

  it("dry run writes nothing", async () => {
    const projectPath = await copyFixture("nextjs");
    const result = await runInit({ projectPath, dryRun: true });
    expect(result.dryRun).toBe(true);
    const agentsMdExists = await fs.access(path.join(projectPath, "AGENTS.md")).then(() => true).catch(() => false);
    expect(agentsMdExists).toBe(false);
    await fs.rm(projectPath, { recursive: true });
  }, 60_000);

  it("generates all six tool files", async () => {
    const projectPath = await copyFixture("nextjs");
    const result = await runInit({ projectPath });
    const tools = result.filesWritten.map((f) => f.tool);
    expect(tools).toContain("claude");
    expect(tools).toContain("cursor");
    expect(tools).toContain("copilot");
    expect(tools).toContain("gemini");
    expect(tools).toContain("windsurf");
    expect(tools).toContain("cline");
    await fs.rm(projectPath, { recursive: true });
  }, 60_000);

  it("respects tools filter", async () => {
    const projectPath = await copyFixture("nextjs");
    const result = await runInit({ projectPath, tools: ["claude", "cursor"] });
    const tools = result.filesWritten.map((f) => f.tool);
    expect(tools).toContain("claude");
    expect(tools).toContain("cursor");
    expect(tools).not.toContain("copilot");
    expect(tools).not.toContain("gemini");
    await fs.rm(projectPath, { recursive: true });
  }, 60_000);

  it("merges agents-sync.config.json conventions into AGENTS.md", async () => {
    const projectPath = await copyFixture("nextjs");
    await fs.writeFile(
      path.join(projectPath, "agents-sync.config.json"),
      JSON.stringify({
        conventions: { inject: ["Always use pnpm, never npm or yarn"] },
        boundaries: { never: ["Merge PRs without at least one approval"] },
      }),
    );
    const result = await runInit({ projectPath });
    const agentsMd = await fs.readFile(result.agentsMdPath, "utf-8");
    expect(agentsMd).toContain("Always use pnpm");
    expect(agentsMd).toContain("Merge PRs without at least one approval");
    await fs.rm(projectPath, { recursive: true });
  }, 60_000);

  it("respects tools list from agents-sync.config.json", async () => {
    const projectPath = await copyFixture("nextjs");
    await fs.writeFile(
      path.join(projectPath, "agents-sync.config.json"),
      JSON.stringify({ tools: ["claude", "cursor"] }),
    );
    const result = await runInit({ projectPath });
    const tools = result.filesWritten.map((f) => f.tool);
    expect(tools).toContain("claude");
    expect(tools).toContain("cursor");
    expect(tools).not.toContain("copilot");
    await fs.rm(projectPath, { recursive: true });
  }, 60_000);

  it("uses repomix output as source corpus when --repomix-output is provided", async () => {
    const projectPath = await copyFixture("nextjs");

    // Write a minimal repomix plain-text output
    const repomixContent = [
      "================================================================",
      "File: src/lib/db.ts",
      "================================================================",
      "// IMPORTANT: Never import PrismaClient directly — pool exhaustion",
      "import { PrismaClient } from '@prisma/client';",
      "export const db = new PrismaClient();",
      "",
      "================================================================",
      "File: src/app/page.tsx",
      "================================================================",
      "export default function Page() { return <main>Hello</main>; }",
      "",
    ].join("\n");

    const repomixPath = path.join(projectPath, "repomix-output.txt");
    await fs.writeFile(repomixPath, repomixContent);

    const result = await runInit({ projectPath, repomixOutput: repomixPath });
    expect(result.success).toBe(true);
    const agentsMd = await fs.readFile(result.agentsMdPath, "utf-8");
    // Should have picked up the IMPORTANT comment as a gotcha
    expect(agentsMd.toLowerCase()).toMatch(/prisma|database/);
    await fs.rm(projectPath, { recursive: true });
  }, 60_000);
});

describe.skipIf(!process.env.INTEGRATION)("sync integration", () => {
  it("re-syncs after a dependency change", async () => {
    const projectPath = await copyFixture("nextjs");

    // Initial init
    await runInit({ projectPath });

    // Simulate adding a dependency
    const pkgPath = path.join(projectPath, "package.json");
    const pkg = JSON.parse(await fs.readFile(pkgPath, "utf-8")) as {
      dependencies: Record<string, string>;
    };
    pkg.dependencies["drizzle-orm"] = "^0.31.0";
    await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2));

    // Re-sync
    const syncResult = await runSync({ projectPath });
    expect(syncResult.success).toBe(true);
    expect(syncResult.filesUpdated.length).toBeGreaterThan(0);

    // AGENTS.md should mention drizzle
    const agentsMd = await fs.readFile(path.join(projectPath, "AGENTS.md"), "utf-8");
    expect(agentsMd.toLowerCase()).toMatch(/drizzle|database/);

    await fs.rm(projectPath, { recursive: true });
  }, 90_000);
});
