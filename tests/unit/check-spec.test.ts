import { describe, it, expect } from "vitest";
import { runCheckSpec } from "../../src/tools/check-spec.js";
import { createTempProject } from "./helpers/temp.js";

const FULL_AGENTS_MD = `# AGENTS.md

## Architecture
src/ — application source code. tests/ — test suite. dist/ — compiled output.

## Commands
\`\`\`
Build: npm run build
Test:  npm test
Lint:  npm run lint
\`\`\`

## Guidelines
- Never commit .env files
- Always run tests before committing
- Never use \`any\` type in TypeScript
`;

describe("runCheckSpec", () => {
  it("passes a well-formed AGENTS.md", async () => {
    const dir = await createTempProject({ "AGENTS.md": FULL_AGENTS_MD });
    const result = await runCheckSpec({ projectPath: dir });

    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.report).toContain("passes all spec checks");
  });

  it("warns when Commands section is missing", async () => {
    const dir = await createTempProject({
      "AGENTS.md": "# AGENTS.md\n\n## Architecture\nSomething.\n\n## Guidelines\nNever X.\n",
    });
    const result = await runCheckSpec({ projectPath: dir });

    expect(result.passed).toBe(false);
    const messages = result.violations.map((v) => v.message);
    expect(messages.some((m) => m.includes("Commands"))).toBe(true);
  });

  it("warns when Architecture section is missing", async () => {
    const dir = await createTempProject({
      "AGENTS.md": "# AGENTS.md\n\n## Commands\nnpm test\n\n## Guidelines\nNever X.\n",
    });
    const result = await runCheckSpec({ projectPath: dir });

    const messages = result.violations.map((v) => v.message);
    expect(messages.some((m) => m.includes("Architecture"))).toBe(true);
  });

  it("warns when Guidelines section is missing", async () => {
    const dir = await createTempProject({
      "AGENTS.md": "# AGENTS.md\n\n## Commands\nnpm test\n\n## Architecture\nSomething.\n",
    });
    const result = await runCheckSpec({ projectPath: dir });

    const messages = result.violations.map((v) => v.message);
    expect(messages.some((m) => m.includes("Guidelines"))).toBe(true);
  });

  it("errors when AGENTS.md is missing entirely", async () => {
    const dir = await createTempProject({});
    const result = await runCheckSpec({ projectPath: dir });

    expect(result.passed).toBe(false);
    expect(result.violations[0].severity).toBe("ERROR");
  });

  it("--ci mode passes despite warnings when no errors", async () => {
    // A minimal but somewhat structured AGENTS.md — will have warnings but no errors
    const dir = await createTempProject({
      "AGENTS.md": "# AGENTS.md\n\n## Commands\n`npm test`\n\n## Architecture\nSrc layout.\n\n## Guidelines\nNever X.\n",
    });
    const result = await runCheckSpec({ projectPath: dir, ci: true });

    // No ERROR-level violations, so ci mode should pass
    const errors = result.violations.filter((v) => v.severity === "ERROR");
    if (errors.length === 0) {
      expect(result.passed).toBe(true);
    }
  });
});
