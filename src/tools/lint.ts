/**
 * agents-sync lint
 *
 * Parses the Never/Always/Boundaries sections of AGENTS.md and checks whether
 * the codebase violates any mechanically-verifiable rules.
 *
 * Design principles:
 *  - Only report high-confidence violations (prefer false-negatives over false-positives)
 *  - Rules we cannot check are skipped gracefully, not errored
 *  - No AST parser required — grep-level checks only
 */
import path from "node:path";
import fs from "node:fs/promises";
import fg from "fast-glob";
import { assertProjectDir, readFileSafe } from "../lib/file-utils.js";

export interface LintOptions {
  projectPath: string;
  /** Exit non-zero on any violation (CI mode). */
  strict?: boolean;
}

export interface LintViolation {
  file: string;
  line: number;
  text: string;
}

export interface LintCheck {
  rule: string;
  checkable: boolean;
  violations: LintViolation[];
  skippedReason?: string;
}

export interface LintResult {
  checks: LintCheck[];
  totalViolations: number;
  report: string;
  passed: boolean;
}

// ─── Source file patterns ─────────────────────────────────────────────────────

const SOURCE_GLOBS = [
  "**/*.{ts,tsx,js,jsx,mjs,cjs}",
  "**/*.{py,rb,go,rs,java,kt,swift,php,cs}",
];

const IGNORE_PATTERNS = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/__pycache__/**",
  "**/.venv/**",
  "**/target/**",
  "**/.next/**",
  "**/coverage/**",
  "**/*.min.js",
  "**/*.d.ts",
];

// ─── Rule catalog ─────────────────────────────────────────────────────────────
// Each entry: a matcher that detects if a rule is checkable, and a checker that
// scans files for violations.

interface CheckerDef {
  /** Returns true if this checker handles the given rule text. */
  matches: (rule: string) => boolean;
  /** Scans the project and returns violations. */
  check: (rule: string, projectPath: string, files: SourceFile[]) => Promise<LintViolation[]>;
}

interface SourceFile {
  relPath: string;
  absPath: string;
  lines: string[];
}

const CHECKERS: CheckerDef[] = [
  // ── console.log ──────────────────────────────────────────────────────────────
  {
    matches: (r) => /console\.log/i.test(r),
    check: async (_rule, _project, files) =>
      grepFiles(files, /console\.log\s*\(/, ["**/*.test.*", "**/*.spec.*", "**/scripts/**"]),
  },

  // ── TypeScript `any` ─────────────────────────────────────────────────────────
  {
    matches: (r) => /\bany\b/.test(r) && /typescript|ts\b/i.test(r),
    check: async (_rule, _project, files) =>
      grepFiles(
        files.filter((f) => /\.(ts|tsx)$/.test(f.relPath)),
        /:\s*any\b/,
        ["**/*.test.*", "**/*.spec.*", "**/*.d.ts"],
      ),
  },

  // ── `any` without qualifier (e.g. "never use `any`") ──────────────────────
  {
    matches: (r) => /\`any\`|"any"|use\s+any\b|type\s+any\b/i.test(r),
    check: async (_rule, _project, files) =>
      grepFiles(
        files.filter((f) => /\.(ts|tsx)$/.test(f.relPath)),
        /:\s*any\b/,
        ["**/*.test.*", "**/*.spec.*", "**/*.d.ts"],
      ),
  },

  // ── Direct import of a named symbol ─────────────────────────────────────────
  // Detects rules like "never import PrismaClient directly" or "never import X from Y"
  {
    matches: (r) =>
      /import.+directly|never\s+import\s+\w|import\s+\w+\s+from/i.test(r),
    check: async (rule, _project, files) => {
      // Extract the symbol name (CamelCase word after "import")
      const symbolMatch =
        /import\s+[`'"]?(\w+)[`'"]?\s+directly/i.exec(rule) ??
        /never\s+import\s+[`'"]?(\w+)[`'"]?/i.exec(rule);
      if (!symbolMatch) return [];
      const symbol = symbolMatch[1];
      // Also try to extract the safe path (text inside parentheses or after "use")
      const safePathMatch = /\(use\s+([^\)]+)\)|use\s+`([^`]+)`/i.exec(rule);
      const safePath = safePathMatch?.[1] ?? safePathMatch?.[2];

      return grepFiles(
        files,
        new RegExp(`import.*\\b${symbol}\\b.*from`),
        [],
        safePath ? [new RegExp(safePath.replace(/\//g, "\\/"))] : [],
      );
    },
  },

  // ── Default exports ──────────────────────────────────────────────────────────
  {
    matches: (r) => /default\s+export|export\s+default/i.test(r) && /never|no\s+default/i.test(r),
    check: async (_rule, _project, files) =>
      grepFiles(
        files.filter((f) => /\.(ts|tsx|js|jsx)$/.test(f.relPath)),
        /^export\s+default\b/m,
        // Next.js pages and layouts are always allowed to use default exports
        ["**/app/**", "**/pages/**"],
      ),
  },

  // ── .env commit guard ────────────────────────────────────────────────────────
  {
    matches: (r) => /\.env/i.test(r) && /commit|git/i.test(r),
    check: async (_rule, projectPath) => {
      const gitignorePath = path.join(projectPath, ".gitignore");
      const gitignore = await readFileSafe(gitignorePath);
      if (!gitignore) {
        return [{ file: ".gitignore", line: 0, text: ".gitignore not found — .env may not be protected" }];
      }
      const hasEnvEntry = /^\.env/m.test(gitignore);
      if (!hasEnvEntry) {
        return [{ file: ".gitignore", line: 0, text: '.env is not listed in .gitignore' }];
      }
      return [];
    },
  },

  // ── process.env direct access (when convention says "use config module") ───
  {
    matches: (r) => /process\.env/i.test(r) && /never|directly/i.test(r),
    check: async (_rule, _project, files) =>
      grepFiles(
        files.filter((f) => /\.(ts|tsx|js|jsx)$/.test(f.relPath)),
        /process\.env\.\w+/,
        ["**/config/**", "**/*.config.*", "**/env.ts", "**/env.js"],
      ),
  },
];

// ─── Grep helpers ─────────────────────────────────────────────────────────────

function grepFiles(
  files: SourceFile[],
  pattern: RegExp,
  skipGlobs: string[] = [],
  excludePatterns: RegExp[] = [],
): LintViolation[] {
  const violations: LintViolation[] = [];

  outer: for (const f of files) {
    for (const skip of skipGlobs) {
      // Strip glob wildcards and leading/trailing slashes, then do substring check
      const seg = skip.replace(/\*\*/g, "").replace(/\*/g, "").replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/");
      if (seg && f.relPath.includes(seg)) continue outer;
    }

    for (let i = 0; i < f.lines.length; i++) {
      const line = f.lines[i];
      if (!pattern.test(line)) continue;
      // If this line matches an exclusion pattern, skip it
      if (excludePatterns.some((ex) => ex.test(line))) continue;
      violations.push({ file: f.relPath, line: i + 1, text: line.trim() });
      if (violations.length >= 20) return violations; // cap per-rule
    }
  }

  return violations;
}

// ─── AGENTS.md parser ─────────────────────────────────────────────────────────

function extractNeverRules(agentsMdContent: string): string[] {
  const rules: string[] = [];
  // Find the Never section (handles ### Never, ## Never, **Never**, etc.)
  const neverMatch = /#{1,3}\s*Never\b([^#]*)/i.exec(agentsMdContent);
  if (!neverMatch) return rules;

  const section = neverMatch[1];
  for (const line of section.split("\n")) {
    const item = line.replace(/^[-*•]\s*/, "").trim();
    if (item.length > 4 && item.length < 300) rules.push(item);
  }
  return rules;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function runLint(options: LintOptions): Promise<LintResult> {
  const { projectPath } = options;
  await assertProjectDir(projectPath);

  // Read AGENTS.md
  const agentsMdPath = path.join(projectPath, "AGENTS.md");
  const agentsMd = await readFileSafe(agentsMdPath);
  if (!agentsMd) {
    const report = "✗  AGENTS.md not found. Run agents-sync init first.";
    return { checks: [], totalViolations: 0, report, passed: false };
  }

  const neverRules = extractNeverRules(agentsMd);
  if (neverRules.length === 0) {
    const report = "No 'Never' rules found in AGENTS.md — nothing to lint.";
    return { checks: [], totalViolations: 0, report, passed: true };
  }

  // Load source files once (shared across all checks)
  const relPaths = await fg(SOURCE_GLOBS, {
    cwd: projectPath,
    onlyFiles: true,
    ignore: IGNORE_PATTERNS,
    dot: false,
  });

  const sourceFiles: SourceFile[] = [];
  for (const relPath of relPaths) {
    const absPath = path.join(projectPath, relPath);
    const content = await fs.readFile(absPath, "utf-8").catch(() => null);
    if (!content || content.includes("\0")) continue;
    sourceFiles.push({ relPath, absPath, lines: content.split("\n") });
  }

  // Run checks
  const checks: LintCheck[] = [];
  for (const rule of neverRules) {
    const checker = CHECKERS.find((c) => c.matches(rule));
    if (!checker) {
      checks.push({ rule, checkable: false, violations: [], skippedReason: "No automated check available" });
      continue;
    }
    const violations = await checker.check(rule, projectPath, sourceFiles);
    checks.push({ rule, checkable: true, violations });
  }

  const totalViolations = checks.reduce((n, c) => n + c.violations.length, 0);
  const passed = totalViolations === 0;
  const report = buildReport(checks, totalViolations);

  return { checks, totalViolations, report, passed };
}

function buildReport(checks: LintCheck[], totalViolations: number): string {
  const NO_COLOR = process.env.NO_COLOR === "1";
  const c = (code: string, t: string) => (NO_COLOR ? t : `\x1b[${code}m${t}\x1b[0m`);
  const lines: string[] = [];

  lines.push(c("1", "agents-sync lint\n"));

  for (const check of checks) {
    if (!check.checkable) {
      lines.push(`${c("2", "─")} ${c("2", check.rule)}`);
      lines.push(`  ${c("2", `↳ skipped: ${check.skippedReason}`)}`);
      continue;
    }
    if (check.violations.length === 0) {
      lines.push(`${c("32", "✓")} ${check.rule}`);
    } else {
      lines.push(`${c("31;1", "✗")} ${check.rule} — ${c("31", String(check.violations.length))} violation${check.violations.length === 1 ? "" : "s"}`);
      for (const v of check.violations) {
        const loc = `${v.file}:${v.line}`.padEnd(45);
        lines.push(`  ${c("33", loc)}  ${c("2", v.text.slice(0, 80))}`);
      }
    }
    lines.push("");
  }

  if (totalViolations === 0) {
    lines.push(c("32;1", "✓  No violations found."));
  } else {
    lines.push(c("31;1", `${totalViolations} violation${totalViolations === 1 ? "" : "s"} found.`));
  }

  return lines.join("\n");
}
