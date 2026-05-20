import { describe, it, expect } from "vitest";
import { detectDrift, formatDriftReport } from "../../src/snapshot/drift.js";
import { buildSnapshot, sha256 } from "../../src/snapshot/writer.js";
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
    totalEstimatedTokens: 1000,
    scanDurationMs: 100,
    ...overrides,
  };
}

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
