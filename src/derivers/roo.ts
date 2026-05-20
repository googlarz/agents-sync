import path from "node:path";
import type { ProjectMetadata } from "../extractor/schema.js";
import { injectCustomBlocks, loadExistingCustomBlocks } from "./merger.js";

export interface RooDerivationOptions {
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

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
}

interface RooMode {
  slug: string;
  name: string;
  roleDefinition: string;
  customInstructions: string;
  groups: string[];
}

interface RooModesFile {
  customModes: RooMode[];
}

/**
 * Derives `.roomodes` content for Roo Code.
 *
 * Generates a single custom mode that packages project context — conventions,
 * never rules, and stack information — into Roo Code's JSON format.
 *
 * Does NOT write the file — the caller is responsible.
 */
export async function deriveRooModes(options: RooDerivationOptions): Promise<string> {
  const { projectPath, agentsMdContent, metadata, preserveCustom = true } = options;

  const { project, conventions: metaConventions, boundaries, testing } = metadata;

  const conventionsSection = sectionToLines(extractSection(agentsMdContent, "Conventions"));
  const neverSection = sectionToLines(extractSubSection(agentsMdContent, "Never"));
  const alwaysSection = sectionToLines(extractSubSection(agentsMdContent, "Always"));

  const allConventions = deduplicateLines([...metaConventions, ...conventionsSection]);
  const allNever = deduplicateLines([...boundaries.never, ...neverSection]);
  const allAlways = deduplicateLines([...boundaries.alwaysDo, ...alwaysSection]);

  const fwPart = project.framework ? ` using ${project.framework}` : "";
  const roleDefinition = [
    `You are an expert ${project.language}${fwPart} developer working on ${project.name ?? "this project"}.`,
    project.description ? `\n${project.description}` : "",
  ].filter(Boolean).join(" ");

  const instructionParts: string[] = [];

  if (allConventions.length > 0) {
    instructionParts.push("## Conventions\n" + allConventions.map((r) => `- ${r}`).join("\n"));
  }
  if (allNever.length > 0) {
    instructionParts.push("## Never\n" + allNever.map((r) => `- ${r}`).join("\n"));
  }
  if (allAlways.length > 0) {
    instructionParts.push("## Always\n" + allAlways.map((r) => `- ${r}`).join("\n"));
  }
  if (testing.command) {
    instructionParts.push(`## Testing\nRun tests with: \`${testing.command}\``);
  }

  const customInstructions = instructionParts.join("\n\n");

  const mode: RooMode = {
    slug: toSlug(project.name ?? "project"),
    name: project.name ?? "Project",
    roleDefinition,
    customInstructions,
    groups: ["read", "edit", "browser", "command", "mcp"],
  };

  const roomodes: RooModesFile = { customModes: [mode] };
  const generated = JSON.stringify(roomodes, null, 2) + "\n";

  // .roomodes is JSON — custom block injection would corrupt it.
  // If there's an existing file, we merge the customModes arrays instead.
  if (!preserveCustom) return generated;

  const existingPath = path.join(projectPath, ".roomodes");
  const existingBlocks = await loadExistingCustomBlocks(existingPath);

  // For JSON files, custom block markers don't apply.
  // Return generated as-is (existing user modes can be manually added).
  return existingBlocks.length > 0
    ? injectCustomBlocks(generated, existingBlocks)
    : generated;
}
