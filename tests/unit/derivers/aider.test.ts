import { describe, it, expect } from "vitest";
import { deriveAiderConventions } from "../../../src/derivers/aider.js";
import type { ProjectMetadata } from "../../../src/extractor/schema.js";

const METADATA: ProjectMetadata = {
  project: { name: "my-app", description: "A test app", language: "typescript", framework: "next.js" },
  stack: { database: "postgres", testing: "vitest", deploy: "vercel", other: [] },
  architecture: { keyDirs: {}, entryPoints: [] },
  conventions: ["Use named exports", "Prefer const"],
  gotchas: ["DB connection is singleton"],
  boundaries: { alwaysDo: ["Run tests before commit"], askFirst: ["Add dependencies"], never: ["Commit .env files"] },
  testing: { command: "npm test", location: "tests/" },
  deployment: { notes: [] },
};

const AGENTS_MD = `# AGENTS.md

## Conventions
- Use named exports
- Prefer const

## Gotchas
- DB connection is singleton

### Never
- Commit .env files

### Always do
- Run tests before commit

### Ask first
- Add dependencies
`;

describe("deriveAiderConventions", () => {
  it("output starts with CONVENTIONS.md header", async () => {
    const result = await deriveAiderConventions({
      projectPath: "/nonexistent",
      agentsMdContent: AGENTS_MD,
      metadata: METADATA,
      preserveCustom: false,
    });
    expect(result).toMatch(/^# CONVENTIONS\.md/);
  });

  it("includes project name and language in header", async () => {
    const result = await deriveAiderConventions({
      projectPath: "/nonexistent",
      agentsMdContent: AGENTS_MD,
      metadata: METADATA,
      preserveCustom: false,
    });
    expect(result).toContain("my-app");
    expect(result).toContain("typescript");
  });

  it("includes Conventions section", async () => {
    const result = await deriveAiderConventions({
      projectPath: "/nonexistent",
      agentsMdContent: AGENTS_MD,
      metadata: METADATA,
      preserveCustom: false,
    });
    expect(result).toContain("## Conventions");
    expect(result).toContain("Use named exports");
  });

  it("includes Never section", async () => {
    const result = await deriveAiderConventions({
      projectPath: "/nonexistent",
      agentsMdContent: AGENTS_MD,
      metadata: METADATA,
      preserveCustom: false,
    });
    expect(result).toContain("## Never");
    expect(result).toContain("Commit .env files");
  });

  it("includes Ask first section", async () => {
    const result = await deriveAiderConventions({
      projectPath: "/nonexistent",
      agentsMdContent: AGENTS_MD,
      metadata: METADATA,
      preserveCustom: false,
    });
    expect(result).toContain("## Ask first");
    expect(result).toContain("Add dependencies");
  });

  it("includes Stack section with database and deploy", async () => {
    const result = await deriveAiderConventions({
      projectPath: "/nonexistent",
      agentsMdContent: AGENTS_MD,
      metadata: METADATA,
      preserveCustom: false,
    });
    expect(result).toContain("## Stack");
    expect(result).toContain("postgres");
    expect(result).toContain("vercel");
  });

  it("includes test command", async () => {
    const result = await deriveAiderConventions({
      projectPath: "/nonexistent",
      agentsMdContent: AGENTS_MD,
      metadata: METADATA,
      preserveCustom: false,
    });
    expect(result).toContain("npm test");
    expect(result).toContain("tests/");
  });
});
