import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { buildSnapshot, saveSnapshot, loadSnapshot, sha256 } from "../../src/snapshot/writer.js";

describe("snapshot writer", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "agents-sync-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true });
  });

  it("sha256 is deterministic", () => {
    expect(sha256("hello")).toBe(sha256("hello"));
    expect(sha256("hello")).not.toBe(sha256("world"));
  });

  it("round-trips a snapshot", async () => {
    const snapshot = buildSnapshot({
      projectPath: tmpDir,
      manifestContent: "package.json content",
      structureHash: "abc123",
      filesManaged: [{ tool: "claude", path: "/tmp/CLAUDE.md", sha256: "def456" }],
      language: "typescript",
      framework: "nextjs",
      topLevelDirs: ["src", "tests"],
      dependencyCount: 42,
      totalFiles: 150,
    });

    await saveSnapshot(snapshot);
    const loaded = await loadSnapshot(tmpDir);

    expect(loaded).not.toBeNull();
    expect(loaded?.meta.language).toBe("typescript");
    expect(loaded?.meta.framework).toBe("nextjs");
    expect(loaded?.meta.dependencyCount).toBe(42);
    expect(loaded?.filesManaged).toHaveLength(1);
    expect(loaded?.version).toBe("1.0");
  });

  it("loadSnapshot returns null when no snapshot", async () => {
    const result = await loadSnapshot(tmpDir);
    expect(result).toBeNull();
  });

  it("loadSnapshot returns null for corrupt JSON", async () => {
    const snapshotDir = path.join(tmpDir, ".agents-sync");
    await fs.mkdir(snapshotDir, { recursive: true });
    await fs.writeFile(path.join(snapshotDir, "snapshot.json"), "{ invalid json }", "utf-8");
    const result = await loadSnapshot(tmpDir);
    expect(result).toBeNull();
  });
});
