import path from "node:path";
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

// ─── Corpus-derived metadata (no API call) ───────────────────────────────────

/**
 * Builds a ProjectMetadata object from scanner corpus data without calling Claude.
 * Used by the single-call pipeline and template path to supply metadata for
 * skill recommendations, snapshot language/framework fields, and applyConfig.
 */
export function metadataFromCorpus(corpus: RawCorpus, projectPath: string): ProjectMetadata {
  const { manifest, structure } = corpus;
  const allDeps = [...manifest.dependencies, ...manifest.devDependencies].map((d) => d.toLowerCase());

  return {
    project: {
      name: manifest.projectName ?? path.basename(projectPath),
      description: "",
      language: manifest.language,
      framework: manifest.framework ?? undefined,
    },
    stack: {
      runtime: manifest.runtime ?? undefined,
      database: inferDatabase(allDeps),
      auth: inferAuth(allDeps),
      testing: inferTesting(allDeps, manifest.scripts),
      deploy: inferDeploy(allDeps, manifest.scripts),
      other: inferOtherStack(allDeps),
    },
    architecture: {
      keyDirs: {},
      entryPoints: structure.entryPoints,
    },
    conventions: [],
    gotchas: [],
    boundaries: { alwaysDo: [], askFirst: [], never: [] },
    testing: {
      framework: inferTesting(allDeps, manifest.scripts),
      command: manifest.scripts?.test,
    },
    deployment: {
      notes: [],
    },
  };
}

function inferDatabase(deps: string[]): string | undefined {
  if (deps.some((d) => d.includes("prisma"))) return "postgresql via prisma";
  if (deps.some((d) => d.includes("drizzle"))) return "sqlite via drizzle";
  if (deps.some((d) => d.includes("mongoose"))) return "mongodb via mongoose";
  if (deps.some((d) => d === "pg" || d === "postgres" || d === "@types/pg")) return "postgresql";
  if (deps.some((d) => d === "mysql2" || d === "mysql")) return "mysql";
  if (deps.some((d) => d === "better-sqlite3" || d === "sqlite3")) return "sqlite";
  if (deps.some((d) => d.includes("typeorm"))) return "database via typeorm";
  if (deps.some((d) => d.includes("sequelize"))) return "database via sequelize";
  if (deps.some((d) => d.includes("supabase"))) return "postgresql via supabase";
  return undefined;
}

function inferAuth(deps: string[]): string | undefined {
  if (deps.some((d) => d.includes("next-auth") || d.includes("nextauth"))) return "next-auth";
  if (deps.some((d) => d.includes("@auth/") || d.includes("auth.js"))) return "auth.js";
  if (deps.some((d) => d.includes("passport"))) return "passport.js";
  if (deps.some((d) => d.includes("clerk"))) return "clerk";
  if (deps.some((d) => d.includes("lucia"))) return "lucia-auth";
  if (deps.some((d) => d.includes("better-auth"))) return "better-auth";
  if (deps.some((d) => d === "jsonwebtoken" || d === "jose")) return "jwt";
  if (deps.some((d) => d.includes("supabase"))) return "supabase auth";
  if (deps.some((d) => d.includes("firebase"))) return "firebase auth";
  return undefined;
}

function inferTesting(deps: string[], scripts?: Record<string, string>): string | undefined {
  if (deps.some((d) => d.startsWith("vitest"))) return "vitest";
  if (deps.some((d) => d === "jest" || d === "@types/jest" || d.startsWith("jest-"))) return "jest";
  if (deps.some((d) => d === "mocha" || d === "@types/mocha")) return "mocha";
  if (deps.some((d) => d === "ava")) return "ava";
  if (deps.some((d) => d.startsWith("pytest") || d === "py.test")) return "pytest";
  if (scripts?.test?.includes("cargo test")) return "cargo test";
  if (scripts?.test?.includes("go test")) return "go test";
  return undefined;
}

function inferDeploy(deps: string[], scripts?: Record<string, string>): string | undefined {
  if (deps.some((d) => d.includes("@vercel/") || d.includes("vercel"))) return "vercel";
  if (deps.some((d) => d.includes("netlify"))) return "netlify";
  if (deps.some((d) => d.includes("railway"))) return "railway";
  if (deps.some((d) => d.includes("fly"))) return "fly.io";
  if (deps.some((d) => d.includes("serverless"))) return "serverless";
  if (scripts?.deploy?.includes("docker")) return "docker";
  if (scripts?.deploy?.includes("heroku")) return "heroku";
  return undefined;
}

function inferOtherStack(deps: string[]): string[] {
  const notable: string[] = [];
  const checks: [string, string][] = [
    ["stripe", "stripe"],
    ["openai", "openai"],
    ["anthropic", "anthropic"],
    ["redis", "redis"],
    ["bull", "bullmq"],
    ["socket.io", "socket.io"],
    ["@trpc/", "trpc"],
    ["graphql", "graphql"],
    ["zod", "zod"],
    ["tailwind", "tailwindcss"],
  ];
  for (const [pattern, label] of checks) {
    if (deps.some((d) => d.includes(pattern))) notable.push(label);
  }
  return notable;
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
