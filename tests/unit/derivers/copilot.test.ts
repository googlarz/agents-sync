import { describe, it, expect } from "vitest";
import os from "node:os";
import { deriveCopilotInstructions } from "../../../src/derivers/copilot.js";
import type { ProjectMetadata } from "../../../src/extractor/schema.js";

const METADATA: ProjectMetadata = {
  project: {
    name: "acme-dashboard",
    description: "Internal analytics tool",
    language: "typescript",
    framework: "nextjs",
  },
  stack: { testing: "vitest", other: [] },
  architecture: {
    keyDirs: { "src/app": "pages", "src/lib": "utilities" },
    entryPoints: ["src/index.ts"],
  },
  conventions: [
    "kebab-case filenames throughout",
    "Named exports only — no default exports",
    "Validate all external input with Zod",
  ],
  gotchas: [
    "Never import PrismaClient directly — causes pool exhaustion",
  ],
  boundaries: {
    alwaysDo: [],
    askFirst: [],
    // "any" type triggers isCodeLevel (contains "type") — will appear in output
    never: ["Use `any` type", "Commit .env files"],
  },
  testing: { framework: "vitest", command: "npm test", notes: [] },
  deployment: { notes: [] },
};

const AGENTS_MD = `# AGENTS.md

## Conventions
1. kebab-case filenames throughout
2. Named exports only — no default exports
3. Validate all external input with Zod

## Gotchas
1. Never import PrismaClient directly — causes pool exhaustion

## Boundaries

### Never
- Commit .env files`;

describe("deriveCopilotInstructions", () => {
  it("output is under 300 words", async () => {
    const result = await deriveCopilotInstructions({
      projectPath: os.tmpdir(),
      agentsMdContent: AGENTS_MD,
      metadata: METADATA,
      preserveCustom: false,
    });

    const wordCount = result.split(/\s+/).filter(Boolean).length;
    expect(wordCount).toBeLessThan(300);
  });

  it("includes framework hint for Next.js", async () => {
    const result = await deriveCopilotInstructions({
      projectPath: os.tmpdir(),
      agentsMdContent: AGENTS_MD,
      metadata: METADATA,
      preserveCustom: false,
    });

    // Next.js hint is about Server Components
    expect(result.toLowerCase()).toMatch(/server component|nextjs|next\.js/i);
  });

  it("includes language and test command", async () => {
    const result = await deriveCopilotInstructions({
      projectPath: os.tmpdir(),
      agentsMdContent: AGENTS_MD,
      metadata: METADATA,
      preserveCustom: false,
    });

    expect(result.toLowerCase()).toContain("typescript");
    expect(result).toContain("npm test");
  });

  it("includes code-level Never rules and excludes non-code rules", async () => {
    const result = await deriveCopilotInstructions({
      projectPath: os.tmpdir(),
      agentsMdContent: AGENTS_MD,
      metadata: METADATA,
      preserveCustom: false,
    });

    // "Use `any` type" contains "type" → passes isCodeLevel filter
    expect(result).toContain("## Never");
    expect(result.toLowerCase()).toContain("any");
    // "Commit .env files" is non-code-level → excluded
    expect(result.toLowerCase()).not.toContain(".env");
  });

  it("does not include gotchas (copilot is code-completion focused, not docs)", async () => {
    const result = await deriveCopilotInstructions({
      projectPath: os.tmpdir(),
      agentsMdContent: AGENTS_MD,
      metadata: METADATA,
      preserveCustom: false,
    });

    // Copilot deriver excludes free-form gotchas intentionally
    expect(result).not.toContain("## Gotchas");
    expect(result.toLowerCase()).not.toContain("pool exhaustion");
  });
});
