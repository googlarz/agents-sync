import { describe, it, expect } from "vitest";
import { deriveRooModes } from "../../../src/derivers/roo.js";
import type { ProjectMetadata } from "../../../src/extractor/schema.js";

const METADATA: ProjectMetadata = {
  project: { name: "my-app", description: "A test app", language: "typescript", framework: "next.js" },
  stack: { database: "postgres", testing: "vitest", other: [] },
  architecture: { keyDirs: {}, entryPoints: [] },
  conventions: ["Use named exports", "Prefer const"],
  gotchas: ["DB connection is singleton"],
  boundaries: { alwaysDo: ["Run tests before commit"], askFirst: [], never: ["Commit .env files"] },
  testing: { command: "npm test" },
  deployment: { notes: [] },
};

const AGENTS_MD = `# AGENTS.md

## Conventions
- Use named exports
- Prefer const

### Never
- Commit .env files

### Always do
- Run tests before commit
`;

describe("deriveRooModes", () => {
  it("produces valid JSON", async () => {
    const result = await deriveRooModes({
      projectPath: "/nonexistent",
      agentsMdContent: AGENTS_MD,
      metadata: METADATA,
      preserveCustom: false,
    });
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it("has customModes array with one entry", async () => {
    const result = await deriveRooModes({
      projectPath: "/nonexistent",
      agentsMdContent: AGENTS_MD,
      metadata: METADATA,
      preserveCustom: false,
    });
    const parsed = JSON.parse(result) as { customModes: unknown[] };
    expect(parsed.customModes).toHaveLength(1);
  });

  it("mode slug is derived from project name", async () => {
    const result = await deriveRooModes({
      projectPath: "/nonexistent",
      agentsMdContent: AGENTS_MD,
      metadata: METADATA,
      preserveCustom: false,
    });
    const parsed = JSON.parse(result) as { customModes: Array<{ slug: string }> };
    expect(parsed.customModes[0].slug).toBe("my-app");
  });

  it("roleDefinition includes language and framework", async () => {
    const result = await deriveRooModes({
      projectPath: "/nonexistent",
      agentsMdContent: AGENTS_MD,
      metadata: METADATA,
      preserveCustom: false,
    });
    const parsed = JSON.parse(result) as { customModes: Array<{ roleDefinition: string }> };
    expect(parsed.customModes[0].roleDefinition).toContain("typescript");
    expect(parsed.customModes[0].roleDefinition).toContain("next.js");
  });

  it("customInstructions includes Never rules", async () => {
    const result = await deriveRooModes({
      projectPath: "/nonexistent",
      agentsMdContent: AGENTS_MD,
      metadata: METADATA,
      preserveCustom: false,
    });
    const parsed = JSON.parse(result) as { customModes: Array<{ customInstructions: string }> };
    expect(parsed.customModes[0].customInstructions).toContain("Commit .env files");
  });

  it("mode has all permission groups", async () => {
    const result = await deriveRooModes({
      projectPath: "/nonexistent",
      agentsMdContent: AGENTS_MD,
      metadata: METADATA,
      preserveCustom: false,
    });
    const parsed = JSON.parse(result) as { customModes: Array<{ groups: string[] }> };
    expect(parsed.customModes[0].groups).toContain("read");
    expect(parsed.customModes[0].groups).toContain("edit");
    expect(parsed.customModes[0].groups).toContain("mcp");
  });
});
