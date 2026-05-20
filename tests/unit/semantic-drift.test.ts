import { describe, it, expect } from "vitest";
import { detectSemanticDrift } from "../../src/snapshot/drift.js";
import type { RawCorpus } from "../../src/scanner/index.js";

function makeCorpus(deps: string[] = [], devDeps: string[] = [], tree = ""): RawCorpus {
  return {
    manifest: {
      language: "typescript",
      framework: null,
      runtime: null,
      packageManager: "npm",
      dependencies: deps,
      devDependencies: devDeps,
      scripts: {},
      projectName: "test",
      projectVersion: "1.0.0",
    },
    structure: {
      topLevelDirs: [],
      entryPoints: [],
      testDirs: [],
      totalFileCount: 0,
      namingConvention: "mixed",
      tree,
    },
    source: { files: [], totalTokens: 0, importStyle: "esm", detectedPatterns: [] },
    docs: { readme: null, contributing: null, architecture: null, existingAgentsMd: null, existingClaudeMd: null, existingCursorRules: null, hasExistingClaudeMd: false, hasExistingAgentsMd: false, totalTokens: 0 },
    gotchas: [],
    codegraph: { available: false, communities: [], hubNodes: [], entryPoints: [] },
    totalEstimatedTokens: 100,
    scanDurationMs: 0,
  };
}

describe("detectSemanticDrift", () => {
  it("returns no signals when AGENTS.md and manifest agree", () => {
    const agentsMd = "Stack: Prisma for database access.";
    const corpus = makeCorpus(["@prisma/client"]);
    expect(detectSemanticDrift(agentsMd, corpus)).toHaveLength(0);
  });

  it("flags HIGH when AGENTS.md says prisma but manifest has drizzle", () => {
    const agentsMd = "We use Prisma for all database queries.";
    const corpus = makeCorpus(["drizzle-orm"]);
    const signals = detectSemanticDrift(agentsMd, corpus);
    expect(signals.some((s) => s.severity === "HIGH")).toBe(true);
    expect(signals[0].message).toMatch(/prisma/i);
  });

  it("flags HIGH when AGENTS.md says vitest but manifest has jest", () => {
    const agentsMd = "Testing: Vitest with coverage.";
    const corpus = makeCorpus([], ["jest"]);
    const signals = detectSemanticDrift(agentsMd, corpus);
    expect(signals.some((s) => s.severity === "HIGH")).toBe(true);
  });

  it("flags HIGH when AGENTS.md says Next.js but manifest has remix", () => {
    const agentsMd = "Frontend built with Next.js App Router.";
    const corpus = makeCorpus(["remix"]);
    const signals = detectSemanticDrift(agentsMd, corpus);
    expect(signals.some((s) => s.severity === "HIGH")).toBe(true);
  });

  it("flags MEDIUM when AGENTS.md says vercel but fly.toml exists in tree", () => {
    const agentsMd = "Deploy target: Vercel.";
    const corpus = makeCorpus([], [], "fly.toml\nsrc/index.ts");
    const signals = detectSemanticDrift(agentsMd, corpus);
    expect(signals.some((s) => s.severity === "MEDIUM")).toBe(true);
    expect(signals[0].message).toMatch(/vercel/i);
  });

  it("returns empty when AGENTS.md makes no stack claims", () => {
    const agentsMd = "# Project\n\nA cool app.";
    const corpus = makeCorpus(["express", "pg"]);
    expect(detectSemanticDrift(agentsMd, corpus)).toHaveLength(0);
  });
});
