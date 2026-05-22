import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { detectDrift, detectSemanticDrift, formatDriftReport } from "../../src/snapshot/drift.js";
import { buildSnapshot, saveSnapshot, sha256 } from "../../src/snapshot/writer.js";
import { runDrift } from "../../src/tools/drift.js";
import type { RawCorpus } from "../../src/scanner/index.js";

function makeCorpus(overrides: Partial<RawCorpus> = {}): RawCorpus {
  return {
    manifest: {
      language: "typescript",
      framework: "nextjs",
      runtime: "node 20",
      packageManager: "npm",
      dependencies: ["next@14", "react@18", "zod@3"],
      devDependencies: ["typescript@5"],
      scripts: { dev: "next dev" },
      projectName: "acme",
      projectVersion: "1.0.0",
    },
    structure: {
      topLevelDirs: ["src", "tests", "public"],
      entryPoints: ["src/index.ts"],
      testDirs: ["tests"],
      totalFileCount: 50,
      namingConvention: "kebab-case",
      tree: "src/\n  app/\n  lib/",
    },
    source: { files: [], totalTokens: 0, importStyle: "esm", detectedPatterns: [] },
    docs: { readme: null, contributing: null, architecture: null, existingAgentsMd: null, existingClaudeMd: null, existingCursorRules: null, hasExistingClaudeMd: false, hasExistingAgentsMd: false, totalTokens: 0 },
    gotchas: [],
    codegraph: { available: false, communities: [], hubNodes: [], entryPoints: [] },
    mcp: { servers: [], hasAny: false },
    totalEstimatedTokens: 1000,
    scanDurationMs: 100,
    ...overrides,
  };
}

describe("runDrift — missing AGENTS.md", () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    for (const d of tmpDirs) await fs.rm(d, { recursive: true, force: true });
    tmpDirs.length = 0;
  });

  async function makeProject(files: Record<string, string> = {}): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agents-sync-drift-"));
    tmpDirs.push(dir);
    for (const [rel, content] of Object.entries(files)) {
      const abs = path.join(dir, rel);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, content, "utf-8");
    }
    return dir;
  }

  it("flags HIGH drift and highDrift=true when AGENTS.md is deleted", async () => {
    const dir = await makeProject({}); // no AGENTS.md
    const snapshot = buildSnapshot({
      projectPath: dir,
      manifestContent: "{}",
      structureHash: sha256("src"),
      filesManaged: [{ tool: "agents-md", path: path.join(dir, "AGENTS.md"), sha256: sha256("# AGENTS.md\n") }],
      language: "typescript",
      framework: null,
      topLevelDirs: ["src"],
      dependencyCount: 0,
      totalFiles: 1,
    });
    await saveSnapshot(snapshot);

    const result = await runDrift({ projectPath: dir });
    expect(result.hasSnapshot).toBe(true);
    expect(result.highDrift).toBe(true);
    expect(result.maxSeverity).toBe("HIGH");
    expect(result.report).toContain("AGENTS.md");
  });

  it("returns hasSnapshot=false with no snapshot", async () => {
    const dir = await makeProject({ "AGENTS.md": "# AGENTS.md\n" });
    const result = await runDrift({ projectPath: dir });
    expect(result.hasSnapshot).toBe(false);
    expect(result.highDrift).toBe(false);
  });
});

describe("drift detection", () => {
  it("reports no drift when nothing changed", () => {
    const corpus = makeCorpus();
    const manifestContent = corpus.manifest.dependencies.join("\n") + corpus.manifest.devDependencies.join("\n");
    const snapshot = buildSnapshot({
      projectPath: "/tmp/project",
      manifestContent,
      structureHash: sha256(corpus.structure.topLevelDirs.join(",")),
      filesManaged: [],
      language: "typescript",
      framework: "nextjs",
      topLevelDirs: corpus.structure.topLevelDirs,
      dependencyCount: corpus.manifest.dependencies.length,
      totalFiles: corpus.structure.totalFileCount,
    });

    const report = detectDrift(snapshot, corpus);
    const highOrMed = report.signals.filter((s) => s.severity === "HIGH" || s.severity === "MEDIUM");
    expect(highOrMed).toHaveLength(0);
  });

  it("reports HIGH when many new dependencies added", () => {
    // corpus has 3 deps; snapshot had 0 — diff of 3 triggers HIGH
    const corpus = makeCorpus();
    const snapshotCorpus = makeCorpus();
    const manifestContent = "";
    const snapshot = buildSnapshot({
      projectPath: "/tmp/project",
      manifestContent,
      structureHash: sha256(snapshotCorpus.structure.topLevelDirs.join(",")),
      filesManaged: [],
      language: "typescript",
      framework: null,
      topLevelDirs: snapshotCorpus.structure.topLevelDirs,
      dependencyCount: 0,
      totalFiles: 50,
    });

    const report = detectDrift(snapshot, corpus);
    const high = report.signals.filter((s) => s.severity === "HIGH");
    expect(high.length).toBeGreaterThan(0);
  });

  it("reports HIGH when new top-level dirs appear", () => {
    const corpus = makeCorpus({
      structure: {
        topLevelDirs: ["src", "tests", "public", "workers"],
        entryPoints: [],
        testDirs: ["tests"],
        totalFileCount: 60,
        namingConvention: "kebab-case",
        tree: "",
      },
    });

    const manifestContent = corpus.manifest.dependencies.join("\n");
    const snapshot = buildSnapshot({
      projectPath: "/tmp/project",
      manifestContent,
      structureHash: sha256(["src", "tests", "public"].join(",")),
      filesManaged: [],
      language: "typescript",
      framework: null,
      topLevelDirs: ["src", "tests", "public"],
      dependencyCount: corpus.manifest.dependencies.length,
      totalFiles: 50,
    });

    const report = detectDrift(snapshot, corpus);
    const newDirSignal = report.signals.find((s) => s.message.includes("workers"));
    expect(newDirSignal).toBeDefined();
    expect(newDirSignal?.severity).toBe("HIGH");
  });

  it("reports MEDIUM when 1-2 dependencies change (not enough for HIGH)", () => {
    const corpus = makeCorpus({
      manifest: {
        language: "typescript",
        framework: "nextjs",
        runtime: "node 20",
        packageManager: "npm",
        // 4 deps vs snapshot's 3 — diff of 1, triggers MEDIUM not HIGH
        dependencies: ["next@14", "react@18", "zod@3", "axios@1"],
        devDependencies: ["typescript@5"],
        scripts: { dev: "next dev" },
        projectName: "acme",
        projectVersion: "1.0.0",
      },
    });
    const originalCorpus = makeCorpus(); // 3 deps
    const manifestContent = originalCorpus.manifest.dependencies.join("\n") + originalCorpus.manifest.devDependencies.join("\n");
    const snapshot = buildSnapshot({
      projectPath: "/tmp/project",
      manifestContent,
      structureHash: sha256(originalCorpus.structure.topLevelDirs.join(",")),
      filesManaged: [],
      language: "typescript",
      framework: null,
      topLevelDirs: originalCorpus.structure.topLevelDirs,
      dependencyCount: originalCorpus.manifest.dependencies.length,
      totalFiles: 50,
    });

    const report = detectDrift(snapshot, corpus);
    expect(report.maxSeverity).toBe("MEDIUM");
    expect(report.signals.some((s) => s.severity === "MEDIUM")).toBe(true);
    expect(report.signals.some((s) => s.severity === "HIGH")).toBe(false);
  });

  it("semantic MEDIUM upgrades structural LOW to MEDIUM", () => {
    // Corpus: 1 dep change (LOW structural) + stack contradiction (MEDIUM semantic)
    const corpus = makeCorpus({
      manifest: {
        language: "typescript",
        framework: "nextjs",
        runtime: "node 20",
        packageManager: "npm",
        // AGENTS.md says "prisma" but manifest now has drizzle-orm → HIGH semantic signal
        // Dep names must be bare (no version suffix) for set membership to work
        dependencies: ["next", "react", "zod", "drizzle-orm"],
        devDependencies: ["typescript"],
        scripts: {},
        projectName: "acme",
        projectVersion: "1.0.0",
      },
    });

    const agentsMd = "# AGENTS.md\nWe use prisma for our database layer.\n## Never\n- Never bypass ORM\n";
    const signals = detectSemanticDrift(agentsMd, corpus);
    expect(signals.some((s) => s.severity === "MEDIUM" || s.severity === "HIGH")).toBe(true);
  });

  it("formatDriftReport produces readable output", () => {
    const corpus = makeCorpus();
    const snapshot = buildSnapshot({
      projectPath: "/tmp/project",
      manifestContent: "old",
      structureHash: "old",
      filesManaged: [],
      language: "typescript",
      framework: null,
      topLevelDirs: [],
      dependencyCount: 0,
      totalFiles: 10,
    });

    const report = detectDrift(snapshot, corpus);
    const text = formatDriftReport(report);
    expect(text).toContain("agents-sync drift report");
    expect(text).toContain("Last sync");
  });
});
