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
  /**
   * Also install a Claude Code SessionStart hook in `.claude/settings.json`
   * that auto-loads AGENTS.md as context at the start of every session.
   * @default true
   */
  sessionHook?: boolean;
  /**
   * Also install a PreToolUse hook that re-injects AGENTS.md on every tool
   * call, protecting against context compaction dropping AGENTS.md content.
   * Only needed for users who rely solely on the SessionStart hook (no CLAUDE.md).
   * @default false
   */
  antiCompaction?: boolean;
  /**
   * Install a SessionStart instruction that tells Claude to check for AGENTS.md
   * in subdirectories it enters during the session.  Useful in monorepos where
   * each package has its own AGENTS.md below the project root.
   * @default false
   */
  lazy?: boolean;
}

export interface InstallHookResult {
  manager: HookManager;
  filesWritten: string[];
  alreadyInstalled: boolean;
  sessionHookInstalled: boolean;
  sessionHookAlreadyInstalled: boolean;
  antiCompactionInstalled: boolean;
  lazyInstalled: boolean;
  lazyAlreadyInstalled: boolean;
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

  // Husky v9 removed _/husky.sh — only include the sourcing line for v8
  const huskyShFile = path.join(huskyDir, "_", "husky.sh");
  const isV8 = await fileExists(huskyShFile);
  const header = isV8
    ? `#!/usr/bin/env sh\n. "$(dirname -- "$0")/_/husky.sh"\n`
    : `#!/usr/bin/env sh\n`;

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
    await fs.mkdir(huskyDir, { recursive: true });
    await fs.writeFile(hookFile, `${header}\n${block}\n`);
    await fs.chmod(hookFile, 0o755);
  }
  return { files: [hookFile], alreadyInstalled: false };
}

async function findLefthookConfig(projectPath: string): Promise<string> {
  const candidates = [".lefthook.yml", "lefthook.yml", ".lefthook.yaml", "lefthook.yaml"];
  for (const f of candidates) {
    if (await fileExists(path.join(projectPath, f))) return path.join(projectPath, f);
  }
  return path.join(projectPath, ".lefthook.yml");
}

async function installLefthook(projectPath: string, dryRun: boolean): Promise<{ files: string[]; alreadyInstalled: boolean }> {
  const configFile = await findLefthookConfig(projectPath);

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

// ---------------------------------------------------------------------------
// Claude Code SessionStart hook — loads AGENTS.md as context automatically
// ---------------------------------------------------------------------------

/**
 * Shell command injected into .claude/settings.json SessionStart hook.
 *
 * Monorepo-aware: walks from cwd up to git root, collecting every AGENTS.md
 * found along the path (root first, leaf last) and cats them all.  Works
 * correctly when Claude Code is opened in a subdirectory.
 *
 * The trailing "# agents-sync" comment is the idempotency marker used by
 * install/uninstall detection.
 */
const SESSION_HOOK_COMMAND =
  `bash -c '` +
  `r=$(git -C "$(pwd)" rev-parse --show-toplevel 2>/dev/null||pwd);` +
  `d=$(pwd);f="";` +
  `while true;do ` +
  `[ -f "$d/AGENTS.md" ]&&f="$d/AGENTS.md $f";` +
  `[ "$d" = "$r" ]&&break;` +
  `p=$(dirname "$d");[ "$p" = "$d" ]&&break;d=$p;` +
  `done;` +
  `for x in $f;do cat "$x";echo;done` +
  `' # agents-sync`;

export async function installSessionStartHook(
  projectPath: string,
  dryRun: boolean,
): Promise<{ file: string; alreadyInstalled: boolean }> {
  const clauDir = path.join(projectPath, ".claude");
  const settingsFile = path.join(clauDir, "settings.json");

  // Load existing settings (best-effort)
  let settings: Record<string, unknown> = {};
  if (await fileExists(settingsFile)) {
    try {
      settings = JSON.parse(await fs.readFile(settingsFile, "utf8")) as Record<string, unknown>;
    } catch {
      // ignore; we'll merge our addition in
    }
  }

  const hooks = (settings.hooks ?? {}) as Record<string, unknown>;
  const sessionStart = (hooks.SessionStart ?? []) as unknown[];

  // Already installed?
  if (JSON.stringify(sessionStart).includes("agents-sync")) {
    return { file: settingsFile, alreadyInstalled: true };
  }

  const entry = {
    matcher: "",
    hooks: [{ type: "command", command: SESSION_HOOK_COMMAND }],
  };

  const updated: Record<string, unknown> = {
    ...settings,
    hooks: {
      ...hooks,
      SessionStart: [...sessionStart, entry],
    },
  };

  if (!dryRun) {
    await fs.mkdir(clauDir, { recursive: true });
    await fs.writeFile(settingsFile, JSON.stringify(updated, null, 2) + "\n", "utf8");
  }

  return { file: settingsFile, alreadyInstalled: false };
}

export async function removeSessionStartHook(
  projectPath: string,
  dryRun: boolean,
): Promise<{ file: string; found: boolean }> {
  const settingsFile = path.join(projectPath, ".claude", "settings.json");

  if (!(await fileExists(settingsFile))) return { file: settingsFile, found: false };

  let settings: Record<string, unknown>;
  try {
    settings = JSON.parse(await fs.readFile(settingsFile, "utf8")) as Record<string, unknown>;
  } catch {
    return { file: settingsFile, found: false };
  }

  const hooks = (settings.hooks ?? {}) as Record<string, unknown>;
  const sessionStart = (hooks.SessionStart ?? []) as unknown[];
  const filtered = sessionStart.filter((e) => !JSON.stringify(e).includes("agents-sync"));

  if (filtered.length === sessionStart.length) return { file: settingsFile, found: false };

  const updatedHooks = { ...hooks };
  if (filtered.length > 0) {
    updatedHooks.SessionStart = filtered;
  } else {
    delete updatedHooks.SessionStart;
  }

  const updated: Record<string, unknown> = { ...settings };
  if (Object.keys(updatedHooks).length > 0) {
    updated.hooks = updatedHooks;
  } else {
    delete updated.hooks;
  }

  if (!dryRun) {
    await fs.writeFile(settingsFile, JSON.stringify(updated, null, 2) + "\n", "utf8");
  }

  return { file: settingsFile, found: true };
}

/**
 * Lazy loading: inject an instruction at session start that tells Claude to
 * proactively read AGENTS.md in subdirectories it enters.  This covers the
 * monorepo case where each package has its own AGENTS.md below the project
 * root — files that the upward-walk in SESSION_HOOK_COMMAND never reaches.
 *
 * Uses an instruction rather than a shell script because hooks can't do
 * runtime-conditional injection based on which files Claude later touches.
 * Claude reads the instruction from the system-reminder and fetches the
 * relevant AGENTS.md on demand using its Read tool.
 *
 * Identified by "# agents-sync-lazy" comment for idempotency.
 */
const LAZY_HOOK_COMMAND =
  `echo 'agents-sync: lazy AGENTS.md loading is enabled for this session. ` +
  `When you start working in a subdirectory that you have not visited yet, ` +
  `check whether it contains an AGENTS.md file. ` +
  `If it does, read it before making changes — it may contain package-specific ` +
  `commands, architecture notes, or rules that add to or override the root AGENTS.md.' ` +
  `# agents-sync-lazy`;

export async function installLazyHook(
  projectPath: string,
  dryRun: boolean,
): Promise<{ file: string; alreadyInstalled: boolean }> {
  const clauDir = path.join(projectPath, ".claude");
  const settingsFile = path.join(clauDir, "settings.json");

  let settings: Record<string, unknown> = {};
  if (await fileExists(settingsFile)) {
    try {
      settings = JSON.parse(await fs.readFile(settingsFile, "utf8")) as Record<string, unknown>;
    } catch { /* ignore */ }
  }

  const hooks = (settings.hooks ?? {}) as Record<string, unknown>;
  const sessionStart = (hooks.SessionStart ?? []) as unknown[];

  if (JSON.stringify(sessionStart).includes("agents-sync-lazy")) {
    return { file: settingsFile, alreadyInstalled: true };
  }

  const entry = {
    matcher: "",
    hooks: [{ type: "command", command: LAZY_HOOK_COMMAND }],
  };

  const updated: Record<string, unknown> = {
    ...settings,
    hooks: { ...hooks, SessionStart: [...sessionStart, entry] },
  };

  if (!dryRun) {
    await fs.mkdir(clauDir, { recursive: true });
    await fs.writeFile(settingsFile, JSON.stringify(updated, null, 2) + "\n", "utf8");
  }

  return { file: settingsFile, alreadyInstalled: false };
}

export async function removeLazyHook(
  projectPath: string,
  dryRun: boolean,
): Promise<{ file: string; found: boolean }> {
  const settingsFile = path.join(projectPath, ".claude", "settings.json");
  if (!(await fileExists(settingsFile))) return { file: settingsFile, found: false };

  let settings: Record<string, unknown>;
  try {
    settings = JSON.parse(await fs.readFile(settingsFile, "utf8")) as Record<string, unknown>;
  } catch {
    return { file: settingsFile, found: false };
  }

  const hooks = (settings.hooks ?? {}) as Record<string, unknown>;
  const sessionStart = (hooks.SessionStart ?? []) as unknown[];
  const filtered = sessionStart.filter((e) => !JSON.stringify(e).includes("agents-sync-lazy"));

  if (filtered.length === sessionStart.length) return { file: settingsFile, found: false };

  const updatedHooks = { ...hooks };
  if (filtered.length > 0) {
    updatedHooks.SessionStart = filtered;
  } else {
    delete updatedHooks.SessionStart;
  }

  const updated: Record<string, unknown> = { ...settings };
  if (Object.keys(updatedHooks).length > 0) {
    updated.hooks = updatedHooks;
  } else {
    delete updated.hooks;
  }

  if (!dryRun) {
    await fs.writeFile(settingsFile, JSON.stringify(updated, null, 2) + "\n", "utf8");
  }

  return { file: settingsFile, found: true };
}

/**
 * Anti-compaction: install a PreToolUse hook that re-injects AGENTS.md on
 * every tool call.  Protects users who rely solely on the SessionStart hook
 * (no CLAUDE.md) and whose context gets compacted mid-session.
 *
 * Intentionally kept simple — no rate-limiting, just cats the file every time.
 * Claude Code deduplicates system-reminder content internally.
 *
 * Identified by "# agents-sync-anti-compaction" comment for idempotency.
 */
const PRE_TOOL_USE_COMMAND =
  `bash -c '` +
  `r=$(git -C "$(pwd)" rev-parse --show-toplevel 2>/dev/null||pwd);` +
  `d=$(pwd);f="";` +
  `while true;do ` +
  `[ -f "$d/AGENTS.md" ]&&f="$d/AGENTS.md $f";` +
  `[ "$d" = "$r" ]&&break;` +
  `p=$(dirname "$d");[ "$p" = "$d" ]&&break;d=$p;` +
  `done;` +
  `for x in $f;do cat "$x";echo;done` +
  `' # agents-sync-anti-compaction`;

export async function installPreToolUseHook(
  projectPath: string,
  dryRun: boolean,
): Promise<{ file: string; alreadyInstalled: boolean }> {
  const clauDir = path.join(projectPath, ".claude");
  const settingsFile = path.join(clauDir, "settings.json");

  let settings: Record<string, unknown> = {};
  if (await fileExists(settingsFile)) {
    try {
      settings = JSON.parse(await fs.readFile(settingsFile, "utf8")) as Record<string, unknown>;
    } catch { /* ignore */ }
  }

  const hooks = (settings.hooks ?? {}) as Record<string, unknown>;
  const preToolUse = (hooks.PreToolUse ?? []) as unknown[];

  if (JSON.stringify(preToolUse).includes("agents-sync-anti-compaction")) {
    return { file: settingsFile, alreadyInstalled: true };
  }

  const entry = {
    matcher: "",
    hooks: [{ type: "command", command: PRE_TOOL_USE_COMMAND }],
  };

  const updated: Record<string, unknown> = {
    ...settings,
    hooks: { ...hooks, PreToolUse: [...preToolUse, entry] },
  };

  if (!dryRun) {
    await fs.mkdir(clauDir, { recursive: true });
    await fs.writeFile(settingsFile, JSON.stringify(updated, null, 2) + "\n", "utf8");
  }

  return { file: settingsFile, alreadyInstalled: false };
}

export async function removePreToolUseHook(
  projectPath: string,
  dryRun: boolean,
): Promise<{ file: string; found: boolean }> {
  const settingsFile = path.join(projectPath, ".claude", "settings.json");
  if (!(await fileExists(settingsFile))) return { file: settingsFile, found: false };

  let settings: Record<string, unknown>;
  try {
    settings = JSON.parse(await fs.readFile(settingsFile, "utf8")) as Record<string, unknown>;
  } catch {
    return { file: settingsFile, found: false };
  }

  const hooks = (settings.hooks ?? {}) as Record<string, unknown>;
  const preToolUse = (hooks.PreToolUse ?? []) as unknown[];
  const filtered = preToolUse.filter((e) => !JSON.stringify(e).includes("agents-sync-anti-compaction"));

  if (filtered.length === preToolUse.length) return { file: settingsFile, found: false };

  const updatedHooks = { ...hooks };
  if (filtered.length > 0) {
    updatedHooks.PreToolUse = filtered;
  } else {
    delete updatedHooks.PreToolUse;
  }

  const updated: Record<string, unknown> = { ...settings };
  if (Object.keys(updatedHooks).length > 0) {
    updated.hooks = updatedHooks;
  } else {
    delete updated.hooks;
  }

  if (!dryRun) {
    await fs.writeFile(settingsFile, JSON.stringify(updated, null, 2) + "\n", "utf8");
  }

  return { file: settingsFile, found: true };
}

// ---------------------------------------------------------------------------

export interface UninstallHookOptions {
  projectPath: string;
  manager?: HookManager;
  /** Also remove the Claude Code SessionStart hook from .claude/settings.json. @default true */
  sessionHook?: boolean;
  dryRun?: boolean;
}

export interface UninstallHookResult {
  manager: HookManager;
  filesModified: string[];
  notInstalled: boolean;
  sessionHookRemoved: boolean;
  lazyRemoved: boolean;
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
  const { projectPath, dryRun = false, sessionHook = true } = options;
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

  // Remove SessionStart hook from .claude/settings.json
  let sessionHookRemoved = false;
  if (sessionHook) {
    const result = await removeSessionStartHook(projectPath, dryRun);
    sessionHookRemoved = result.found;
    if (result.found) filesModified.push(result.file);
  }

  // Always clean up lazy hook if present
  let lazyRemoved = false;
  const lazyResult = await removeLazyHook(projectPath, dryRun);
  lazyRemoved = lazyResult.found;
  if (lazyResult.found) filesModified.push(lazyResult.file);

  const notInstalled = filesModified.length === 0;
  const lines: string[] = [];

  if (notInstalled) {
    lines.push("agents-sync hook not found — nothing to remove.");
  } else if (dryRun) {
    lines.push(`DRY RUN — would remove agents-sync from:`);
    for (const f of filesModified) lines.push(`  → ${f}`);
  } else {
    lines.push(`✓ Removed agents-sync pre-commit hook (${manager})`);
    if (sessionHookRemoved) lines.push("✓ Removed agents-sync SessionStart hook (.claude/settings.json)");
    if (lazyRemoved) lines.push("✓ Removed lazy-loading instruction (.claude/settings.json)");
    for (const f of filesModified) lines.push(`  → ${f}`);
  }

  return { manager, filesModified, notInstalled, sessionHookRemoved, lazyRemoved, dryRun, report: lines.join("\n") };
}

export async function runInstallHook(options: InstallHookOptions): Promise<InstallHookResult> {
  const { projectPath, dryRun = false, sessionHook = true, antiCompaction = false, lazy = false } = options;
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

  // Install SessionStart hook in .claude/settings.json
  let sessionHookInstalled = false;
  let sessionHookAlreadyInstalled = false;
  if (sessionHook) {
    const result = await installSessionStartHook(projectPath, dryRun);
    sessionHookAlreadyInstalled = result.alreadyInstalled;
    sessionHookInstalled = !result.alreadyInstalled;
    if (!result.alreadyInstalled) files = [...files, result.file];
  }

  // Optionally install PreToolUse anti-compaction hook
  let antiCompactionInstalled = false;
  if (antiCompaction) {
    const result = await installPreToolUseHook(projectPath, dryRun);
    antiCompactionInstalled = !result.alreadyInstalled;
    if (!result.alreadyInstalled) files = [...files, result.file];
  }

  // Optionally install lazy subdirectory loading instruction
  let lazyInstalled = false;
  let lazyAlreadyInstalled = false;
  if (lazy) {
    const result = await installLazyHook(projectPath, dryRun);
    lazyAlreadyInstalled = result.alreadyInstalled;
    lazyInstalled = !result.alreadyInstalled;
    if (!result.alreadyInstalled) files = [...files, result.file];
  }

  const lines: string[] = [];

  if (alreadyInstalled && sessionHookAlreadyInstalled) {
    lines.push("✓ agents-sync hooks already installed — nothing to do.");
  } else if (dryRun) {
    lines.push(`DRY RUN — detected manager: ${manager}`);
    for (const f of files) lines.push(`→ Would write: ${f}`);
  } else {
    if (!alreadyInstalled) {
      lines.push(`✓ Installed pre-commit hook (${manager})`);
    }
    if (sessionHookInstalled) {
      lines.push("✓ Installed SessionStart hook (.claude/settings.json)");
      lines.push("  → AGENTS.md will be auto-loaded as context in every Claude Code session.");
    }
    if (antiCompactionInstalled) {
      lines.push("✓ Installed anti-compaction PreToolUse hook (.claude/settings.json)");
      lines.push("  → AGENTS.md will be re-injected on every tool call (survives context compaction).");
    }
    if (lazyInstalled) {
      lines.push("✓ Installed lazy-loading instruction (.claude/settings.json)");
      lines.push("  → Claude will check for AGENTS.md in subdirectories it enters (monorepo support).");
    }
    for (const f of files) lines.push(`  → ${f}`);
    lines.push("");

    if (manager === "git") {
      lines.push("  ⚠ Git hook is local only — teammates need to run install-hook too.");
      lines.push("  → For shared hooks, add husky or lefthook to your project.");
    } else if (!alreadyInstalled) {
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
    sessionHookInstalled,
    sessionHookAlreadyInstalled,
    antiCompactionInstalled,
    lazyInstalled,
    lazyAlreadyInstalled,
    dryRun,
    report: lines.join("\n"),
  };
}
