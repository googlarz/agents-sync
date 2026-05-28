import { describe, it, expect } from "vitest";
import { detectStack, generateFromTemplate } from "../../src/templates/index.js";
import type { RawCorpus } from "../../src/scanner/index.js";

const EMPTY_CODEGRAPH = { available: false as const, communities: [], hubNodes: [], entryPoints: [] };
const EMPTY_MCP = { servers: [], hasAny: false };

function makeCorpus(overrides: Partial<RawCorpus> = {}): RawCorpus {
  return {
    manifest: {
      language: "typescript",
      framework: null,
      runtime: "node",
      packageManager: "npm",
      dependencies: [],
      devDependencies: [],
      scripts: { test: "npm test", build: "npm run build" },
      projectName: "my-app",
      projectVersion: "1.0.0",
    },
    structure: {
      topLevelDirs: ["src", "tests"],
      entryPoints: ["src/index.ts"],
      testDirs: ["tests"],
      totalFileCount: 42,
      namingConvention: "kebab-case",
      tree: ".",
    },
    source: { files: [], totalTokens: 0, importStyle: "esm", detectedPatterns: [] },
    docs: {
      readme: null,
      contributing: null,
      architecture: null,
      existingAgentsMd: null,
      existingClaudeMd: null,
      existingCursorRules: null,
      hasExistingClaudeMd: false,
      hasExistingAgentsMd: false,
      totalTokens: 0,
    },
    gotchas: [],
    codegraph: EMPTY_CODEGRAPH,
    mcp: EMPTY_MCP,
    totalEstimatedTokens: 100,
    scanDurationMs: 10,
    ...overrides,
  };
}

describe("detectStack", () => {
  it("detects typescript", () => {
    expect(detectStack(makeCorpus({ manifest: { ...makeCorpus().manifest, language: "typescript" } }))).toBe("typescript-node");
  });

  it("detects javascript", () => {
    expect(detectStack(makeCorpus({ manifest: { ...makeCorpus().manifest, language: "javascript" } }))).toBe("typescript-node");
  });

  it("detects python", () => {
    expect(detectStack(makeCorpus({ manifest: { ...makeCorpus().manifest, language: "python" } }))).toBe("python");
  });

  it("detects go", () => {
    expect(detectStack(makeCorpus({ manifest: { ...makeCorpus().manifest, language: "go" } }))).toBe("go");
  });

  it("detects rust", () => {
    expect(detectStack(makeCorpus({ manifest: { ...makeCorpus().manifest, language: "rust" } }))).toBe("rust");
  });

  it("detects java", () => {
    expect(detectStack(makeCorpus({ manifest: { ...makeCorpus().manifest, language: "java" } }))).toBe("java");
  });

  it("falls back to generic for unknown language", () => {
    expect(detectStack(makeCorpus({ manifest: { ...makeCorpus().manifest, language: "cobol" } }))).toBe("generic");
  });
});

describe("generateFromTemplate", () => {
  it("returns agentsMd, metadata, and templateUsed", () => {
    const result = generateFromTemplate(makeCorpus(), "/project");
    expect(result.agentsMd).toBeTruthy();
    expect(result.metadata).toBeTruthy();
    expect(result.templateUsed).toBe("typescript-node");
  });

  it("output starts with # AGENTS.md", () => {
    const result = generateFromTemplate(makeCorpus(), "/project");
    expect(result.agentsMd.startsWith("# AGENTS.md")).toBe(true);
  });

  it("includes template notice comment", () => {
    const result = generateFromTemplate(makeCorpus(), "/project");
    expect(result.agentsMd).toContain("template mode");
  });

  it("includes project name", () => {
    const result = generateFromTemplate(makeCorpus(), "/project");
    expect(result.agentsMd).toContain("my-app");
  });

  it("includes test command from manifest scripts", () => {
    const result = generateFromTemplate(makeCorpus(), "/project");
    expect(result.agentsMd).toContain("npm test");
  });

  it("includes directory names", () => {
    const result = generateFromTemplate(makeCorpus(), "/project");
    expect(result.agentsMd).toContain("src");
  });

  it("includes Boundaries section", () => {
    const result = generateFromTemplate(makeCorpus(), "/project");
    expect(result.agentsMd).toContain("## Boundaries");
    expect(result.agentsMd).toContain("### Never");
  });

  it("python template detects pytest", () => {
    const corpus = makeCorpus({
      manifest: {
        ...makeCorpus().manifest,
        language: "python",
        scripts: { test: "pytest" },
      },
    });
    const result = generateFromTemplate(corpus, "/project");
    expect(result.agentsMd).toContain("pytest");
  });

  it("rust template references cargo test", () => {
    const corpus = makeCorpus({
      manifest: { ...makeCorpus().manifest, language: "rust" },
    });
    const result = generateFromTemplate(corpus, "/project");
    expect(result.agentsMd).toContain("cargo test");
  });

  it("go template references go test", () => {
    const corpus = makeCorpus({
      manifest: { ...makeCorpus().manifest, language: "go" },
    });
    const result = generateFromTemplate(corpus, "/project");
    expect(result.agentsMd).toContain("go test");
  });

  it("includes database when detected from deps", () => {
    const corpus = makeCorpus({
      manifest: {
        ...makeCorpus().manifest,
        dependencies: ["prisma", "@prisma/client"],
      },
    });
    const result = generateFromTemplate(corpus, "/project");
    expect(result.agentsMd).toContain("prisma");
  });
});
