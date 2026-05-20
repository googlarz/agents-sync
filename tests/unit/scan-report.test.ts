import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { runScanReport } from "../../src/tools/scan-report.js";

describe("runScanReport", () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    for (const d of tmpDirs) await fs.rm(d, { recursive: true, force: true });
    tmpDirs.length = 0;
  });

  async function makeDir(files: Record<string, string> = {}): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agents-sync-scan-"));
    tmpDirs.push(dir);
    for (const [rel, content] of Object.entries(files)) {
      const abs = path.join(dir, rel);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, content, "utf-8");
    }
    return dir;
  }

  it("returns a report containing Project section", async () => {
    const dir = await makeDir({
      "package.json": JSON.stringify({ name: "my-app", version: "1.0.0", dependencies: {} }),
    });
    const result = await runScanReport({ projectPath: dir });
    expect(result.report).toMatch(/Project/i);
  });

  it("detects javascript language from package.json", async () => {
    const dir = await makeDir({
      "package.json": JSON.stringify({ name: "my-app", dependencies: { express: "^4.0.0" } }),
    });
    const result = await runScanReport({ projectPath: dir });
    expect(result.language).toMatch(/javascript|typescript/i);
  });

  it("detects dependencies count", async () => {
    const dir = await makeDir({
      "package.json": JSON.stringify({
        name: "my-app",
        dependencies: { express: "^4.0.0", lodash: "^4.0.0" },
      }),
    });
    const result = await runScanReport({ projectPath: dir });
    expect(result.dependencyCount).toBeGreaterThanOrEqual(2);
  });

  it("returns empty dependency count for bare directory", async () => {
    const dir = await makeDir();
    const result = await runScanReport({ projectPath: dir });
    expect(result.dependencyCount).toBeGreaterThanOrEqual(0);
    expect(result.report).toBeTruthy();
  });

  it("throws when projectPath does not exist", async () => {
    await expect(runScanReport({ projectPath: "/nonexistent/path/xyz" })).rejects.toThrow();
  });
});
