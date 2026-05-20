/**
 * Integration tests — require ANTHROPIC_API_KEY and make real API calls.
 * Run with: npm run test:integration
 */
import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { runInit } from "../../src/tools/init.js";
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
});
