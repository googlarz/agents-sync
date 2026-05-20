import path from "node:path";
import type { ProjectMetadata } from "../extractor/schema.js";
import { writeFileAtomic } from "../lib/file-utils.js";
import { toMcpError } from "../lib/errors.js";
import { extractCustomBlocks } from "./merger.js";
import { deriveClaudeMd } from "./claude.js";
import { deriveCursorRules } from "./cursor.js";
import { deriveCopilotInstructions } from "./copilot.js";
import { deriveGeminiMd } from "./gemini.js";
import { deriveWindsurfRules } from "./windsurf.js";
import { deriveClineRules } from "./cline.js";
import { deriveRooModes } from "./roo.js";
import { deriveAiderConventions } from "./aider.js";

export type ToolName = "claude" | "cursor" | "copilot" | "gemini" | "windsurf" | "cline" | "roo" | "aider";

export interface DerivationResult {
  tool: ToolName | "agents-md";
  /** Absolute path to the file. */
  path: string;
  written: boolean;
  customBlocksPreserved: number;
  /** true when dryRun is enabled — file was not written. */
  skipped?: boolean;
  error?: string;
}

export interface DeriveAllOptions {
  projectPath: string;
  agentsMdContent: string;
  metadata: ProjectMetadata;
  /** Tools to derive. Defaults to all six. */
  tools?: ToolName[];
  dryRun?: boolean;
  /** @default true */
  preserveCustom?: boolean;
}

export const ALL_TOOLS: ToolName[] = ["claude", "cursor", "copilot", "gemini", "windsurf", "cline", "roo", "aider"];

// ---------------------------------------------------------------------------
// Tool → file-path mapping
// ---------------------------------------------------------------------------

export function toolPath(projectPath: string, tool: ToolName): string {
  switch (tool) {
    case "claude":
      return path.join(projectPath, "CLAUDE.md");
    case "cursor":
      return path.join(projectPath, ".cursorrules");
    case "copilot":
      return path.join(projectPath, ".github", "copilot-instructions.md");
    case "gemini":
      return path.join(projectPath, "GEMINI.md");
    case "windsurf":
      return path.join(projectPath, ".windsurfrules");
    case "cline":
      return path.join(projectPath, ".clinerules");
    case "roo":
      return path.join(projectPath, ".roomodes");
    case "aider":
      return path.join(projectPath, "CONVENTIONS.md");
  }
}

// ---------------------------------------------------------------------------
// Per-tool content generation
// ---------------------------------------------------------------------------

async function deriveContent(
  tool: ToolName,
  options: DeriveAllOptions,
): Promise<string> {
  const { projectPath, agentsMdContent, metadata, preserveCustom = true } = options;
  const shared = { projectPath, agentsMdContent, metadata, preserveCustom };

  switch (tool) {
    case "claude":
      return deriveClaudeMd(shared);
    case "cursor":
      return deriveCursorRules(shared);
    case "copilot":
      return deriveCopilotInstructions(shared);
    case "gemini":
      return deriveGeminiMd(shared);
    case "windsurf":
      return deriveWindsurfRules(shared);
    case "cline":
      return deriveClineRules(shared);
    case "roo":
      return deriveRooModes(shared);
    case "aider":
      return deriveAiderConventions(shared);
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Runs all (or selected) derivers and writes the results.
 *
 * AGENTS.md is always written first as the canonical source file.
 * Per-tool errors are caught and returned as `{ error }` entries — one
 * failing tool does not abort the others.
 */
export async function deriveAll(options: DeriveAllOptions): Promise<DerivationResult[]> {
  const {
    projectPath,
    agentsMdContent,
    tools = ALL_TOOLS,
    dryRun = false,
  } = options;

  const results: DerivationResult[] = [];

  // --- Always write AGENTS.md (canonical) --------------------------------
  const agentsMdPath = path.join(projectPath, "AGENTS.md");
  try {
    if (!dryRun) {
      await writeFileAtomic(agentsMdPath, agentsMdContent);
    }
    results.push({
      tool: "agents-md",
      path: agentsMdPath,
      written: !dryRun,
      customBlocksPreserved: 0,
      skipped: dryRun || undefined,
    });
  } catch (e) {
    results.push({
      tool: "agents-md",
      path: agentsMdPath,
      written: false,
      customBlocksPreserved: 0,
      error: toMcpError(e),
    });
  }

  // --- Derive and write each tool file ------------------------------------
  for (const tool of tools) {
    const filePath = toolPath(projectPath, tool);

    try {
      const content = await deriveContent(tool, options);
      const customBlocksPreserved = extractCustomBlocks(content).length;

      if (dryRun) {
        results.push({
          tool,
          path: filePath,
          written: false,
          customBlocksPreserved,
          skipped: true,
        });
        continue;
      }

      await writeFileAtomic(filePath, content);

      results.push({
        tool,
        path: filePath,
        written: true,
        customBlocksPreserved,
      });
    } catch (e) {
      results.push({
        tool,
        path: filePath,
        written: false,
        customBlocksPreserved: 0,
        error: toMcpError(e),
      });
    }
  }

  return results;
}
