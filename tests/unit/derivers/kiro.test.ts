import { describe, it, expect } from "vitest";
import { deriveKiroSteering } from "../../../src/derivers/kiro.js";
import type { ProjectMetadata } from "../../../src/extractor/schema.js";

const METADATA: ProjectMetadata = {
  project: {
    name: "acme-api",
    description: "Backend API service",
    language: "typescript",
    framework: "fastify",
  },
  stack: { testing: "vitest", other: [] },
  architecture: {
    keyDirs: { "src/routes": "HTTP handlers", "src/db": "database layer" },
    entryPoints: ["src/index.ts"],
  },
  conventions: [
    "kebab-case filenames throughout",
    "Named exports only — no default exports",
  ],
  gotchas: ["Never import PrismaClient directly — causes pool exhaustion"],
  boundaries: {
    alwaysDo: ["Run tests before committing"],
    askFirst: ["Schema migrations"],
    never: ["Commit .env files"],
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

### Ask First
- Schema migrations

### Never
- Commit .env files
`;

describe("deriveKiroSteering", () => {
  it("includes project name in heading", async () => {
    const result = await deriveKiroSteering({
      projectPath: "/tmp/fake",
      agentsMdContent: AGENTS_MD,
      metadata: METADATA,
      preserveCustom: false,
    });
    expect(result).toContain("# Project Steering — acme-api");
  });

  it("includes language and framework", async () => {
    const result = await deriveKiroSteering({
      projectPath: "/tmp/fake",
      agentsMdContent: AGENTS_MD,
      metadata: METADATA,
      preserveCustom: false,
    });
    expect(result).toContain("**Language:** typescript / fastify");
  });

  it("includes description", async () => {
    const result = await deriveKiroSteering({
      projectPath: "/tmp/fake",
      agentsMdContent: AGENTS_MD,
      metadata: METADATA,
      preserveCustom: false,
    });
    expect(result).toContain("**Description:** Backend API service");
  });

  it("includes conventions from metadata", async () => {
    const result = await deriveKiroSteering({
      projectPath: "/tmp/fake",
      agentsMdContent: AGENTS_MD,
      metadata: METADATA,
      preserveCustom: false,
    });
    expect(result).toContain("kebab-case filenames throughout");
  });

  it("includes gotchas from metadata", async () => {
    const result = await deriveKiroSteering({
      projectPath: "/tmp/fake",
      agentsMdContent: AGENTS_MD,
      metadata: METADATA,
      preserveCustom: false,
    });
    expect(result).toContain("Never import PrismaClient directly");
  });

  it("includes Never rules", async () => {
    const result = await deriveKiroSteering({
      projectPath: "/tmp/fake",
      agentsMdContent: AGENTS_MD,
      metadata: METADATA,
      preserveCustom: false,
    });
    expect(result).toContain("Commit .env files");
  });

  it("includes Ask First rules from AGENTS.md", async () => {
    const result = await deriveKiroSteering({
      projectPath: "/tmp/fake",
      agentsMdContent: AGENTS_MD,
      metadata: METADATA,
      preserveCustom: false,
    });
    expect(result).toContain("Schema migrations");
  });

  it("includes test command", async () => {
    const result = await deriveKiroSteering({
      projectPath: "/tmp/fake",
      agentsMdContent: AGENTS_MD,
      metadata: METADATA,
      preserveCustom: false,
    });
    expect(result).toContain("Run: `npm test`");
  });

  it("omits Testing section when no test command", async () => {
    const noTest = { ...METADATA, testing: { notes: [] } };
    const result = await deriveKiroSteering({
      projectPath: "/tmp/fake",
      agentsMdContent: AGENTS_MD,
      metadata: noTest,
      preserveCustom: false,
    });
    expect(result).not.toContain("## Testing");
  });

  it("includes agents-sync attribution link", async () => {
    const result = await deriveKiroSteering({
      projectPath: "/tmp/fake",
      agentsMdContent: AGENTS_MD,
      metadata: METADATA,
      preserveCustom: false,
    });
    expect(result).toContain("agents-sync");
    expect(result).toContain("agents-sync sync");
  });
});
