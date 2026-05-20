import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { runExport } from "../../src/tools/export.js";
import { buildSnapshot, saveSnapshot, loadSnapshot } from "../../src/snapshot/writer.js";

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

describe("runExport", () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    for (const d of tmpDirs) await fs.rm(d, { recursive: true, force: true });
    tmpDirs.length = 0;
  });

  async function makeProject(agentsMdContent: string, existingFiles: Record<string, string> = {}): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agents-sync-export-"));
    tmpDirs.push(dir);
    await fs.writeFile(path.join(dir, "AGENTS.md"), agentsMdContent, "utf-8");
    for (const [rel, content] of Object.entries(existingFiles)) {
      const abs = path.join(dir, rel);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, content, "utf-8");
    }
    const snapshot = buildSnapshot({
      projectPath: dir,
      manifestContent: "{}",
      structureHash: sha256("src"),
      filesManaged: [
        { tool: "agents-md", path: path.join(dir, "AGENTS.md"), sha256: sha256(agentsMdContent) },
      ],
      language: "typescript",
      framework: null,
      topLevelDirs: ["src"],
      dependencyCount: 0,
      totalFiles: 1,
    });
    await saveSnapshot(snapshot);
    return dir;
  }

  it("throws when no snapshot exists", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agents-sync-export-nosnapshot-"));
    tmpDirs.push(dir);
    await fs.writeFile(path.join(dir, "AGENTS.md"), "# AGENTS.md\n", "utf-8");
    await expect(runExport({ projectPath: dir, tool: "claude" })).rejects.toThrow();
  });

  it("throws when AGENTS.md is missing", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agents-sync-export-noagents-"));
    tmpDirs.push(dir);
    const snapshot = buildSnapshot({
      projectPath: dir,
      manifestContent: "{}",
      structureHash: sha256("src"),
      filesManaged: [],
      language: "typescript",
      framework: null,
      topLevelDirs: ["src"],
      dependencyCount: 0,
      totalFiles: 0,
    });
    await saveSnapshot(snapshot);
    await expect(runExport({ projectPath: dir, tool: "claude" })).rejects.toThrow();
  });

  it("writes the tool file and returns the path", async () => {
    const agentsMd = [
      "# AGENTS.md",
      "<!-- agents-sync: managed -->",
      "## Project",
      "TypeScript project.",
      "## Never",
      "- Never use `any`",
    ].join("\n");
    const dir = await makeProject(agentsMd);

    const result = await runExport({ projectPath: dir, tool: "claude" });

    expect(result.written).toBe(true);
    expect(result.path).toBeTruthy();
    const exists = await fs.access(result.path).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });

  it("updates snapshot hash after writing so validate sees in-sync", async () => {
    const agentsMd = [
      "# AGENTS.md",
      "<!-- agents-sync: managed -->",
      "## Project",
      "TypeScript project.",
      "## Never",
      "- Never use `any`",
    ].join("\n");
    const dir = await makeProject(agentsMd);

    const result = await runExport({ projectPath: dir, tool: "claude" });
    expect(result.written).toBe(true);

    // Snapshot should now contain the claude file with a real hash
    const snapshot = await loadSnapshot(dir);
    const claudeEntry = snapshot?.filesManaged.find((f) => f.tool === "claude");
    expect(claudeEntry).toBeDefined();
    expect(claudeEntry!.sha256).toBeTruthy();
    // The stored hash should match what's on disk
    const onDisk = await fs.readFile(result.path, "utf-8");
    expect(claudeEntry!.sha256).toBe(sha256(onDisk));
  });
});
