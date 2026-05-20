/**
 * agents-sync install-hook
 *
 * Detects the project's git hook manager (husky, lefthook, or plain git hooks)
 * and installs a pre-commit hook that runs `agents-sync drift . --ci`.
 * Blocks commits when AI context files have drifted from AGENTS.md.
 */
import path from "node:path";
import fs from "node:fs/promises";
import { assertProjectDir, fileExists } from "../lib/file-utils.js";

export type HookManager = "husky" | "lefthook" | "git";

export interface InstallHookOptions {
  projectPath: string;
  manager?: HookManager;
  dryRun?: boolean;
}

export interface InstallHookResult {
  manager: HookManager;
  filesWritten: string[];
  alreadyInstalled: boolean;
  dryRun: boolean;
  report: string;
}

const DRIFT_COMMAND = "npx @googlarz/agents-sync drift . --ci";
const FAIL_MESSAGE = "AI context files are out of sync. Run: npx @googlarz/agents-sync sync .";

async function detectManager(projectPath: string): Promise<HookManager> {
  // Check for husky
  const huskyDir = path.join(projectPath, ".husky");
  if (await fileExists(huskyDir)) return "husky";

  // Check package.json for husky or lefthook
  const pkgPath = path.join(projectPath, "package.json");
  if (await fileExists(pkgPath)) {
    try {
      const pkg = JSON.parse(await fs.readFile(pkgPath, "utf8"));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (allDeps["husky"]) return "husky";
      if (allDeps["lefthook"] || allDeps["@arkweid/lefthook"]) return "lefthook";
    } catch {
      // ignore parse errors
    }
  }

  // Check for lefthook config
  const lefthookFiles = [".lefthook.yml", "lefthook.yml", ".lefthook.yaml", "lefthook.yaml"];
  for (const f of lefthookFiles) {
    if (await fileExists(path.join(projectPath, f))) return "lefthook";
  }

  return "git";
}

async function installHusky(projectPath: string, dryRun: boolean): Promise<{ files: string[]; alreadyInstalled: boolean }> {
  const huskyDir = path.join(projectPath, ".husky");
  const hookFile = path.join(huskyDir, "pre-commit");

  const hookContent = `${DRIFT_COMMAND}\n`;

  if (await fileExists(hookFile)) {
    const existing = await fs.readFile(hookFile, "utf8");
    if (existing.includes("agents-sync")) {
      return { files: [], alreadyInstalled: true };
    }
    // Append to existing hook
    if (!dryRun) {
      await fs.appendFile(hookFile, `\n${hookContent}`);
    }
    return { files: [hookFile], alreadyInstalled: false };
  }

  if (!dryRun) {
    await fs.mkdir(huskyDir, { recursive: true });
    await fs.writeFile(hookFile, `#!/usr/bin/env sh\n. "$(dirname -- "$0")/_/husky.sh"\n\n${hookContent}`);
    await fs.chmod(hookFile, 0o755);
  }
  return { files: [hookFile], alreadyInstalled: false };
}

async function installLefthook(projectPath: string, dryRun: boolean): Promise<{ files: string[]; alreadyInstalled: boolean }> {
  const configFile = path.join(projectPath, ".lefthook.yml");

  const newBlock = [
    "pre-commit:",
    "  commands:",
    "    agents-sync:",
    `      run: ${DRIFT_COMMAND}`,
    `      fail_text: "${FAIL_MESSAGE}"`,
    "",
  ].join("\n");

  if (await fileExists(configFile)) {
    const existing = await fs.readFile(configFile, "utf8");
    if (existing.includes("agents-sync")) {
      return { files: [], alreadyInstalled: true };
    }
    if (!dryRun) {
      await fs.appendFile(configFile, `\n${newBlock}`);
    }
    return { files: [configFile], alreadyInstalled: false };
  }

  if (!dryRun) {
    await fs.writeFile(configFile, newBlock);
  }
  return { files: [configFile], alreadyInstalled: false };
}

async function installGitHook(projectPath: string, dryRun: boolean): Promise<{ files: string[]; alreadyInstalled: boolean }> {
  const gitDir = path.join(projectPath, ".git");
  if (!(await fileExists(gitDir))) {
    throw new Error("No .git directory found. Run this command from a git repository root.");
  }

  const hooksDir = path.join(gitDir, "hooks");
  const hookFile = path.join(hooksDir, "pre-commit");

  const hookContent = [
    "#!/usr/bin/env sh",
    `${DRIFT_COMMAND}`,
    `if [ $? -ne 0 ]; then`,
    `  echo "${FAIL_MESSAGE}"`,
    `  exit 1`,
    `fi`,
    "",
  ].join("\n");

  if (await fileExists(hookFile)) {
    const existing = await fs.readFile(hookFile, "utf8");
    if (existing.includes("agents-sync")) {
      return { files: [], alreadyInstalled: true };
    }
    if (!dryRun) {
      await fs.appendFile(hookFile, `\n${DRIFT_COMMAND}\n`);
    }
    return { files: [hookFile], alreadyInstalled: false };
  }

  if (!dryRun) {
    await fs.mkdir(hooksDir, { recursive: true });
    await fs.writeFile(hookFile, hookContent);
    await fs.chmod(hookFile, 0o755);
  }
  return { files: [hookFile], alreadyInstalled: false };
}

export interface UninstallHookOptions {
  projectPath: string;
  manager?: HookManager;
  dryRun?: boolean;
}

export interface UninstallHookResult {
  manager: HookManager;
  filesModified: string[];
  notInstalled: boolean;
  dryRun: boolean;
  report: string;
}

async function removeAgentsSyncFromFile(filePath: string, dryRun: boolean): Promise<boolean> {
  const content = await fs.readFile(filePath, "utf-8").catch(() => null);
  if (!content || !content.includes("agents-sync")) return false;

  const lines = content.split("\n");
  const filtered = lines.filter((l) => !l.includes("agents-sync") && !l.includes(FAIL_MESSAGE));
  const cleaned = filtered.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";

  if (!dryRun) await fs.writeFile(filePath, cleaned, "utf-8");
  return true;
}

export async function runUninstallHook(options: UninstallHookOptions): Promise<UninstallHookResult> {
  const { projectPath, dryRun = false } = options;
  await assertProjectDir(projectPath);

  const manager = options.manager ?? (await detectManager(projectPath));
  const filesModified: string[] = [];

  if (manager === "husky") {
    const hookFile = path.join(projectPath, ".husky", "pre-commit");
    if (await removeAgentsSyncFromFile(hookFile, dryRun)) filesModified.push(hookFile);
  } else if (manager === "lefthook") {
    for (const f of [".lefthook.yml", "lefthook.yml", ".lefthook.yaml", "lefthook.yaml"]) {
      const p = path.join(projectPath, f);
      if (await removeAgentsSyncFromFile(p, dryRun)) { filesModified.push(p); break; }
    }
  } else {
    const hookFile = path.join(projectPath, ".git", "hooks", "pre-commit");
    if (await removeAgentsSyncFromFile(hookFile, dryRun)) filesModified.push(hookFile);
  }

  const notInstalled = filesModified.length === 0;
  const lines: string[] = [];

  if (notInstalled) {
    lines.push("agents-sync hook not found — nothing to remove.");
  } else if (dryRun) {
    lines.push(`DRY RUN — would remove agents-sync from:`);
    for (const f of filesModified) lines.push(`  → ${f}`);
  } else {
    lines.push(`✓ Removed agents-sync pre-commit hook (${manager})`);
    for (const f of filesModified) lines.push(`  → ${f}`);
  }

  return { manager, filesModified, notInstalled, dryRun, report: lines.join("\n") };
}

export async function runInstallHook(options: InstallHookOptions): Promise<InstallHookResult> {
  const { projectPath, dryRun = false } = options;
  await assertProjectDir(projectPath);

  const manager = options.manager ?? (await detectManager(projectPath));

  let files: string[];
  let alreadyInstalled: boolean;

  if (manager === "husky") {
    ({ files, alreadyInstalled } = await installHusky(projectPath, dryRun));
  } else if (manager === "lefthook") {
    ({ files, alreadyInstalled } = await installLefthook(projectPath, dryRun));
  } else {
    ({ files, alreadyInstalled } = await installGitHook(projectPath, dryRun));
  }

  const lines: string[] = [];

  if (alreadyInstalled) {
    lines.push("✓ agents-sync hook already installed — nothing to do.");
  } else if (dryRun) {
    lines.push(`DRY RUN — detected manager: ${manager}`);
    for (const f of files) lines.push(`→ Would write: ${f}`);
  } else {
    lines.push(`✓ Installed pre-commit hook (${manager})`);
    for (const f of files) lines.push(`  → ${f}`);
    lines.push("");

    if (manager === "git") {
      lines.push("  ⚠ Git hook is local only — teammates need to run install-hook too.");
      lines.push("  → For shared hooks, add husky or lefthook to your project.");
    } else {
      lines.push("  Commit .lefthook.yml (or .husky/pre-commit) so teammates get the hook too.");
    }

    lines.push("");
    lines.push("Every commit now checks: agents-sync drift . --ci");
    lines.push("If drift is HIGH, the commit is blocked with instructions to sync.");
  }

  return {
    manager,
    filesWritten: files,
    alreadyInstalled,
    dryRun,
    report: lines.join("\n"),
  };
}
