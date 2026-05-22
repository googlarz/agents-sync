import path from "node:path";
import fs from "node:fs/promises";
import type { ProjectMetadata } from "../extractor/schema.js";
import { injectCustomBlocks, loadExistingCustomBlocks } from "./merger.js";

export interface TraeDerivationOptions {
  projectPath: string;
  agentsMdContent: string;
  metadata: ProjectMetadata;
  /** @default true */
  preserveCustom?: boolean;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractSection(content: string, heading: string): string {
  const re = new RegExp(
    `^##\\s+${escapeRegExp(heading)}\\s*$([\\s\\S]*?)(?=^##\\s|$)`,
    "mi",
  );
  const match = re.exec(content);
  return match ? match[1].trim() : "";
}

function extractSubSection(content: string, heading: string): string {
  const re = new RegExp(
    `^###\\s+${escapeRegExp(heading)}\\s*$([\\s\\S]*?)(?=^###\\s|^##\\s|$)`,
    "mi",
  );
  const match = re.exec(content);
  return match ? match[1].trim() : "";
}

function sectionToLines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.replace(/^[\s\-*>]+/, "").trim())
    .filter((l) => l.length > 0);
}

/**
 * Derives `.trae/rules/agents-sync.md` for Trae IDE (ByteDance VS Code fork).
 * Same directive style as .windsurfrules.
 *
 * Does NOT write the file — the caller is responsible for writing.
 */
export async function deriveTraeRules(options: TraeDerivationOptions): Promise<string> {
  const { projectPath, agentsMdContent, metadata, preserveCustom = true } = options;
  const { project, conventions: metaConventions, gotchas: metaGotchas, boundaries, testing } = metadata;

  const conventionsSection = sectionToLines(extractSection(agentsMdContent, "Conventions"));
  const gotchasSection = sectionToLines(extractSection(agentsMdContent, "Gotchas"));
  const neverSection = sectionToLines(extractSubSection(agentsMdContent, "Never"));

  const allConventions = [...new Set([...metaConventions, ...conventionsSection])];
  const allGotchas = [...new Set([...metaGotchas, ...gotchasSection])];
  const allNever = [...new Set([...boundaries.never, ...neverSection])];

  const lines: string[] = [];
  const fwPart = project.framework ? ` / ${project.framework}` : "";

  lines.push(`# .trae/rules/agents-sync.md — managed by agents-sync`);
  lines.push(`# Language: ${project.language}${fwPart}`);
  lines.push("");

  if (allConventions.length > 0) {
    lines.push("## Conventions");
    for (const rule of allConventions) lines.push(`- Always: ${rule}`);
    lines.push("");
  }

  if (allGotchas.length > 0) {
    lines.push("## Gotchas");
    for (const gotcha of allGotchas) lines.push(`- Never: ${gotcha}`);
    lines.push("");
  }

  if (allNever.length > 0) {
    lines.push("## Hard boundaries");
    for (const rule of allNever) lines.push(`- Never: ${rule}`);
    lines.push("");
  }

  if (boundaries.alwaysDo.length > 0) {
    lines.push("## Always do");
    for (const rule of boundaries.alwaysDo) lines.push(`- ${rule}`);
    lines.push("");
  }

  if (testing.command) {
    lines.push(`Tests: \`${testing.command}\``);
    lines.push("");
  }

  const generated = lines.join("\n").trimEnd() + "\n";

  if (!preserveCustom) return generated;

  const traePath = path.join(projectPath, ".trae", "rules", "agents-sync.md");
  const existingBlocks = await loadExistingCustomBlocks(traePath);
  return injectCustomBlocks(generated, existingBlocks);
}

/** Ensures `.trae/rules/` directory exists before writing. */
export async function ensureTraeDir(projectPath: string): Promise<void> {
  await fs.mkdir(path.join(projectPath, ".trae", "rules"), { recursive: true });
}
