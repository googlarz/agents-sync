import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { runStatus } from "../../src/tools/status.js";
import { buildSnapshot, saveSnapshot } from "../../src/snapshot/writer.js";

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

describe("runStatus", () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    for (const d of tmpDirs) await fs.rm(d, { recursive: true, force: true });
    tmpDirs.length = 0;
  });

  async function makeDir(files: Record<string, string> = {}): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agents-sync-status-"));
    tmpDirs.push(dir);
    for (const [rel, content] of Object.entries(files)) {
      await fs.writeFile(path.join(dir, rel), content, "utf-8");
    }
    return dir;
  }

  it("returns hasSnapshot=false when not initialized", async () => {
    const dir = await makeDir();
    const result = await runStatus({ projectPath: dir });
    expect(result.hasSnapshot).toBe(false);
    expect(result.driftScore).toBe("unknown");
    expect(result.filesManaged).toHaveLength(0);
    expect(result.language).toBeNull();
  });

  it("includes recommendation to init when no AGENTS.md exists", async () => {
    const dir = await makeDir();
    const result = await runStatus({ projectPath: dir });
    expect(result.recommendation).toContain("init");
  });

  it("mentions AGENTS.md found when it exists without snapshot", async () => {
    const dir = await makeDir({ "AGENTS.md": "# AGENTS.md\n" });
    const result = await runStatus({ projectPath: dir });
    expect(result.recommendation).toMatch(/AGENTS\.md found/);
  });

  it("returns hasSnapshot=true with correct metadata after init", async () => {
    const dir = await makeDir({ "AGENTS.md": "# AGENTS.md\n", "CLAUDE.md": "# CLAUDE\n" });
    const snapshot = buildSnapshot({
      projectPath: dir,
      manifestContent: "{}",
      structureHash: sha256("src"),
      filesManaged: [
        { tool: "agents-md", path: path.join(dir, "AGENTS.md"), sha256: sha256("# AGENTS.md\n") },
        { tool: "claude", path: path.join(dir, "CLAUDE.md"), sha256: sha256("# CLAUDE\n") },
      ],
      language: "typescript",
      framework: "nextjs",
      topLevelDirs: ["src"],
      dependencyCount: 5,
      totalFiles: 20,
    });
    await saveSnapshot(snapshot);

    const result = await runStatus({ projectPath: dir });
    expect(result.hasSnapshot).toBe(true);
    expect(result.language).toBe("typescript");
    expect(result.framework).toBe("nextjs");
    expect(result.filesManaged).toHaveLength(2);
    expect(result.daysSinceSync).toBeGreaterThanOrEqual(0);
  });

  it("returns driftScore=ok for a recent snapshot", async () => {
    const dir = await makeDir();
    const snapshot = buildSnapshot({
      projectPath: dir,
      manifestContent: "{}",
      structureHash: sha256("src"),
      filesManaged: [],
      language: "python",
      framework: null,
      topLevelDirs: ["src"],
      dependencyCount: 0,
      totalFiles: 0,
    });
    await saveSnapshot(snapshot);

    const result = await runStatus({ projectPath: dir });
    expect(result.driftScore).toBe("ok");
  });

  it("filesManaged lists all managed tools", async () => {
    const dir = await makeDir();
    const snapshot = buildSnapshot({
      projectPath: dir,
      manifestContent: "{}",
      structureHash: sha256("src"),
      filesManaged: [
        { tool: "claude", path: path.join(dir, "CLAUDE.md"), sha256: sha256("x") },
        { tool: "cursor", path: path.join(dir, ".cursorrules"), sha256: sha256("x") },
        { tool: "roo", path: path.join(dir, ".roomodes"), sha256: sha256("x") },
      ],
      language: "go",
      framework: null,
      topLevelDirs: [],
      dependencyCount: 0,
      totalFiles: 0,
    });
    await saveSnapshot(snapshot);

    const result = await runStatus({ projectPath: dir });
    const tools = result.filesManaged.map((f) => f.tool);
    expect(tools).toContain("claude");
    expect(tools).toContain("cursor");
    expect(tools).toContain("roo");
  });
});
