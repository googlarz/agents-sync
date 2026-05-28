import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { runInstallHook, runUninstallHook } from "../../src/tools/install-hook.js";
import { createTempProject } from "./helpers/temp.js";

async function makeGitRepo(files: Record<string, string> = {}): Promise<string> {
  const dir = await createTempProject(files);
  await fs.mkdir(path.join(dir, ".git", "hooks"), { recursive: true });
  return dir;
}

describe("runInstallHook — git (plain)", () => {
  it("creates .git/hooks/pre-commit when none exists", async () => {
    const dir = await makeGitRepo();
    // sessionHook: false isolates pre-commit behavior in this test
    const result = await runInstallHook({ projectPath: dir, manager: "git", sessionHook: false });

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

    const result = await runInstallHook({ projectPath: dir, manager: "git", sessionHook: false });

    expect(result.alreadyInstalled).toBe(false);
    const content = await fs.readFile(hookFile, "utf-8");
    expect(content).toContain("npm test");
    expect(content).toContain("agents-sync drift");
  });

  it("detects already-installed hook and returns alreadyInstalled=true", async () => {
    const dir = await makeGitRepo();
    const hookFile = path.join(dir, ".git", "hooks", "pre-commit");
    await fs.writeFile(hookFile, "#!/usr/bin/env sh\n# BEGIN agents-sync\nnpx @googlarz/agents-sync drift . --ci\n# END agents-sync\n", "utf-8");

    const result = await runInstallHook({ projectPath: dir, manager: "git", sessionHook: false });

    expect(result.alreadyInstalled).toBe(true);
    expect(result.filesWritten).toHaveLength(0);
  });

  it("dry-run does not write files", async () => {
    const dir = await makeGitRepo();
    const result = await runInstallHook({ projectPath: dir, manager: "git", dryRun: true, sessionHook: false });

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

  it("husky v9 — omits _/husky.sh sourcing line when file is absent", async () => {
    const dir = await createTempProject({});
    await fs.mkdir(path.join(dir, ".husky"), { recursive: true });
    // v9: no _/husky.sh file

    await runInstallHook({ projectPath: dir, manager: "husky" });
    const content = await fs.readFile(path.join(dir, ".husky", "pre-commit"), "utf-8");
    expect(content).not.toContain("husky.sh");
  });

  it("husky v8 — includes _/husky.sh sourcing line when file exists", async () => {
    const dir = await createTempProject({});
    await fs.mkdir(path.join(dir, ".husky", "_"), { recursive: true });
    await fs.writeFile(path.join(dir, ".husky", "_", "husky.sh"), "# husky v8\n");

    await runInstallHook({ projectPath: dir, manager: "husky" });
    const content = await fs.readFile(path.join(dir, ".husky", "pre-commit"), "utf-8");
    expect(content).toContain("husky.sh");
  });

  it("husky hook includes failure message and exit 1 on drift failure", async () => {
    const dir = await createTempProject({});
    await fs.mkdir(path.join(dir, ".husky"), { recursive: true });

    await runInstallHook({ projectPath: dir, manager: "husky" });
    const content = await fs.readFile(path.join(dir, ".husky", "pre-commit"), "utf-8");
    expect(content).toContain("exit 1");
    expect(content).toContain("out of sync");
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

  it("appends to existing lefthook.yml (no dot-prefix) instead of creating .lefthook.yml", async () => {
    const dir = await createTempProject({
      "lefthook.yml": "pre-push:\n  commands:\n    tests:\n      run: npm test\n",
    });
    await runInstallHook({ projectPath: dir, manager: "lefthook" });

    // Should write to the existing lefthook.yml, not create a new .lefthook.yml
    const targetContent = await fs.readFile(path.join(dir, "lefthook.yml"), "utf-8");
    expect(targetContent).toContain("agents-sync drift");

    // The dot-prefix file should NOT have been created
    await expect(fs.access(path.join(dir, ".lefthook.yml"))).rejects.toThrow();
  });

  it("lefthook config includes glob filter for relevant files", async () => {
    const dir = await createTempProject({});
    await runInstallHook({ projectPath: dir, manager: "lefthook" });
    const content = await fs.readFile(path.join(dir, ".lefthook.yml"), "utf-8");
    expect(content).toContain("glob");
    expect(content).toContain("package.json");
    expect(content).toContain("AGENTS.md");
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

describe("runInstallHook — SessionStart hook", () => {
  it("creates .claude/settings.json with SessionStart hook", async () => {
    const dir = await makeGitRepo();
    const result = await runInstallHook({ projectPath: dir, manager: "git", sessionHook: true });

    expect(result.sessionHookInstalled).toBe(true);
    expect(result.sessionHookAlreadyInstalled).toBe(false);

    const settingsFile = path.join(dir, ".claude", "settings.json");
    const raw = await fs.readFile(settingsFile, "utf-8");
    const settings = JSON.parse(raw) as { hooks: { SessionStart: unknown[] } };
    expect(settings.hooks.SessionStart).toHaveLength(1);
    expect(JSON.stringify(settings.hooks.SessionStart)).toContain("agents-sync");
    expect(JSON.stringify(settings.hooks.SessionStart)).toContain("AGENTS.md");
  });

  it("merges into existing settings.json without overwriting other keys", async () => {
    const dir = await makeGitRepo();
    await fs.mkdir(path.join(dir, ".claude"), { recursive: true });
    await fs.writeFile(
      path.join(dir, ".claude", "settings.json"),
      JSON.stringify({ model: "claude-opus-4-5", permissions: { allow: [] } }, null, 2) + "\n",
      "utf-8",
    );

    await runInstallHook({ projectPath: dir, manager: "git", sessionHook: true });

    const raw = await fs.readFile(path.join(dir, ".claude", "settings.json"), "utf-8");
    const settings = JSON.parse(raw) as Record<string, unknown>;
    expect(settings.model).toBe("claude-opus-4-5");
    expect((settings.hooks as Record<string, unknown>).SessionStart).toBeTruthy();
  });

  it("detects already-installed session hook and sets sessionHookAlreadyInstalled=true", async () => {
    const dir = await makeGitRepo();
    await fs.mkdir(path.join(dir, ".claude"), { recursive: true });
    const existingSettings = {
      hooks: {
        SessionStart: [{ matcher: "", hooks: [{ type: "command", command: "bash -c '...agents-sync...'"}] }],
      },
    };
    await fs.writeFile(path.join(dir, ".claude", "settings.json"), JSON.stringify(existingSettings, null, 2) + "\n");

    const result = await runInstallHook({ projectPath: dir, manager: "git", sessionHook: true });
    expect(result.sessionHookAlreadyInstalled).toBe(true);
    expect(result.sessionHookInstalled).toBe(false);
  });

  it("dry-run does not write .claude/settings.json", async () => {
    const dir = await makeGitRepo();
    await runInstallHook({ projectPath: dir, manager: "git", dryRun: true, sessionHook: true });

    const settingsFile = path.join(dir, ".claude", "settings.json");
    await expect(fs.access(settingsFile)).rejects.toThrow();
  });

  it("sessionHook: false skips session hook installation", async () => {
    const dir = await makeGitRepo();
    const result = await runInstallHook({ projectPath: dir, manager: "git", sessionHook: false });

    expect(result.sessionHookInstalled).toBe(false);
    expect(result.sessionHookAlreadyInstalled).toBe(false);

    const settingsFile = path.join(dir, ".claude", "settings.json");
    await expect(fs.access(settingsFile)).rejects.toThrow();
  });

  it("runUninstallHook removes session hook entry from settings.json", async () => {
    const dir = await makeGitRepo();
    // Install first
    await runInstallHook({ projectPath: dir, manager: "git" });
    // Verify it was written
    const settingsFile = path.join(dir, ".claude", "settings.json");
    await expect(fs.access(settingsFile)).resolves.toBeUndefined();

    // Uninstall
    const result = await runUninstallHook({ projectPath: dir, manager: "git" });
    expect(result.sessionHookRemoved).toBe(true);

    // Settings file should have no SessionStart hook
    const raw = await fs.readFile(settingsFile, "utf-8");
    const settings = JSON.parse(raw) as Record<string, unknown>;
    expect(settings.hooks).toBeUndefined();
  });

  it("runUninstallHook leaves other SessionStart hooks intact", async () => {
    const dir = await makeGitRepo();
    await fs.mkdir(path.join(dir, ".claude"), { recursive: true });
    const existingSettings = {
      hooks: {
        SessionStart: [
          { matcher: "", hooks: [{ type: "command", command: "echo hello" }] },
          { matcher: "", hooks: [{ type: "command", command: "bash -c '...agents-sync...'"}] },
        ],
      },
    };
    await fs.writeFile(path.join(dir, ".claude", "settings.json"), JSON.stringify(existingSettings, null, 2) + "\n");

    await runUninstallHook({ projectPath: dir, manager: "git" });

    const raw = await fs.readFile(path.join(dir, ".claude", "settings.json"), "utf-8");
    const settings = JSON.parse(raw) as { hooks: { SessionStart: unknown[] } };
    expect(settings.hooks.SessionStart).toHaveLength(1);
    expect(JSON.stringify(settings.hooks.SessionStart)).toContain("echo hello");
    expect(JSON.stringify(settings.hooks.SessionStart)).not.toContain("agents-sync");
  });
});
