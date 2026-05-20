import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import { deriveCursorRules } from "../../../src/derivers/cursor.js";
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
    alwaysDo: ["Run tests before committing"],
    askFirst: [],
    never: ["Commit .env files", "Use `any` type"],
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

### Always
- Run tests before committing

### Never
- Commit .env files
- Use \`any\` type`;

describe("deriveCursorRules", () => {
  it("output starts with language/framework header", async () => {
    const result = await deriveCursorRules({
      projectPath: os.tmpdir(),
      agentsMdContent: AGENTS_MD,
      metadata: METADATA,
      preserveCustom: false,
    });

    expect(result.toLowerCase()).toMatch(/typescript|nextjs|language/);
  });

  it("output is under 400 words", async () => {
    const result = await deriveCursorRules({
      projectPath: os.tmpdir(),
      agentsMdContent: AGENTS_MD,
      metadata: METADATA,
      preserveCustom: false,
    });

    const wordCount = result.split(/\s+/).filter(Boolean).length;
    expect(wordCount).toBeLessThan(400);
  });

  it("includes conventions as Always directives", async () => {
    const result = await deriveCursorRules({
      projectPath: os.tmpdir(),
      agentsMdContent: AGENTS_MD,
      metadata: METADATA,
      preserveCustom: false,
    });

    expect(result).toContain("Always:");
    expect(result.toLowerCase()).toContain("kebab-case");
  });

  it("includes Never directives from boundaries and gotchas", async () => {
    const result = await deriveCursorRules({
      projectPath: os.tmpdir(),
      agentsMdContent: AGENTS_MD,
      metadata: METADATA,
      preserveCustom: false,
    });

    expect(result).toContain("Never:");
    expect(result.toLowerCase()).toMatch(/env|prisma/);
  });

  it("includes test command when present", async () => {
    const result = await deriveCursorRules({
      projectPath: os.tmpdir(),
      agentsMdContent: AGENTS_MD,
      metadata: METADATA,
      preserveCustom: false,
    });

    expect(result).toContain("npm test");
  });
});
