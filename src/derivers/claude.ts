import path from "node:path";
import type { ProjectMetadata } from "../extractor/schema.js";
import { injectCustomBlocks, loadExistingCustomBlocks, loadUnmanagedFileAsCustomBlock } from "./merger.js";
import { scanProjectSkills, formatSkillsSection } from "../scanner/skills.js";

export interface ClaudeDerivationOptions {
  projectPath: string;
  agentsMdContent: string;
  metadata: ProjectMetadata;
  /** @default true */
  preserveCustom?: boolean;
}

const CLAUDE_CODE_SECTION = `---

## Claude Code Notes

> This file is managed by agents-sync. Edit \`AGENTS.md\` and run \`/agents-sync sync\`.

### Tool Files
- Canonical: \`AGENTS.md\`
- Cursor: \`.cursorrules\`
- Copilot: \`.github/copilot-instructions.md\`

### Re-sync
Run \`/agents-sync sync\` after major refactors, new dependencies, or architecture changes.
Run \`/agents-sync drift\` to check what's changed since last sync.
`;

/**
 * Derives the full content for CLAUDE.md.
 *
 * Content = canonical AGENTS.md + Claude Code-specific section.
 * If preserveCustom is true (default) any existing custom blocks from the
 * current CLAUDE.md are appended after the generated body.
 *
 * Does NOT write the file — the caller is responsible for writing.
 */
export async function deriveClaudeMd(options: ClaudeDerivationOptions): Promise<string> {
  const { projectPath, agentsMdContent, preserveCustom = true } = options;

  const skillsSummary = await scanProjectSkills(projectPath);
  const skillsSection = formatSkillsSection(skillsSummary);
  const skillsBlock = skillsSection ? `\n${skillsSection}\n` : "";

  const generated = `${agentsMdContent.trimEnd()}${skillsBlock}\n${CLAUDE_CODE_SECTION}`;

  if (!preserveCustom) return generated;

  const claudeMdPath = path.join(projectPath, "CLAUDE.md");
  // Preserve managed custom blocks first; fall back to wrapping the whole
  // file if it exists but was never managed by agents-sync.
  const existingBlocks = await loadExistingCustomBlocks(claudeMdPath);
  const blocks = existingBlocks.length > 0
    ? existingBlocks
    : await loadUnmanagedFileAsCustomBlock(claudeMdPath);

  return injectCustomBlocks(generated, blocks);
}
