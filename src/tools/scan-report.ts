/**
 * agents-sync scan
 *
 * Read-only, no Claude API call. Runs the full scanner and prints what it
 * found — language, framework, dependencies, structure, MCPs, local skills,
 * gotchas. Lets developers verify the scanner works before committing to init.
 */
import path from "node:path";
import { assertProjectDir } from "../lib/file-utils.js";
import { scan } from "../scanner/index.js";
import { scanProjectSkills } from "../scanner/skills.js";

export interface ScanReportOptions {
  projectPath: string;
}

export interface ScanReportResult {
  report: string;
  language: string;
  framework: string | null;
  dependencyCount: number;
  mcpCount: number;
  skillCount: number;
  gotchaCount: number;
}

export async function runScanReport(options: ScanReportOptions): Promise<ScanReportResult> {
  const { projectPath } = options;
  await assertProjectDir(projectPath);

  const [corpus, skillsSummary] = await Promise.all([
    scan(projectPath),
    scanProjectSkills(projectPath),
  ]);

  const NO_COLOR = process.env.NO_COLOR === "1";
  const c = (code: string, t: string) => (NO_COLOR ? t : `\x1b[${code}m${t}\x1b[0m`);

  const lines: string[] = [];

  lines.push(c("1", `agents-sync scan — ${path.basename(projectPath)}\n`));

  // Project identity
  lines.push(c("1;34", "▸ Project"));
  lines.push(`  Language:    ${corpus.manifest.language}`);
  if (corpus.manifest.framework) lines.push(`  Framework:   ${corpus.manifest.framework}`);
  if (corpus.manifest.runtime) lines.push(`  Runtime:     ${corpus.manifest.runtime}`);
  if (corpus.manifest.projectName) lines.push(`  Name:        ${corpus.manifest.projectName}`);
  if (corpus.manifest.packageManager) lines.push(`  Pkg manager: ${corpus.manifest.packageManager}`);
  lines.push("");

  // Dependencies
  const depCount = corpus.manifest.dependencies.length;
  const devDepCount = corpus.manifest.devDependencies.length;
  lines.push(c("1;34", "▸ Dependencies"));
  lines.push(`  ${depCount} production, ${devDepCount} dev`);
  if (depCount > 0) {
    lines.push(`  Notable: ${corpus.manifest.dependencies.slice(0, 8).join(", ")}${depCount > 8 ? ` +${depCount - 8} more` : ""}`);
  }
  lines.push("");

  // Structure
  lines.push(c("1;34", "▸ Structure"));
  lines.push(`  Top-level dirs: ${corpus.structure.topLevelDirs.join(", ") || "(none)"}`);
  lines.push(`  Total files:    ~${corpus.structure.totalFileCount}`);
  if (corpus.structure.entryPoints.length > 0) {
    lines.push(`  Entry points:   ${corpus.structure.entryPoints.join(", ")}`);
  }
  if (corpus.structure.testDirs.length > 0) {
    lines.push(`  Test dirs:      ${corpus.structure.testDirs.join(", ")}`);
  }
  lines.push("");

  // Scripts
  const scripts = Object.entries(corpus.manifest.scripts);
  if (scripts.length > 0) {
    lines.push(c("1;34", "▸ Scripts"));
    for (const [name, cmd] of scripts.slice(0, 6)) {
      lines.push(`  ${name.padEnd(12)} ${cmd}`);
    }
    lines.push("");
  }

  // MCPs
  if (corpus.mcp.hasAny) {
    lines.push(c("1;34", "▸ MCP Servers (.claude/settings.json)"));
    for (const s of corpus.mcp.servers) {
      lines.push(`  ${c("32", "✓")} ${s.name} — ${s.description}`);
    }
    lines.push("");
  }

  // Local skills / commands
  if (skillsSummary.hasAny) {
    lines.push(c("1;34", "▸ Local Skills & Commands"));
    for (const cmd of skillsSummary.commands) {
      lines.push(`  ${c("32", "✓")} /${cmd.name} — ${cmd.description}`);
    }
    for (const skill of skillsSummary.skills) {
      lines.push(`  ${c("32", "✓")} ${skill.name} — ${skill.description}`);
    }
    lines.push("");
  }

  // Gotchas
  if (corpus.gotchas.length > 0) {
    lines.push(c("1;34", "▸ Gotchas found in source"));
    for (const g of corpus.gotchas.slice(0, 5)) {
      lines.push(`  ${c("33", g.type)} ${g.file}:${g.line} — ${g.comment.slice(0, 70)}`);
    }
    if (corpus.gotchas.length > 5) {
      lines.push(`  ... and ${corpus.gotchas.length - 5} more`);
    }
    lines.push("");
  }

  // codegraph
  if (corpus.codegraph.available) {
    lines.push(c("1;34", "▸ codegraph (.codegraph/)"));
    lines.push(`  ${corpus.codegraph.communities.length} communities, ${corpus.codegraph.hubNodes.length} hub nodes detected`);
    lines.push("");
  }

  // Existing docs
  const docs: string[] = [];
  if (corpus.docs.existingAgentsMd) docs.push("AGENTS.md");
  if (corpus.docs.existingClaudeMd) docs.push("CLAUDE.md");
  if (corpus.docs.existingCursorRules) docs.push(".cursorrules");
  if (corpus.docs.readme) docs.push("README.md");
  if (docs.length > 0) {
    lines.push(c("1;34", "▸ Existing docs"));
    lines.push(`  ${docs.join(", ")}`);
    lines.push("");
  }

  lines.push(c("2", `Scanned in ${corpus.scanDurationMs}ms · ~${corpus.totalEstimatedTokens.toLocaleString()} tokens of context`));
  lines.push("");

  if (!corpus.docs.existingAgentsMd) {
    lines.push(c("1", "→ Ready to init. Run:"));
    lines.push(`  ${c("32", "ANTHROPIC_API_KEY=<key> npx @googlarz/agents-sync init .")}`);
    lines.push(`  ${c("2", "Get a key: https://console.anthropic.com/")}`);
  } else {
    lines.push(c("1", "→ AGENTS.md found. Check drift:"));
    lines.push(`  ${c("32", "npx @googlarz/agents-sync drift .")}`);
  }

  return {
    report: lines.join("\n"),
    language: corpus.manifest.language,
    framework: corpus.manifest.framework,
    dependencyCount: depCount,
    mcpCount: corpus.mcp.servers.length,
    skillCount: skillsSummary.commands.length + skillsSummary.skills.length,
    gotchaCount: corpus.gotchas.length,
  };
}
