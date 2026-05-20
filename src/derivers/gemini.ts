import path from "node:path";
import type { ProjectMetadata } from "../extractor/schema.js";
import { injectCustomBlocks, loadExistingCustomBlocks, loadUnmanagedFileAsCustomBlock } from "./merger.js";

export interface GeminiDerivationOptions {
  projectPath: string;
  agentsMdContent: string;
  metadata: ProjectMetadata;
  /** @default true */
  preserveCustom?: boolean;
}

const GEMINI_SECTION = `---

## Gemini CLI Notes

> This file is managed by agents-sync. Edit \`AGENTS.md\` and run \`/agents-sync sync\`.

### Re-sync
Run \`agents-sync sync\` after major refactors, new dependencies, or architecture changes.
`;

/**
 * Derives the full content for GEMINI.md.
 *
 * Content = canonical AGENTS.md + Gemini CLI-specific section.
 * If preserveCustom is true (default) any existing custom blocks from the
 * current GEMINI.md are appended after the generated body.
 *
 * Does NOT write the file — the caller is responsible for writing.
 */
export async function deriveGeminiMd(options: GeminiDerivationOptions): Promise<string> {
  const { projectPath, agentsMdContent, preserveCustom = true } = options;

  const generated = `${agentsMdContent.trimEnd()}\n\n${GEMINI_SECTION}`;

  if (!preserveCustom) return generated;

  const geminiPath = path.join(projectPath, "GEMINI.md");
  const existingBlocks = await loadExistingCustomBlocks(geminiPath);
  const blocks = existingBlocks.length > 0
    ? existingBlocks
    : await loadUnmanagedFileAsCustomBlock(geminiPath);

  return injectCustomBlocks(generated, blocks);
}
