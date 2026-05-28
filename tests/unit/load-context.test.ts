import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { runLoadContext, runUnloadContext } from "../../src/tools/load-context.js";
import { createTempProject } from "./helpers/temp.js";

describe("runLoadContext", () => {
  it("creates .claude/settings.json with SessionStart hook", async () => {
    const dir = await createTempProject({ "AGENTS.md": "# AGENTS.md\n\n## Commands\nnpm test\n" });
    const result = await runLoadContext({ projectPath: dir });

    expect(result.installed).toBe(true);
    expect(result.agentsMdFound).toBe(true);

    const raw = await fs.readFile(path.join(dir, ".claude", "settings.json"), "utf-8");
    const settings = JSON.parse(raw) as { hooks: { SessionStart: unknown[] } };
    expect(settings.hooks.SessionStart).toHaveLength(1);
    expect(JSON.stringify(settings.hooks.SessionStart)).toContain("AGENTS.md");
    expect(JSON.stringify(settings.hooks.SessionStart)).toContain("agents-sync");
  });

  it("reports agentsMdFound=false but still installs when AGENTS.md is absent", async () => {
    const dir = await createTempProject({});
    const result = await runLoadContext({ projectPath: dir });

    expect(result.agentsMdFound).toBe(false);
    expect(result.installed).toBe(true);
    expect(result.report).toContain("No AGENTS.md found");
  });

  it("detects already-installed hook and returns alreadyInstalled=true", async () => {
    const dir = await createTempProject({ "AGENTS.md": "# AGENTS.md\n" });
    await runLoadContext({ projectPath: dir });
    const result = await runLoadContext({ projectPath: dir });

    expect(result.alreadyInstalled).toBe(true);
    expect(result.installed).toBe(false);
  });

  it("dry-run does not write .claude/settings.json", async () => {
    const dir = await createTempProject({ "AGENTS.md": "# AGENTS.md\n" });
    await runLoadContext({ projectPath: dir, dryRun: true });

    await expect(fs.access(path.join(dir, ".claude", "settings.json"))).rejects.toThrow();
  });

  it("antiCompaction installs PreToolUse hook in addition to SessionStart", async () => {
    const dir = await createTempProject({ "AGENTS.md": "# AGENTS.md\n" });
    await runLoadContext({ projectPath: dir, antiCompaction: true });

    const raw = await fs.readFile(path.join(dir, ".claude", "settings.json"), "utf-8");
    const settings = JSON.parse(raw) as { hooks: { SessionStart: unknown[]; PreToolUse: unknown[] } };
    expect(settings.hooks.SessionStart).toHaveLength(1);
    expect(settings.hooks.PreToolUse).toHaveLength(1);
    expect(JSON.stringify(settings.hooks.PreToolUse)).toContain("agents-sync-anti-compaction");
  });
});

describe("runUnloadContext", () => {
  it("removes SessionStart hook and reports nothing-to-remove when not installed", async () => {
    const dir = await createTempProject({});
    const result = await runUnloadContext({ projectPath: dir });
    expect(result.report).toContain("nothing to remove");
  });

  it("removes SessionStart hook installed by runLoadContext", async () => {
    const dir = await createTempProject({ "AGENTS.md": "# AGENTS.md\n" });
    await runLoadContext({ projectPath: dir });

    const result = await runUnloadContext({ projectPath: dir });
    expect(result.report).toContain("Removed SessionStart hook");

    const raw = await fs.readFile(path.join(dir, ".claude", "settings.json"), "utf-8");
    const settings = JSON.parse(raw) as Record<string, unknown>;
    expect(settings.hooks).toBeUndefined();
  });

  it("also removes PreToolUse hook when anti-compaction was installed", async () => {
    const dir = await createTempProject({ "AGENTS.md": "# AGENTS.md\n" });
    await runLoadContext({ projectPath: dir, antiCompaction: true });
    await runUnloadContext({ projectPath: dir });

    const raw = await fs.readFile(path.join(dir, ".claude", "settings.json"), "utf-8");
    const settings = JSON.parse(raw) as Record<string, unknown>;
    expect(settings.hooks).toBeUndefined();
  });

  it("also removes lazy hook when lazy was installed", async () => {
    const dir = await createTempProject({ "AGENTS.md": "# AGENTS.md\n" });
    await runLoadContext({ projectPath: dir, lazy: true });
    await runUnloadContext({ projectPath: dir });

    const raw = await fs.readFile(path.join(dir, ".claude", "settings.json"), "utf-8");
    const settings = JSON.parse(raw) as Record<string, unknown>;
    expect(settings.hooks).toBeUndefined();
  });
});

describe("runLoadContext — lazy flag", () => {
  it("installs a second SessionStart entry with the lazy instruction", async () => {
    const dir = await createTempProject({ "AGENTS.md": "# AGENTS.md\n" });
    await runLoadContext({ projectPath: dir, lazy: true });

    const raw = await fs.readFile(path.join(dir, ".claude", "settings.json"), "utf-8");
    const settings = JSON.parse(raw) as { hooks: { SessionStart: unknown[] } };
    // both the file-loading hook and the lazy instruction hook
    expect(settings.hooks.SessionStart).toHaveLength(2);
    expect(JSON.stringify(settings.hooks.SessionStart)).toContain("agents-sync-lazy");
  });

  it("lazy is idempotent — second call does not add a duplicate entry", async () => {
    const dir = await createTempProject({ "AGENTS.md": "# AGENTS.md\n" });
    await runLoadContext({ projectPath: dir, lazy: true });
    await runLoadContext({ projectPath: dir, lazy: true });

    const raw = await fs.readFile(path.join(dir, ".claude", "settings.json"), "utf-8");
    const settings = JSON.parse(raw) as { hooks: { SessionStart: unknown[] } };
    const lazyCopies = settings.hooks.SessionStart.filter((e) =>
      JSON.stringify(e).includes("agents-sync-lazy"),
    );
    expect(lazyCopies).toHaveLength(1);
  });
});
