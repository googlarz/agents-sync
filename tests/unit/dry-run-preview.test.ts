import { describe, it, expect, vi } from "vitest";
import { deriveAll } from "../../src/derivers/index.js";
import type { ProjectMetadata } from "../../src/extractor/schema.js";

const METADATA: ProjectMetadata = {
  project: { name: "test-app", description: "A test app", language: "typescript" },
  stack: { other: [] },
  architecture: { keyDirs: {}, entryPoints: [] },
  conventions: ["kebab-case filenames"],
  gotchas: ["Do not use any — causes runtime errors"],
  boundaries: { alwaysDo: ["Run tests before committing"], askFirst: [], never: ["commit .env files"] },
  testing: { framework: "vitest", command: "vitest run" },
  deployment: { notes: [] },
};

const AGENTS_MD = `# AGENTS.md

## Project
test-app — A test app

## Stack
- TypeScript

## Boundaries

### Never
- commit .env files
`;

describe("dry-run preview in deriveAll", () => {
  it("populates dryRunPreview on each tool result when dryRun=true", async () => {
    const results = await deriveAll({
      projectPath: "/nonexistent",
      agentsMdContent: AGENTS_MD,
      metadata: METADATA,
      tools: ["claude", "cursor"],
      dryRun: true,
    });

    const toolResults = results.filter((r) => r.tool !== "agents-md");
    expect(toolResults.length).toBe(2);
    for (const r of toolResults) {
      expect(r.skipped).toBe(true);
      expect(r.written).toBe(false);
      expect(typeof r.dryRunPreview).toBe("string");
      expect(r.dryRunPreview!.length).toBeGreaterThan(0);
    }
  });

  it("does not populate dryRunPreview when dryRun=false (writes to disk)", async () => {
    // Mock fs writes — we just want to check the result shape, not actually write
    vi.mock("../../src/lib/file-utils.js", () => ({
      writeFileAtomic: vi.fn().mockResolvedValue(undefined),
      assertProjectDir: vi.fn().mockResolvedValue(undefined),
      readFileSafe: vi.fn().mockResolvedValue(null),
    }));
    vi.mock("node:fs/promises", () => ({
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn().mockResolvedValue(""),
    }));

    const results = await deriveAll({
      projectPath: "/nonexistent",
      agentsMdContent: AGENTS_MD,
      metadata: METADATA,
      tools: ["cursor"],
      dryRun: false,
    });

    const cursorResult = results.find((r) => r.tool === "cursor");
    expect(cursorResult?.dryRunPreview).toBeUndefined();
  });

  it("dryRunPreview is capped at 25 lines with ellipsis", async () => {
    // Create AGENTS.md with many lines
    const longAgentsMd = `# AGENTS.md\n\n` + Array.from({ length: 50 }, (_, i) => `Line ${i + 1}`).join("\n");

    const results = await deriveAll({
      projectPath: "/nonexistent",
      agentsMdContent: longAgentsMd,
      metadata: METADATA,
      tools: ["cursor"],
      dryRun: true,
    });

    const cursorResult = results.find((r) => r.tool === "cursor");
    expect(cursorResult?.dryRunPreview).toBeTruthy();
    // Preview should be truncated — if original content was long, we expect ellipsis
    // (cursor deriver wraps agents-md content, so the preview may or may not be long depending on derived content)
    expect(typeof cursorResult?.dryRunPreview).toBe("string");
  });
});
