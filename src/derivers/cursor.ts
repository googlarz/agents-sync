import path from "node:path";
import type { ProjectMetadata } from "../extractor/schema.js";
import { injectCustomBlocks, loadExistingCustomBlocks } from "./merger.js";

export interface CursorDerivationOptions {
  projectPath: string;
  agentsMdContent: string;
  metadata: ProjectMetadata;
  /** @default true */
  preserveCustom?: boolean;
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/**
 * Extracts the text body of the first `## Heading` section that matches the
 * given heading name (case-insensitive). Returns an empty string when not found.
 */
function extractSection(content: string, heading: string): string {
  const re = new RegExp(
    `^##\\s+${escapeRegExp(heading)}\\s*$([\\s\\S]*?)(?=^##\\s|$)`,
    "mi",
  );
  const match = re.exec(content);
  return match ? match[1].trim() : "";
}

/**
 * Extracts the text body of the first `### Heading` subsection that matches.
 */
function extractSubSection(content: string, heading: string): string {
  const re = new RegExp(
    `^###\\s+${escapeRegExp(heading)}\\s*$([\\s\\S]*?)(?=^###\\s|^##\\s|$)`,
    "mi",
  );
  const match = re.exec(content);
  return match ? match[1].trim() : "";
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Parses a markdown section into a list of individual rule strings, stripping
 * leading list markers and blank lines.
 */
function sectionToLines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.replace(/^[\s\-*>]+/, "").trim())
    .filter((l) => l.length > 0);
}

// ---------------------------------------------------------------------------
// Deriver
// ---------------------------------------------------------------------------

/**
 * Derives directive-style `.cursorrules` content from AGENTS.md + metadata.
 * Keeps output terse and scannable — target < 400 words.
 *
 * Does NOT write the file — the caller is responsible for writing.
 */
export async function deriveCursorRules(options: CursorDerivationOptions): Promise<string> {
  const { projectPath, agentsMdContent, metadata, preserveCustom = true } = options;

  const { project, conventions: metaConventions, gotchas: metaGotchas, boundaries, testing } = metadata;

  // Pull extra rules from AGENTS.md prose
  const conventionsSection = sectionToLines(extractSection(agentsMdContent, "Conventions"));
  const gotchasSection = sectionToLines(extractSection(agentsMdContent, "Gotchas"));
  const neverSection = sectionToLines(extractSubSection(agentsMdContent, "Never"));

  // Merge with metadata, preferring metadata as it's structured
  const allConventions = deduplicateLines([...metaConventions, ...conventionsSection]);
  const allGotchas = deduplicateLines([...metaGotchas, ...gotchasSection]);
  const allNever = deduplicateLines([...boundaries.never, ...neverSection]);

  const lines: string[] = [];

  // Header
  lines.push("# .cursorrules — managed by agents-sync");
  lines.push("");

  // Project identity
  const frameworkPart = project.framework ? ` · ${project.framework}` : "";
  lines.push(`${project.name} — ${project.language}${frameworkPart}`);
  lines.push("");

  // Test command
  if (testing.command) {
    lines.push(`**Test command:** \`${testing.command}\``);
    lines.push("");
  }

  // Conventions
  if (allConventions.length > 0) {
    lines.push("## Conventions");
    for (const rule of allConventions) {
      lines.push(`- Always: ${rule}`);
    }
    lines.push("");
  }

  // Gotchas
  if (allGotchas.length > 0) {
    lines.push("## Gotchas");
    for (const gotcha of allGotchas) {
      // Gotchas already include consequence phrasing; surface as "Never" hints
      lines.push(`- Never: ${gotcha}`);
    }
    lines.push("");
  }

  // Hard never rules (boundaries)
  if (allNever.length > 0) {
    lines.push("## Hard boundaries");
    for (const rule of allNever) {
      lines.push(`- Never: ${rule}`);
    }
    lines.push("");
  }

  // Always-do boundaries
  if (boundaries.alwaysDo.length > 0) {
    lines.push("## Always do");
    for (const rule of boundaries.alwaysDo) {
      lines.push(`- ${rule}`);
    }
    lines.push("");
  }

  const generated = lines.join("\n").trimEnd() + "\n";

  if (!preserveCustom) return generated;

  const cursorPath = path.join(projectPath, ".cursorrules");
  const existingBlocks = await loadExistingCustomBlocks(cursorPath);

  return injectCustomBlocks(generated, existingBlocks);
}

function deduplicateLines(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase().trim();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}
