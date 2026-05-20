import path from "node:path";
import type { ProjectMetadata } from "../extractor/schema.js";
import { injectCustomBlocks, loadExistingCustomBlocks } from "./merger.js";

export interface ClineDerivationOptions {
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

function deduplicateLines(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Derives `.clinerules` content from AGENTS.md + metadata.
 * Cline reads this file for project-specific AI instructions.
 * Target < 400 words.
 *
 * Does NOT write the file — the caller is responsible for writing.
 */
export async function deriveClineRules(options: ClineDerivationOptions): Promise<string> {
  const { projectPath, agentsMdContent, metadata, preserveCustom = true } = options;

  const { project, conventions: metaConventions, gotchas: metaGotchas, boundaries, testing } = metadata;

  const conventionsSection = sectionToLines(extractSection(agentsMdContent, "Conventions"));
  const gotchasSection = sectionToLines(extractSection(agentsMdContent, "Gotchas"));
  const neverSection = sectionToLines(extractSubSection(agentsMdContent, "Never"));

  const allConventions = deduplicateLines([...metaConventions, ...conventionsSection]);
  const allGotchas = deduplicateLines([...metaGotchas, ...gotchasSection]);
  const allNever = deduplicateLines([...boundaries.never, ...neverSection]);

  const lines: string[] = [];

  const fwPart = project.framework ? ` / ${project.framework}` : "";
  lines.push(`# .clinerules — managed by agents-sync`);
  lines.push(`# Language: ${project.language}${fwPart}`);
  lines.push("");

  if (allConventions.length > 0) {
    lines.push("## Conventions");
    for (const rule of allConventions) {
      lines.push(`- ${rule}`);
    }
    lines.push("");
  }

  if (allGotchas.length > 0) {
    lines.push("## Gotchas");
    for (const gotcha of allGotchas) {
      lines.push(`- ${gotcha}`);
    }
    lines.push("");
  }

  if (allNever.length > 0) {
    lines.push("## Never");
    for (const rule of allNever) {
      lines.push(`- ${rule}`);
    }
    lines.push("");
  }

  if (boundaries.alwaysDo.length > 0) {
    lines.push("## Always");
    for (const rule of boundaries.alwaysDo) {
      lines.push(`- ${rule}`);
    }
    lines.push("");
  }

  if (testing.command) {
    lines.push(`**Tests:** \`${testing.command}\``);
    lines.push("");
  }

  const generated = lines.join("\n").trimEnd() + "\n";

  if (!preserveCustom) return generated;

  const clinePath = path.join(projectPath, ".clinerules");
  const existingBlocks = await loadExistingCustomBlocks(clinePath);

  return injectCustomBlocks(generated, existingBlocks);
}
