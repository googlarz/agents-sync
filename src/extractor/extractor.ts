import { callClaude } from "../lib/claude-client.js";
import { AgentsSyncError } from "../lib/errors.js";
import { type ProjectMetadata, ProjectMetadataSchema } from "./schema.js";
import type { RawCorpus } from "../scanner/index.js";
import { formatCodegraphContext } from "../scanner/codegraph.js";

const SYSTEM_PROMPT = `You are a code analyst. Your job is to extract factual information about a software project from the files provided.

Rules:
- Extract ONLY concrete facts you can observe in the provided files
- NEVER hallucinate framework names, directories, or conventions you cannot see
- If you are not certain about a field, omit it entirely
- Conventions must be specific: "kebab-case filenames" not "follow best practices"
- Gotchas must include the consequence: "Do X or Y will happen"
- Return ONLY valid JSON matching the schema — no markdown, no explanation

Schema:
{
  "project": { "name", "description", "language", "framework?", "version?" },
  "stack": { "runtime?", "database?", "auth?", "testing?", "deploy?", "other": [] },
  "architecture": { "style?", "keyDirs": {}, "entryPoints": [] },
  "conventions": [],
  "gotchas": [],
  "boundaries": { "alwaysDo": [], "askFirst": [], "never": [] },
  "testing": { "framework?", "command?", "location?", "coverageCommand?" },
  "deployment": { "target?", "command?", "envFile?", "notes": [] }
}`;

export async function extractMetadata(corpus: RawCorpus): Promise<ProjectMetadata> {
  const userPrompt = buildPrompt(corpus);

  for (let attempt = 1; attempt <= 2; attempt++) {
    const { content } = await callClaude(SYSTEM_PROMPT, userPrompt, 2048);

    try {
      const raw = extractJson(content);
      return ProjectMetadataSchema.parse(raw);
    } catch {
      if (attempt === 2) {
        throw new AgentsSyncError(
          "EXTRACTION_FAILED",
          "Failed to extract valid project metadata after 2 attempts.",
          "Run with AGENTS_SYNC_DEBUG=1 to see Claude's raw output.",
        );
      }
      // Retry with correction hint appended to next call
      const retryPrompt = `${userPrompt}\n\nYour previous output was not valid JSON. Output ONLY the JSON object, no other text.`;
      const { content: retryContent } = await callClaude(SYSTEM_PROMPT, retryPrompt, 2048);
      try {
        const raw = extractJson(retryContent);
        return ProjectMetadataSchema.parse(raw);
      } catch {
        throw new AgentsSyncError(
          "EXTRACTION_FAILED",
          "Failed to extract valid project metadata after 2 attempts.",
          "Run with AGENTS_SYNC_DEBUG=1 to see Claude's raw output.",
        );
      }
    }
  }

  // TypeScript requires this but it's unreachable
  throw new AgentsSyncError("EXTRACTION_FAILED", "Unexpected extraction failure.");
}

function extractJson(text: string): unknown {
  // Strip markdown code fences if present
  const stripped = text.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
  return JSON.parse(stripped);
}

function buildPrompt(corpus: RawCorpus): string {
  const sections: string[] = [];

  sections.push("=== MANIFEST / DEPENDENCIES ===");
  sections.push(`Language: ${corpus.manifest.language}`);
  if (corpus.manifest.framework) sections.push(`Detected framework: ${corpus.manifest.framework}`);
  if (corpus.manifest.runtime) sections.push(`Runtime: ${corpus.manifest.runtime}`);
  if (corpus.manifest.projectName) sections.push(`Project name: ${corpus.manifest.projectName}`);
  sections.push(`Dependencies (${corpus.manifest.dependencies.length}): ${corpus.manifest.dependencies.slice(0, 25).join(", ")}`);
  if (corpus.manifest.devDependencies.length > 0) {
    sections.push(`Dev deps: ${corpus.manifest.devDependencies.slice(0, 15).join(", ")}`);
  }
  if (Object.keys(corpus.manifest.scripts).length > 0) {
    sections.push(`Scripts: ${JSON.stringify(corpus.manifest.scripts)}`);
  }

  sections.push("\n=== PROJECT STRUCTURE ===");
  sections.push(`Top-level dirs: ${corpus.structure.topLevelDirs.join(", ")}`);
  sections.push(`Entry points: ${corpus.structure.entryPoints.join(", ") || "none detected"}`);
  sections.push(`Test dirs: ${corpus.structure.testDirs.join(", ") || "none detected"}`);
  sections.push(`Naming convention: ${corpus.structure.namingConvention}`);
  sections.push(`Total files: ~${corpus.structure.totalFileCount}`);
  sections.push(`\nDirectory tree:\n${corpus.structure.tree}`);

  if (corpus.source.files.length > 0) {
    sections.push("\n=== SAMPLED SOURCE FILES ===");
    sections.push(`Import style: ${corpus.source.importStyle}`);
    if (corpus.source.detectedPatterns.length > 0) {
      sections.push(`Detected patterns: ${corpus.source.detectedPatterns.join(", ")}`);
    }
    for (const f of corpus.source.files.slice(0, 10)) {
      sections.push(`\n--- ${f.path} ---`);
      sections.push(f.content.slice(0, 800));
    }
  }

  if (corpus.docs.readme) {
    sections.push("\n=== README ===");
    sections.push(corpus.docs.readme.slice(0, 1500));
  }
  if (corpus.docs.contributing) {
    sections.push("\n=== CONTRIBUTING ===");
    sections.push(corpus.docs.contributing.slice(0, 800));
  }
  if (corpus.docs.existingAgentsMd) {
    sections.push("\n=== EXISTING AGENTS.MD (use as baseline) ===");
    sections.push(corpus.docs.existingAgentsMd);
  }
  if (corpus.docs.existingClaudeMd) {
    sections.push("\n=== EXISTING CLAUDE.MD (extract unique conventions) ===");
    sections.push(corpus.docs.existingClaudeMd.slice(0, 1000));
  }

  if (corpus.gotchas.length > 0) {
    sections.push("\n=== GOTCHAS FOUND IN SOURCE (TODO/FIXME/HACK comments) ===");
    for (const g of corpus.gotchas) {
      sections.push(`${g.type} in ${g.file}:${g.line} — ${g.comment}`);
    }
  }

  if (corpus.codegraph?.available) {
    const cgContext = formatCodegraphContext(corpus.codegraph);
    if (cgContext) {
      sections.push("\n=== CODE GRAPH (structural analysis) ===");
      sections.push(cgContext);
    }
  }

  sections.push("\nNow extract the project metadata as JSON:");
  return sections.join("\n");
}
