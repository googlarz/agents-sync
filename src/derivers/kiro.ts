import path from "node:path";
import fs from "node:fs/promises";
import type { ProjectMetadata } from "../extractor/schema.js";
import { injectCustomBlocks, loadExistingCustomBlocks } from "./merger.js";

export interface KiroDerivationOptions {
  projectPath: string;
  agentsMdContent: string;
  metadata: ProjectMetadata;
  /** @default true */
  preserveCustom?: boolean;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
 * Derives `.kiro/steering/agents-sync.md` content from AGENTS.md + metadata.
 * Kiro reads markdown files in `.kiro/steering/` as project-level steering docs.
 *
 * Does NOT write the file — the caller is responsible for writing.
 */
export async function deriveKiroSteering(options: KiroDerivationOptions): Promise<string> {
  const { projectPath, agentsMdContent, metadata, preserveCustom = true } = options;
  const { project, conventions: metaConventions, gotchas: metaGotchas, boundaries, testing } = metadata;

  const neverLines = sectionToLines(extractSubSection(agentsMdContent, "Never"));
  const alwaysLines = sectionToLines(extractSubSection(agentsMdContent, "Always"));
  const askFirstLines = sectionToLines(extractSubSection(agentsMdContent, "Ask First"));

  const allNever = [...new Set([...boundaries.never, ...neverLines])];
  const allAlways = [...new Set([...boundaries.alwaysDo, ...alwaysLines])];
  const allAskFirst = [...new Set([...boundaries.askFirst, ...askFirstLines])];
  const allConventions = [...new Set([...metaConventions])];
  const allGotchas = [...new Set([...metaGotchas])];

  const lines: string[] = [];
  const fwPart = project.framework ? ` / ${project.framework}` : "";

  lines.push(`# Project Steering — ${project.name}`);
  lines.push(`> Managed by [agents-sync](https://github.com/googlarz/agents-sync). Edit AGENTS.md, then run \`agents-sync sync\`.`);
  lines.push("");
  lines.push(`**Language:** ${project.language}${fwPart}`);
  if (project.description) lines.push(`**Description:** ${project.description}`);
  lines.push("");

  if (allConventions.length > 0) {
    lines.push("## Conventions");
    for (const c of allConventions) lines.push(`- ${c}`);
    lines.push("");
  }

  if (allGotchas.length > 0) {
    lines.push("## Gotchas");
    for (const g of allGotchas) lines.push(`- ${g}`);
    lines.push("");
  }

  if (allAlways.length > 0) {
    lines.push("## Always");
    for (const r of allAlways) lines.push(`- ${r}`);
    lines.push("");
  }

  if (allAskFirst.length > 0) {
    lines.push("## Ask First");
    for (const r of allAskFirst) lines.push(`- ${r}`);
    lines.push("");
  }

  if (allNever.length > 0) {
    lines.push("## Never");
    for (const r of allNever) lines.push(`- ${r}`);
    lines.push("");
  }

  if (testing.command) {
    lines.push("## Testing");
    lines.push(`Run: \`${testing.command}\``);
    lines.push("");
  }

  const generated = lines.join("\n").trimEnd() + "\n";

  if (!preserveCustom) return generated;

  const kiroPath = path.join(projectPath, ".kiro", "steering", "agents-sync.md");
  const existingBlocks = await loadExistingCustomBlocks(kiroPath);
  return injectCustomBlocks(generated, existingBlocks);
}

/** Ensures `.kiro/steering/` directory exists before writing. */
export async function ensureKiroDir(projectPath: string): Promise<void> {
  await fs.mkdir(path.join(projectPath, ".kiro", "steering"), { recursive: true });
}
