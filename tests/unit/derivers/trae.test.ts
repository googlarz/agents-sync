import { describe, it, expect } from "vitest";
import { deriveTraeRules } from "../../../src/derivers/trae.js";
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
  ],
  gotchas: ["Never import PrismaClient directly — causes pool exhaustion"],
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

## Gotchas
- Never import PrismaClient directly — causes pool exhaustion

## Boundaries

### Always
- Run tests before committing

### Never
- Commit .env files
- Use \`any\` type
`;

describe("deriveTraeRules", () => {
  it("includes managed-by header", async () => {
    const result = await deriveTraeRules({
      projectPath: "/tmp/fake",
      agentsMdContent: AGENTS_MD,
      metadata: METADATA,
      preserveCustom: false,
    });
    expect(result).toContain("managed by agents-sync");
  });

  it("includes language and framework in header", async () => {
    const result = await deriveTraeRules({
      projectPath: "/tmp/fake",
      agentsMdContent: AGENTS_MD,
      metadata: METADATA,
      preserveCustom: false,
    });
    expect(result).toContain("typescript / nextjs");
  });

  it("formats conventions as Always: directives", async () => {
    const result = await deriveTraeRules({
      projectPath: "/tmp/fake",
      agentsMdContent: AGENTS_MD,
      metadata: METADATA,
      preserveCustom: false,
    });
    expect(result).toContain("- Always: kebab-case filenames throughout");
  });

  it("formats gotchas as Never: directives", async () => {
    const result = await deriveTraeRules({
      projectPath: "/tmp/fake",
      agentsMdContent: AGENTS_MD,
      metadata: METADATA,
      preserveCustom: false,
    });
    expect(result).toContain("- Never: Never import PrismaClient directly");
  });

  it("includes Hard boundaries section for Never rules", async () => {
    const result = await deriveTraeRules({
      projectPath: "/tmp/fake",
      agentsMdContent: AGENTS_MD,
      metadata: METADATA,
      preserveCustom: false,
    });
    expect(result).toContain("## Hard boundaries");
    expect(result).toContain("- Never: Commit .env files");
  });

  it("includes Always do section for alwaysDo boundaries", async () => {
    const result = await deriveTraeRules({
      projectPath: "/tmp/fake",
      agentsMdContent: AGENTS_MD,
      metadata: METADATA,
      preserveCustom: false,
    });
    expect(result).toContain("## Always do");
    expect(result).toContain("- Run tests before committing");
  });

  it("includes test command", async () => {
    const result = await deriveTraeRules({
      projectPath: "/tmp/fake",
      agentsMdContent: AGENTS_MD,
      metadata: METADATA,
      preserveCustom: false,
    });
    expect(result).toContain("Tests: `npm test`");
  });

  it("omits test command when not set", async () => {
    const noTest = { ...METADATA, testing: { notes: [] } };
    const result = await deriveTraeRules({
      projectPath: "/tmp/fake",
      agentsMdContent: AGENTS_MD,
      metadata: noTest,
      preserveCustom: false,
    });
    expect(result).not.toContain("Tests:");
  });

  it("deduplicates conventions from metadata and AGENTS.md", async () => {
    const result = await deriveTraeRules({
      projectPath: "/tmp/fake",
      agentsMdContent: AGENTS_MD,
      metadata: METADATA,
      preserveCustom: false,
    });
    const matches = result.match(/kebab-case filenames throughout/g) ?? [];
    expect(matches.length).toBe(1);
  });
});
