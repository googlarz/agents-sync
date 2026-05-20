import path from "node:path";
import type { ProjectMetadata } from "../extractor/schema.js";
import { injectCustomBlocks, loadExistingCustomBlocks } from "./merger.js";

export interface CopilotDerivationOptions {
  projectPath: string;
  agentsMdContent: string;
  metadata: ProjectMetadata;
  /** @default true */
  preserveCustom?: boolean;
}

// ---------------------------------------------------------------------------
// Framework-specific hints
// ---------------------------------------------------------------------------

/**
 * Maps known framework names to inline code-generation hints.
 * Keeps it short — only things that meaningfully affect completion quality.
 */
const FRAMEWORK_HINTS: Record<string, string> = {
  nextjs: "prefer Server Components; use `'use client'` only when necessary",
  "next.js": "prefer Server Components; use `'use client'` only when necessary",
  react: "functional components only; hooks over class components",
  django: "use async views where possible; prefer class-based views for CRUD",
  fastapi: "async endpoints; pydantic models for all request/response shapes",
  express: "async route handlers; centralise error handling via middleware",
  axum: "use `#[axum::debug_handler]` during development; prefer extractors",
  flask: "use blueprints; prefer `current_app` over global state",
  nuxt: "use `<script setup lang='ts'>`; prefer composables over options API",
  vue: "use Composition API with `<script setup>`; TypeScript by default",
  angular: "standalone components preferred; inject via `inject()` function",
  svelte: "prefer `$state` runes (Svelte 5); avoid legacy reactive statements",
  remix: "loaders and actions for all data; avoid client-side fetching",
  nestjs: "dependency injection everywhere; DTOs with class-validator decorators",
};

function frameworkHint(framework?: string): string | null {
  if (!framework) return null;
  const key = framework.toLowerCase();
  return FRAMEWORK_HINTS[key] ?? null;
}

// ---------------------------------------------------------------------------
// Parsing helpers (minimal — only what copilot needs)
// ---------------------------------------------------------------------------

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

// ---------------------------------------------------------------------------
// Convention filters — keep only lines relevant to code-level suggestions
// ---------------------------------------------------------------------------

const CODE_LEVEL_KEYWORDS = [
  "import",
  "export",
  "naming",
  "filename",
  "file name",
  "type",
  "interface",
  "async",
  "await",
  "module",
  "esm",
  "cjs",
  "require",
  "class",
  "function",
  "const ",
  "let ",
  "var ",
  "enum",
  "generic",
  "zod",
  "schema",
  "validation",
  "null",
  "undefined",
  "error",
  "throw",
  "return",
  "comment",
  "doc",
  "format",
  "lint",
];

function isCodeLevel(rule: string): boolean {
  const lower = rule.toLowerCase();
  return CODE_LEVEL_KEYWORDS.some((kw) => lower.includes(kw));
}

// ---------------------------------------------------------------------------
// Deriver
// ---------------------------------------------------------------------------

/**
 * Derives `.github/copilot-instructions.md` content from AGENTS.md + metadata.
 * Focuses strictly on inline code-generation context — target < 300 words.
 *
 * Does NOT write the file — the caller is responsible for writing.
 */
export async function deriveCopilotInstructions(
  options: CopilotDerivationOptions,
): Promise<string> {
  const { projectPath, agentsMdContent, metadata, preserveCustom = true } = options;

  const { project, stack, conventions: metaConventions, boundaries, testing } = metadata;

  // Code-level conventions only
  const codeLevelConventions = metaConventions.filter(isCodeLevel);

  // "Never" rules that directly affect code generation (short enough to fit)
  const neverLines = sectionToLines(extractSubSection(agentsMdContent, "Never"));
  const codeNever = [...boundaries.never, ...neverLines]
    .filter(isCodeLevel)
    .slice(0, 6); // hard cap to stay under word budget

  const lines: string[] = [];

  // Header
  lines.push("# GitHub Copilot Instructions — managed by agents-sync");
  lines.push("");

  // Language + framework
  const fwPart = project.framework ? ` / ${project.framework}` : "";
  lines.push(`**Stack:** ${project.language}${fwPart}${stack.runtime ? ` (${stack.runtime})` : ""}`);
  lines.push("");

  // Framework-specific hint
  const hint = frameworkHint(project.framework);
  if (hint) {
    lines.push(`**Framework:** ${hint}`);
    lines.push("");
  }

  // Import style — derive from conventions or fall back to language default
  const importConvention = metaConventions.find(
    (c) => c.toLowerCase().includes("import") || c.toLowerCase().includes("esm") || c.toLowerCase().includes("require"),
  );
  if (importConvention) {
    lines.push(`**Imports:** ${importConvention}`);
    lines.push("");
  }

  // Test location / naming
  if (testing.location || testing.command) {
    const testParts: string[] = [];
    if (testing.location) testParts.push(`location: ${testing.location}`);
    if (testing.command) testParts.push(`run: \`${testing.command}\``);
    lines.push(`**Tests:** ${testParts.join(" · ")}`);
    lines.push("");
  }

  // Code-level conventions
  if (codeLevelConventions.length > 0) {
    lines.push("## Conventions");
    for (const rule of codeLevelConventions) {
      lines.push(`- ${rule}`);
    }
    lines.push("");
  }

  // Hard never rules (code-affecting)
  if (codeNever.length > 0) {
    lines.push("## Never");
    for (const rule of codeNever) {
      lines.push(`- ${rule}`);
    }
    lines.push("");
  }

  const generated = lines.join("\n").trimEnd() + "\n";

  if (!preserveCustom) return generated;

  const copilotPath = path.join(projectPath, ".github", "copilot-instructions.md");
  const existingBlocks = await loadExistingCustomBlocks(copilotPath);

  return injectCustomBlocks(generated, existingBlocks);
}
