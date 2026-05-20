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

interface SkillRec { slug: string; reason: string }

function recommendSkills(metadata: ProjectMetadata): SkillRec[] {
  const recs: SkillRec[] = [];
  const { project, stack, testing } = metadata;
  const lang = project.language.toLowerCase();
  const fw = (project.framework ?? "").toLowerCase();
  const testFw = (testing.framework ?? stack.testing ?? "").toLowerCase();
  const db = (stack.database ?? "").toLowerCase();
  const auth = (stack.auth ?? "").toLowerCase();
  const deploy = (stack.deploy ?? stack.deploy ?? "").toLowerCase();

  // Universal
  recs.push({ slug: "agent-skills:spec-driven-development", reason: "requirements before code" });

  // Testing
  if (testFw || testing.command) {
    recs.push({ slug: "agent-skills:test-driven-development", reason: `${testFw || "tests"} workflow` });
  }

  // Frontend
  if (/next|react|vue|svelte|solid|nuxt|remix|astro/.test(fw)) {
    recs.push({ slug: "agent-skills:frontend-ui-engineering", reason: `${fw} UI work` });
  }

  // API / backend
  if (/express|fastify|hono|django|fastapi|flask|axum|gin|echo/.test(fw) || /api|server|backend/.test(project.description?.toLowerCase() ?? "")) {
    recs.push({ slug: "agent-skills:api-and-interface-design", reason: "API design" });
  }

  // Security-sensitive
  if (auth || /payment|stripe|billing|oauth|jwt|session/.test([db, stack.other.join(" ")].join(" ").toLowerCase())) {
    recs.push({ slug: "agent-skills:security-and-hardening", reason: "auth/payments in stack" });
  }

  // Observability — deploy target present
  if (deploy) {
    recs.push({ slug: "agent-skills:observability-and-monitoring", reason: `${deploy} deployment` });
  }

  // TypeScript-specific
  if (lang === "typescript") {
    recs.push({ slug: "agent-skills:code-review-and-quality", reason: "TypeScript quality gates" });
  }

  // Deduplicate by slug
  const seen = new Set<string>();
  return recs.filter((r) => {
    if (seen.has(r.slug)) return false;
    seen.add(r.slug);
    return true;
  });
}

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
  const { projectPath, agentsMdContent, metadata, preserveCustom = true } = options;

  const skillsSummary = await scanProjectSkills(projectPath);
  const skillsSection = formatSkillsSection(skillsSummary);
  const skillsBlock = skillsSection ? `\n${skillsSection}\n` : "";

  const recs = recommendSkills(metadata);
  const recsBlock = recs.length > 0
    ? `\n## Recommended Skills\n\n${recs.map((r) => `- \`/${r.slug}\` — ${r.reason}`).join("\n")}\n`
    : "";

  const generated = `${agentsMdContent.trimEnd()}${skillsBlock}${recsBlock}\n${CLAUDE_CODE_SECTION}`;

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
