import { describe, it, expect } from "vitest";
import { metadataFromCorpus } from "../../../src/extractor/extractor.js";
import type { RawCorpus } from "../../../src/scanner/index.js";

const EMPTY_CODEGRAPH = { available: false as const, communities: [], hubNodes: [], entryPoints: [] };
const EMPTY_MCP = { servers: [], hasAny: false };

function makeCorpus(langOverride = "typescript", deps: string[] = [], scripts: Record<string, string> = {}): RawCorpus {
  return {
    manifest: {
      language: langOverride,
      framework: "express",
      runtime: "node 20",
      packageManager: "npm",
      dependencies: deps,
      devDependencies: [],
      scripts: { test: "vitest run", ...scripts },
      projectName: "acme-api",
      projectVersion: "2.0.0",
    },
    structure: {
      topLevelDirs: ["src", "tests"],
      entryPoints: ["src/index.ts"],
      testDirs: ["tests"],
      totalFileCount: 100,
      namingConvention: "kebab-case",
      tree: ".",
    },
    source: { files: [], totalTokens: 0, importStyle: "esm", detectedPatterns: [] },
    docs: {
      readme: null, contributing: null, architecture: null,
      existingAgentsMd: null, existingClaudeMd: null, existingCursorRules: null,
      hasExistingClaudeMd: false, hasExistingAgentsMd: false, totalTokens: 0,
    },
    gotchas: [],
    codegraph: EMPTY_CODEGRAPH,
    mcp: EMPTY_MCP,
    totalEstimatedTokens: 500,
    scanDurationMs: 50,
  };
}

describe("metadataFromCorpus", () => {
  it("uses projectName and language from manifest", () => {
    const meta = metadataFromCorpus(makeCorpus("typescript"), "/project");
    expect(meta.project.name).toBe("acme-api");
    expect(meta.project.language).toBe("typescript");
  });

  it("uses projectPath basename when projectName is null", () => {
    const corpus = makeCorpus("typescript");
    corpus.manifest.projectName = null;
    const meta = metadataFromCorpus(corpus, "/some/path/my-project");
    expect(meta.project.name).toBe("my-project");
  });

  it("uses framework from manifest", () => {
    const meta = metadataFromCorpus(makeCorpus("typescript"), "/project");
    expect(meta.project.framework).toBe("express");
  });

  it("detects vitest from scripts", () => {
    const meta = metadataFromCorpus(makeCorpus("typescript", ["vitest"]), "/project");
    expect(meta.stack.testing).toBe("vitest");
    expect(meta.testing.framework).toBe("vitest");
  });

  it("detects jest from devDependencies", () => {
    const corpus = makeCorpus("typescript");
    corpus.manifest.devDependencies = ["jest", "@types/jest"];
    corpus.manifest.scripts = { test: "jest" };
    const meta = metadataFromCorpus(corpus, "/project");
    expect(meta.stack.testing).toBe("jest");
  });

  it("detects prisma database", () => {
    const meta = metadataFromCorpus(makeCorpus("typescript", ["@prisma/client", "prisma"]), "/project");
    expect(meta.stack.database).toContain("prisma");
  });

  it("detects next-auth", () => {
    const meta = metadataFromCorpus(makeCorpus("typescript", ["next-auth"]), "/project");
    expect(meta.stack.auth).toBe("next-auth");
  });

  it("detects stripe in other stack", () => {
    const meta = metadataFromCorpus(makeCorpus("typescript", ["stripe"]), "/project");
    expect(meta.stack.other).toContain("stripe");
  });

  it("detects vercel deploy from deps", () => {
    const meta = metadataFromCorpus(makeCorpus("typescript", ["@vercel/og"]), "/project");
    expect(meta.stack.deploy).toBe("vercel");
  });

  it("uses test command from manifest scripts", () => {
    const meta = metadataFromCorpus(makeCorpus("typescript"), "/project");
    expect(meta.testing.command).toBe("vitest run");
  });

  it("returns entry points from structure", () => {
    const meta = metadataFromCorpus(makeCorpus("typescript"), "/project");
    expect(meta.architecture.entryPoints).toContain("src/index.ts");
  });

  it("returns empty conventions and boundaries", () => {
    const meta = metadataFromCorpus(makeCorpus("typescript"), "/project");
    expect(meta.conventions).toEqual([]);
    expect(meta.boundaries.never).toEqual([]);
  });
});
