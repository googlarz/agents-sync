import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractMetadata } from "../../src/extractor/extractor.js";
import type { RawCorpus } from "../../src/scanner/index.js";

vi.mock("../../src/lib/claude-client.js", () => ({
  callClaude: vi.fn(),
}));

import { callClaude } from "../../src/lib/claude-client.js";
const mockCallClaude = vi.mocked(callClaude);

const MINIMAL_CORPUS: RawCorpus = {
  manifest: {
    language: "typescript",
    framework: "nextjs",
    runtime: "node >=18",
    packageManager: "npm",
    dependencies: ["next@14.2.0", "react@18.3.0"],
    devDependencies: ["typescript@5.4.5", "vitest@1.6.0"],
    scripts: { dev: "next dev", test: "vitest run" },
    projectName: "acme-dashboard",
    projectVersion: "0.4.2",
  },
  structure: {
    topLevelDirs: ["src", "public"],
    entryPoints: ["src/index.ts"],
    testDirs: ["tests"],
    namingConvention: "kebab-case",
    totalFileCount: 42,
    tree: "src/\n  app/\n  lib/\n",
  },
  source: {
    files: [],
    importStyle: "esm",
    detectedPatterns: ["prisma", "zod"],
  },
  docs: {
    readme: "# Acme Dashboard\nAn internal analytics tool.",
    contributing: null,
    architecture: null,
    existingAgentsMd: null,
    existingClaudeMd: null,
    existingCursorRules: null,
    hasExistingClaudeMd: false,
    hasExistingAgentsMd: false,
    totalTokens: 50,
  },
  gotchas: [
    { file: "src/lib/db.ts", line: 3, type: "IMPORTANT", comment: "Use this singleton. Do NOT import PrismaClient directly." },
  ],
};

const VALID_METADATA_JSON = JSON.stringify({
  project: {
    name: "acme-dashboard",
    description: "Internal analytics tool",
    language: "typescript",
    framework: "nextjs",
  },
  stack: {
    testing: "vitest",
    other: [],
  },
  architecture: {
    keyDirs: { "src/app": "pages and layouts", "src/lib": "shared utilities" },
    entryPoints: ["src/index.ts"],
  },
  conventions: ["Use kebab-case filenames", "Named exports only"],
  gotchas: ["Never import PrismaClient directly — causes pool exhaustion"],
  boundaries: {
    alwaysDo: ["Validate external input with Zod"],
    askFirst: [],
    never: ["Commit .env files"],
  },
  testing: {
    framework: "vitest",
    command: "npm test",
    location: "tests/",
  },
  deployment: {
    notes: [],
  },
});

describe("extractMetadata", () => {
  beforeEach(() => {
    mockCallClaude.mockReset();
  });

  it("parses valid JSON response from Claude", async () => {
    mockCallClaude.mockResolvedValueOnce({ content: VALID_METADATA_JSON, inputTokens: 100, outputTokens: 50 });

    const result = await extractMetadata(MINIMAL_CORPUS);

    expect(result.project.name).toBe("acme-dashboard");
    expect(result.project.language).toBe("typescript");
    expect(result.conventions).toContain("Use kebab-case filenames");
    expect(result.gotchas).toContain("Never import PrismaClient directly — causes pool exhaustion");
  });

  it("strips markdown code fences before parsing", async () => {
    const fenced = "```json\n" + VALID_METADATA_JSON + "\n```";
    mockCallClaude.mockResolvedValueOnce({ content: fenced, inputTokens: 100, outputTokens: 50 });

    const result = await extractMetadata(MINIMAL_CORPUS);

    expect(result.project.name).toBe("acme-dashboard");
  });

  it("retries once on invalid JSON then succeeds", async () => {
    mockCallClaude
      .mockResolvedValueOnce({ content: "not json at all", inputTokens: 100, outputTokens: 10 })
      .mockResolvedValueOnce({ content: VALID_METADATA_JSON, inputTokens: 100, outputTokens: 50 });

    const result = await extractMetadata(MINIMAL_CORPUS);

    expect(result.project.name).toBe("acme-dashboard");
    expect(mockCallClaude).toHaveBeenCalledTimes(2);
  });

  it("throws EXTRACTION_FAILED after two bad responses", async () => {
    mockCallClaude
      .mockResolvedValueOnce({ content: "bad", inputTokens: 10, outputTokens: 5 })
      .mockResolvedValueOnce({ content: "also bad", inputTokens: 10, outputTokens: 5 });

    await expect(extractMetadata(MINIMAL_CORPUS)).rejects.toMatchObject({
      code: "EXTRACTION_FAILED",
    });
  });

  it("throws EXTRACTION_FAILED when Zod schema validation fails", async () => {
    const missingRequiredFields = JSON.stringify({ stack: {} });
    mockCallClaude
      .mockResolvedValueOnce({ content: missingRequiredFields, inputTokens: 10, outputTokens: 10 })
      .mockResolvedValueOnce({ content: missingRequiredFields, inputTokens: 10, outputTokens: 10 });

    await expect(extractMetadata(MINIMAL_CORPUS)).rejects.toMatchObject({
      code: "EXTRACTION_FAILED",
    });
  });
});
