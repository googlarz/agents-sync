/**
 * agents-sync derive
 *
 * Re-derives all tool files from the current AGENTS.md without re-running
 * the scanner or calling the Claude API. Useful after manually editing AGENTS.md.
 */
import path from "node:path";
import { assertProjectDir, readFileSafe } from "../lib/file-utils.js";
import { AgentsSyncError } from "../lib/errors.js";
import { loadSnapshot } from "../snapshot/writer.js";
import { deriveAll, type ToolName } from "../derivers/index.js";
import type { ProjectMetadata } from "../extractor/schema.js";

export interface DeriveOptions {
  projectPath: string;
  tools?: ToolName[];
  dryRun?: boolean;
}

export interface DeriveResult {
  success: boolean;
  filesUpdated: { tool: string; path: string }[];
  customSectionsPreserved: number;
  warnings: string[];
  dryRun: boolean;
}

export async function runDerive(options: DeriveOptions): Promise<DeriveResult> {
  const { projectPath, tools, dryRun = false } = options;
  await assertProjectDir(projectPath);

  const agentsMdPath = path.join(projectPath, "AGENTS.md");
  const agentsMd = await readFileSafe(agentsMdPath);
  if (!agentsMd) {
    throw new AgentsSyncError(
      "NO_SNAPSHOT",
      "AGENTS.md not found.",
      "Run /agents-sync init first to generate AGENTS.md.",
    );
  }

  // Load snapshot for language/framework metadata — fall back to stubs if absent
  const snapshot = await loadSnapshot(projectPath);
  const stubMetadata: ProjectMetadata = {
    project: {
      name: path.basename(projectPath),
      description: "",
      language: snapshot?.meta.language ?? "unknown",
      framework: snapshot?.meta.framework ?? undefined,
    },
    stack: { other: [] },
    architecture: { keyDirs: {}, entryPoints: [] },
    conventions: [],
    gotchas: [],
    boundaries: { alwaysDo: [], askFirst: [], never: [] },
    testing: {},
    deployment: { notes: [] },
  };

  const derivations = await deriveAll({
    projectPath,
    agentsMdContent: agentsMd,
    metadata: stubMetadata,
    tools,
    dryRun,
  });

  const warnings: string[] = [];
  if (!snapshot) {
    warnings.push("No snapshot found — language/framework metadata unavailable. Run init for richer output.");
  }
  for (const d of derivations) {
    if (d.error) warnings.push(`${d.tool}: ${d.error}`);
  }

  return {
    success: true,
    filesUpdated: derivations.filter((d) => !d.error && d.tool !== "agents-md").map((d) => ({ tool: d.tool, path: d.path })),
    customSectionsPreserved: derivations.reduce((s, d) => s + (d.customBlocksPreserved ?? 0), 0),
    warnings,
    dryRun,
  };
}
