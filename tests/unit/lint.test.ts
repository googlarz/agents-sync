import { describe, it, expect } from "vitest";
import { runLint } from "../../src/tools/lint.js";
import { createTempProject, writeTempFile } from "./helpers/temp.js";

describe("runLint", () => {
  it("returns passed=true when no AGENTS.md exists", async () => {
    const dir = await createTempProject({});
    const result = await runLint({ projectPath: dir });
    expect(result.passed).toBe(false);
    expect(result.report).toMatch(/AGENTS\.md not found/);
  });

  it("returns passed=true when Never section is empty", async () => {
    const dir = await createTempProject({
      "AGENTS.md": "# AGENTS.md\n\n## Project\nTest project.\n",
    });
    const result = await runLint({ projectPath: dir });
    expect(result.passed).toBe(true);
    expect(result.totalViolations).toBe(0);
  });

  it("detects console.log violations", async () => {
    const dir = await createTempProject({
      "AGENTS.md": "# AGENTS.md\n\n### Never\n- Never use console.log in production code\n",
      "src/app.ts": 'import express from "express";\nconsole.log("server started");\n',
    });
    const result = await runLint({ projectPath: dir });
    expect(result.passed).toBe(false);
    expect(result.totalViolations).toBeGreaterThan(0);
    const violation = result.checks.find((c) => c.violations.length > 0);
    expect(violation).toBeDefined();
    expect(violation?.violations[0].file).toContain("app.ts");
  });

  it("skips console.log in test files", async () => {
    const dir = await createTempProject({
      "AGENTS.md": "# AGENTS.md\n\n### Never\n- Never use console.log\n",
      "src/app.test.ts": 'console.log("debug output in test");\n',
    });
    const result = await runLint({ projectPath: dir });
    expect(result.passed).toBe(true);
    expect(result.totalViolations).toBe(0);
  });

  it("detects TypeScript any violations", async () => {
    const dir = await createTempProject({
      "AGENTS.md": "# AGENTS.md\n\n### Never\n- Never use TypeScript `any` type\n",
      "src/util.ts": "function process(data: any): void { return; }\n",
    });
    const result = await runLint({ projectPath: dir });
    expect(result.passed).toBe(false);
    expect(result.totalViolations).toBeGreaterThan(0);
  });

  it("detects default export violations", async () => {
    const dir = await createTempProject({
      "AGENTS.md": "# AGENTS.md\n\n### Never\n- Never use default exports\n",
      "src/helper.ts": "export default function helper() {}\n",
    });
    const result = await runLint({ projectPath: dir });
    expect(result.passed).toBe(false);
  });

  it("skips default export check for app/ and pages/ dirs", async () => {
    const dir = await createTempProject({
      "AGENTS.md": "# AGENTS.md\n\n### Never\n- Never use default exports\n",
      "app/page.tsx": "export default function Page() { return null; }\n",
    });
    const result = await runLint({ projectPath: dir });
    expect(result.passed).toBe(true);
  });

  it("marks unknown rules as non-checkable", async () => {
    const dir = await createTempProject({
      "AGENTS.md": "# AGENTS.md\n\n### Never\n- Never write spaghetti code (unmeasurable)\n",
    });
    const result = await runLint({ projectPath: dir });
    expect(result.passed).toBe(true);
    const skipped = result.checks.find((c) => !c.checkable);
    expect(skipped).toBeDefined();
    expect(skipped?.skippedReason).toContain("No automated check");
  });

  it("checks .gitignore for .env guard", async () => {
    const dir = await createTempProject({
      "AGENTS.md": "# AGENTS.md\n\n### Never\n- Never commit .env files to git\n",
    });
    const result = await runLint({ projectPath: dir });
    expect(result.passed).toBe(false);
    const check = result.checks.find((c) => c.violations.some((v) => v.file === ".gitignore"));
    expect(check).toBeDefined();
  });

  it("passes .env check when .gitignore has .env entry", async () => {
    const dir = await createTempProject({
      "AGENTS.md": "# AGENTS.md\n\n### Never\n- Never commit .env files to git\n",
      ".gitignore": ".env\n.env.local\nnode_modules/\n",
    });
    const result = await runLint({ projectPath: dir });
    expect(result.passed).toBe(true);
  });
});
