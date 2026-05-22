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

// Files whose changes are relevant to drift — manifest files and all managed context files.
// The hook skips the drift check when none of these are staged, avoiding overhead on
// routine commits (e.g. editing a single source file).
const RELEVANT_FILES_PATTERN =
  "(package\\.json|pyproject\\.toml|Cargo\\.toml|go\\.mod|pom\\.xml|build\\.gradle|Gemfile|composer\\.json" +
  "|AGENTS\\.md|CLAUDE\\.md|\\.cursorrules|GEMINI\\.md|\\.windsurfrules|\\.clinerules|\\.roomodes|CONVENTIONS\\.md)";

const RELEVANT_FILES_GLOB =
  "{package.json,pyproject.toml,Cargo.toml,go.mod,pom.xml,build.gradle,Gemfile,composer.json" +
  ",AGENTS.md,CLAUDE.md,.cursorrules,GEMINI.md,.windsurfrules,.clinerules,.roomodes,CONVENTIONS.md}";

const SENTINEL_BEGIN = "# BEGIN agents-sync";
const SENTINEL_END = "# END agents-sync";

function wrapWithSentinels(lines: string): string {
  return `${SENTINEL_BEGIN}\n${lines}\n${SENTINEL_END}`;
}

function removeSentinelBlock(content: string): { found: boolean; cleaned: string } {
  const beginIdx = content.indexOf(SENTINEL_BEGIN);
  const endIdx = content.indexOf(SENTINEL_END);
  if (beginIdx === -1 || endIdx === -1 || endIdx < beginIdx) {
    return { found: false, cleaned: content };
  }
  const before = content.slice(0, beginIdx);
  const after = content.slice(endIdx + SENTINEL_END.length);
  const cleaned = (before + after).replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
  return { found: true, cleaned };
}

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

  const driftBlock = [
    `if git diff --cached --name-only | grep -qE '${RELEVANT_FILES_PATTERN}'; then`,
    `  ${DRIFT_COMMAND}`,
    `fi`,
  ].join("\n");
  const block = wrapWithSentinels(driftBlock);

  if (await fileExists(hookFile)) {
    const existing = await fs.readFile(hookFile, "utf8");
    if (existing.includes("agents-sync")) {
      return { files: [], alreadyInstalled: true };
    }
    if (!dryRun) {
      await fs.appendFile(hookFile, `\n\n${block}\n`);
    }
    return { files: [hookFile], alreadyInstalled: false };
  }

  if (!dryRun) {
    await fs.mkdir(huskyDir, { recursive: true });
    await fs.writeFile(hookFile, `#!/usr/bin/env sh\n. "$(dirname -- "$0")/_/husky.sh"\n\n${block}\n`);
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
    `      glob: "${RELEVANT_FILES_GLOB}"`,
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

  const driftBlock = [
    `if git diff --cached --name-only | grep -qE '${RELEVANT_FILES_PATTERN}'; then`,
    `  ${DRIFT_COMMAND}`,
    `  if [ $? -ne 0 ]; then`,
    `    echo "${FAIL_MESSAGE}"`,
    `    exit 1`,
    `  fi`,
    `fi`,
  ].join("\n");
  const block = wrapWithSentinels(driftBlock);

  if (await fileExists(hookFile)) {
    const existing = await fs.readFile(hookFile, "utf8");
    if (existing.includes("agents-sync")) {
      return { files: [], alreadyInstalled: true };
    }
    if (!dryRun) {
      await fs.appendFile(hookFile, `\n\n${block}\n`);
    }
    return { files: [hookFile], alreadyInstalled: false };
  }

  if (!dryRun) {
    await fs.mkdir(hooksDir, { recursive: true });
    await fs.writeFile(hookFile, `#!/usr/bin/env sh\n\n${block}\n`);
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

  // Prefer sentinel-block removal (safe for shell files with unrelated content)
  const { found, cleaned: sentinelCleaned } = removeSentinelBlock(content);
  if (found) {
    if (!dryRun) await fs.writeFile(filePath, sentinelCleaned, "utf-8");
    return true;
  }

  // Fallback: line-based filter for older installs and lefthook YAML
  // (lefthook key names contain "agents-sync" uniquely, so this is safe)
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
