import path from "node:path";
import type { ProjectMetadata } from "../extractor/schema.js";
import { injectCustomBlocks, loadExistingCustomBlocks } from "./merger.js";

export interface AiderDerivationOptions {
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
 * Derives `CONVENTIONS.md` for Aider.
 *
 * Aider reads CONVENTIONS.md (or .aider.conf.yml) from the project root and
 * includes it as context in every session. We write conventions + boundaries
 * in plain markdown — no tool-specific syntax needed.
 *
 * Does NOT write the file — the caller is responsible.
 */
export async function deriveAiderConventions(options: AiderDerivationOptions): Promise<string> {
  const { projectPath, agentsMdContent, metadata, preserveCustom = true } = options;

  const { project, conventions: metaConventions, gotchas: metaGotchas, boundaries, testing, stack } = metadata;

  const conventionsSection = sectionToLines(extractSection(agentsMdContent, "Conventions"));
  const gotchasSection = sectionToLines(extractSection(agentsMdContent, "Gotchas"));
  const neverSection = sectionToLines(extractSubSection(agentsMdContent, "Never"));
  const alwaysSection = sectionToLines(extractSubSection(agentsMdContent, "Always"));
  const askFirstSection = sectionToLines(extractSubSection(agentsMdContent, "Ask first"));

  const allConventions = deduplicateLines([...metaConventions, ...conventionsSection]);
  const allGotchas = deduplicateLines([...metaGotchas, ...gotchasSection]);
  const allNever = deduplicateLines([...boundaries.never, ...neverSection]);
  const allAlways = deduplicateLines([...boundaries.alwaysDo, ...alwaysSection]);
  const allAskFirst = deduplicateLines([...boundaries.askFirst, ...askFirstSection]);

  const lines: string[] = [];

  lines.push(`# CONVENTIONS.md — managed by agents-sync`);
  lines.push(`# ${project.name ?? "Project"} · ${project.language}${project.framework ? ` / ${project.framework}` : ""}`);
  lines.push("");

  if (stack.database || stack.testing || stack.deploy) {
    lines.push("## Stack");
    if (stack.database) lines.push(`- Database: ${stack.database}`);
    if (stack.testing) lines.push(`- Testing: ${stack.testing}`);
    if (stack.deploy) lines.push(`- Deploy: ${stack.deploy}`);
    lines.push("");
  }

  if (allConventions.length > 0) {
    lines.push("## Conventions");
    for (const rule of allConventions) {
      lines.push(`- ${rule}`);
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

  if (allAlways.length > 0) {
    lines.push("## Always");
    for (const rule of allAlways) {
      lines.push(`- ${rule}`);
    }
    lines.push("");
  }

  if (allAskFirst.length > 0) {
    lines.push("## Ask first");
    for (const rule of allAskFirst) {
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

  if (testing.command) {
    lines.push("## Testing");
    lines.push(`- Run: \`${testing.command}\``);
    if (testing.location) lines.push(`- Tests in: \`${testing.location}\``);
    lines.push("");
  }

  const generated = lines.join("\n").trimEnd() + "\n";

  if (!preserveCustom) return generated;

  const conventionsPath = path.join(projectPath, "CONVENTIONS.md");
  const existingBlocks = await loadExistingCustomBlocks(conventionsPath);

  return injectCustomBlocks(generated, existingBlocks);
}
