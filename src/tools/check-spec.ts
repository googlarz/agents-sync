/**
 * agents-sync check-spec
 *
 * Validates AGENTS.md against the emerging cross-tool spec:
 * https://github.com/anthropics/claude-code/issues/6235
 *
 * The spec isn't formally published yet, but the community has converged on
 * a set of sections that most tools expect.  This command warns when your
 * AGENTS.md is missing sections that limit its usefulness across tools
 * (Claude Code, Cursor, Gemini CLI, Codex, Windsurf, etc.).
 */
import path from "node:path";
import fs from "node:fs/promises";

export interface SpecViolation {
  severity: "ERROR" | "WARN";
  message: string;
  suggestion: string;
}

export interface CheckSpecResult {
  agentsMdPath: string;
  violations: SpecViolation[];
  passed: boolean;
  report: string;
}

/** Sections that all major tools benefit from. */
const REQUIRED_SECTIONS: { heading: RegExp; name: string; suggestion: string }[] = [
  {
    heading: /^##\s+(commands|build|run|test|scripts)/im,
    name: "Commands / Build / Run / Test",
    suggestion:
      'Add a "## Commands" section with the actual commands to build, test, and run this project.\n' +
      "  Example:\n" +
      "  ## Commands\n" +
      "  Build: npm run build\n" +
      "  Test:  npm test\n" +
      "  Lint:  npm run lint",
  },
  {
    heading: /^##\s+(architecture|structure|layout|project structure)/im,
    name: "Architecture / Project Structure",
    suggestion:
      'Add a "## Architecture" or "## Project Structure" section describing the directory layout\n' +
      "  and key components.  Helps AI tools understand where to look for specific functionality.",
  },
  {
    heading: /^##\s+(guidelines|rules|conventions|boundaries|never|always do)/im,
    name: "Guidelines / Rules / Boundaries",
    suggestion:
      'Add a "## Guidelines" or "## Boundaries" section with explicit rules.\n' +
      '  The most useful format: "Never X", "Always Y", "Ask before Z".',
  },
];

/** Checks that pass almost universally — warn, not error. */
const WARN_CHECKS: { test: (content: string) => boolean; message: string; suggestion: string }[] = [
  {
    test: (c) => c.length < 200,
    message: "AGENTS.md is very short (under 200 characters).",
    suggestion: "A useful AGENTS.md should be at least a few hundred words. Run `agents-sync init .` to generate a full one.",
  },
  {
    test: (c) => !/```/.test(c) && !/`[^`]+`/.test(c),
    message: "No code blocks or inline code found.",
    suggestion: "Include actual commands in code blocks so AI tools can extract and run them reliably.",
  },
  {
    test: (c) => (c.match(/^##\s/gm) ?? []).length < 2,
    message: "Fewer than 2 H2 sections — most tools expect structured sections.",
    suggestion: 'Add H2 sections (##) to organise content: Commands, Architecture, Guidelines, etc.',
  },
];

export async function runCheckSpec(options: { projectPath: string; ci?: boolean }): Promise<CheckSpecResult> {
  const { projectPath, ci = false } = options;
  const agentsMdPath = path.join(projectPath, "AGENTS.md");

  let content: string;
  try {
    content = await fs.readFile(agentsMdPath, "utf8");
  } catch {
    const report = `✗ AGENTS.md not found at ${agentsMdPath}\n  Run \`agents-sync init .\` to generate one.`;
    return { agentsMdPath, violations: [{ severity: "ERROR", message: "AGENTS.md not found", suggestion: "Run agents-sync init ." }], passed: false, report };
  }

  const violations: SpecViolation[] = [];

  for (const check of REQUIRED_SECTIONS) {
    if (!check.heading.test(content)) {
      violations.push({ severity: "WARN", message: `Missing section: ${check.name}`, suggestion: check.suggestion });
    }
  }

  for (const check of WARN_CHECKS) {
    if (check.test(content)) {
      violations.push({ severity: "WARN", message: check.message, suggestion: check.suggestion });
    }
  }

  const errors = violations.filter((v) => v.severity === "ERROR");
  const warnings = violations.filter((v) => v.severity === "WARN");
  const passed = ci ? errors.length === 0 : violations.length === 0;

  const lines: string[] = [];

  if (violations.length === 0) {
    lines.push(`✓ AGENTS.md passes all spec checks (${agentsMdPath})`);
  } else {
    lines.push(`AGENTS.md spec check — ${agentsMdPath}`);
    lines.push("");

    for (const v of errors) {
      lines.push(`✗ [ERROR] ${v.message}`);
      lines.push(`  ${v.suggestion.split("\n").join("\n  ")}`);
      lines.push("");
    }
    for (const v of warnings) {
      lines.push(`⚠ [WARN]  ${v.message}`);
      lines.push(`  ${v.suggestion.split("\n").join("\n  ")}`);
      lines.push("");
    }

    lines.push(`${errors.length} error(s), ${warnings.length} warning(s)`);
    if (!ci && warnings.length > 0) {
      lines.push("Use --ci to exit 1 only on errors (not warnings).");
    }
  }

  return { agentsMdPath, violations, passed, report: lines.join("\n") };
}
