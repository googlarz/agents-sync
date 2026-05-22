import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { runInstallHook } from "../../src/tools/install-hook.js";
import { createTempProject } from "./helpers/temp.js";

async function makeGitRepo(files: Record<string, string> = {}): Promise<string> {
  const dir = await createTempProject(files);
  await fs.mkdir(path.join(dir, ".git", "hooks"), { recursive: true });
  return dir;
}

describe("runInstallHook — git (plain)", () => {
  it("creates .git/hooks/pre-commit when none exists", async () => {
    const dir = await makeGitRepo();
    const result = await runInstallHook({ projectPath: dir, manager: "git" });

    expect(result.manager).toBe("git");
    expect(result.alreadyInstalled).toBe(false);
    expect(result.filesWritten).toHaveLength(1);

    const hookFile = path.join(dir, ".git", "hooks", "pre-commit");
    const content = await fs.readFile(hookFile, "utf-8");
    expect(content).toContain("agents-sync drift");
  });

  it("appends to an existing hook that does not contain agents-sync", async () => {
    const dir = await makeGitRepo();
    const hookFile = path.join(dir, ".git", "hooks", "pre-commit");
    await fs.writeFile(hookFile, "#!/usr/bin/env sh\nnpm test\n", "utf-8");

    const result = await runInstallHook({ projectPath: dir, manager: "git" });

    expect(result.alreadyInstalled).toBe(false);
    const content = await fs.readFile(hookFile, "utf-8");
    expect(content).toContain("npm test");
    expect(content).toContain("agents-sync drift");
  });

  it("detects already-installed hook and returns alreadyInstalled=true", async () => {
    const dir = await makeGitRepo();
    const hookFile = path.join(dir, ".git", "hooks", "pre-commit");
    await fs.writeFile(hookFile, "#!/usr/bin/env sh\n# BEGIN agents-sync\nnpx @googlarz/agents-sync drift . --ci\n# END agents-sync\n", "utf-8");

    const result = await runInstallHook({ projectPath: dir, manager: "git" });

    expect(result.alreadyInstalled).toBe(true);
    expect(result.filesWritten).toHaveLength(0);
  });

  it("dry-run does not write files", async () => {
    const dir = await makeGitRepo();
    const result = await runInstallHook({ projectPath: dir, manager: "git", dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.filesWritten).toHaveLength(1);

    const hookFile = path.join(dir, ".git", "hooks", "pre-commit");
    await expect(fs.access(hookFile)).rejects.toThrow();
  });

  it("throws when no .git directory exists", async () => {
    const dir = await createTempProject({});
    await expect(runInstallHook({ projectPath: dir, manager: "git" })).rejects.toThrow(/No \.git directory/);
  });
});

describe("runInstallHook — husky", () => {
  it("creates .husky/pre-commit when none exists", async () => {
    const dir = await createTempProject({});
    await fs.mkdir(path.join(dir, ".husky"), { recursive: true });

    const result = await runInstallHook({ projectPath: dir, manager: "husky" });

    expect(result.manager).toBe("husky");
    const content = await fs.readFile(path.join(dir, ".husky", "pre-commit"), "utf-8");
    expect(content).toContain("agents-sync drift");
  });

  it("detects already-installed husky hook", async () => {
    const dir = await createTempProject({});
    await fs.mkdir(path.join(dir, ".husky"), { recursive: true });
    await fs.writeFile(path.join(dir, ".husky", "pre-commit"), "# BEGIN agents-sync\nnpx @googlarz/agents-sync drift . --ci\n# END agents-sync\n");

    const result = await runInstallHook({ projectPath: dir, manager: "husky" });
    expect(result.alreadyInstalled).toBe(true);
  });
});

describe("runInstallHook — lefthook", () => {
  it("creates .lefthook.yml when none exists", async () => {
    const dir = await createTempProject({});
    const result = await runInstallHook({ projectPath: dir, manager: "lefthook" });

    expect(result.manager).toBe("lefthook");
    const content = await fs.readFile(path.join(dir, ".lefthook.yml"), "utf-8");
    expect(content).toContain("agents-sync drift");
    expect(content).toContain("pre-commit");
  });

  it("appends to existing .lefthook.yml without agents-sync entry", async () => {
    const dir = await createTempProject({
      ".lefthook.yml": "pre-push:\n  commands:\n    tests:\n      run: npm test\n",
    });
    const result = await runInstallHook({ projectPath: dir, manager: "lefthook" });

    expect(result.alreadyInstalled).toBe(false);
    const content = await fs.readFile(path.join(dir, ".lefthook.yml"), "utf-8");
    expect(content).toContain("pre-push");
    expect(content).toContain("agents-sync drift");
  });

  it("detects already-installed lefthook config", async () => {
    const dir = await createTempProject({
      ".lefthook.yml": "pre-commit:\n  commands:\n    agents-sync:\n      run: npx @googlarz/agents-sync drift . --ci\n",
    });
    const result = await runInstallHook({ projectPath: dir, manager: "lefthook" });
    expect(result.alreadyInstalled).toBe(true);
  });
});

describe("runInstallHook — auto-detection", () => {
  it("detects husky from .husky directory", async () => {
    const dir = await makeGitRepo();
    await fs.mkdir(path.join(dir, ".husky"), { recursive: true });
    const result = await runInstallHook({ projectPath: dir });
    expect(result.manager).toBe("husky");
  });

  it("detects lefthook from lefthook.yml config file", async () => {
    const dir = await createTempProject({
      "lefthook.yml": "pre-commit:\n  commands: {}\n",
    });
    const result = await runInstallHook({ projectPath: dir, manager: "lefthook" });
    expect(result.manager).toBe("lefthook");
  });

  it("falls back to git when no hook manager detected", async () => {
    const dir = await makeGitRepo();
    const result = await runInstallHook({ projectPath: dir });
    expect(result.manager).toBe("git");
  });
});
