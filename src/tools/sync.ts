import path from "node:path";
import { assertProjectDir, readFileSafe, writeFileAtomic } from "../lib/file-utils.js";
import { AgentsSyncError } from "../lib/errors.js";
import type { ProjectMetadata } from "../extractor/schema.js";
import { scan } from "../scanner/index.js";
import { extractMetadata } from "../extractor/extractor.js";
import { generateAgentsMd, appendMcpSection } from "../generator/agents-md.js";
import { validateAgentsMd } from "../generator/validator.js";
import { deriveAll, type ToolName } from "../derivers/index.js";
import { buildSnapshot, loadSnapshot, saveSnapshot, sha256 } from "../snapshot/writer.js";
import { detectDrift } from "../snapshot/drift.js";
import type { ManagedFile } from "../snapshot/schema.js";
import { loadConfig, applyConfig } from "../config/loader.js";

export interface SyncOptions {
  projectPath: string;
  tools?: ToolName[];
  fast?: boolean;    // skip re-extraction if only low drift
  dryRun?: boolean;
  /** Path to a repomix output file to use as source corpus instead of filesystem sampling. */
  repomixOutput?: string;
}

export interface SyncResult {
  success: boolean;
  filesUpdated: { tool: string; path: string }[];
  customSectionsPreserved: number;
  warnings: string[];
  skippedExtraction: boolean;
  dryRun: boolean;
}

export async function runSync(options: SyncOptions): Promise<SyncResult> {
  const { projectPath, tools, fast = false, dryRun = false, repomixOutput } = options;
  await assertProjectDir(projectPath);

  // 1. Load team config (agents-sync.config.json) — non-fatal if missing
  const config = await loadConfig(projectPath);

  // 2. Resolve effective tool list: CLI flag > config > default (all)
  const effectiveTools = tools ?? (config?.tools as ToolName[] | undefined);

  // 3. Scan always (optionally using repomix output as source corpus)
  const corpus = await scan(projectPath, { repomixPath: repomixOutput });

  // 2. Fast mode: check drift, skip extraction if only LOW signals
  let skipExtraction = false;
  if (fast) {
    const snapshot = await loadSnapshot(projectPath);
    if (snapshot) {
      const drift = detectDrift(snapshot, corpus);
      if (drift.maxSeverity === "LOW" || drift.maxSeverity === "NONE") {
        skipExtraction = true;
      }
    }
  }

  let agentsMd: string;

  if (skipExtraction) {
    // Use existing AGENTS.md
    const existing = await readFileSafe(path.join(projectPath, "AGENTS.md"));
    if (!existing) {
      throw new AgentsSyncError(
        "NO_SNAPSHOT",
        "No existing AGENTS.md found. Cannot use --fast on first run.",
        "Run /agents-sync init first.",
      );
    }
    agentsMd = existing;
  } else {
    // Full re-extraction
    const rawMetadata = await extractMetadata(corpus);
    const metadata = applyConfig(rawMetadata, config);
    agentsMd = appendMcpSection(await generateAgentsMd(metadata), corpus.mcp);
    const validation = validateAgentsMd(agentsMd, corpus.structure.topLevelDirs);

    if (!dryRun) {
      await writeFileAtomic(path.join(projectPath, "AGENTS.md"), agentsMd);
    }

    // Derive all tool files
    const derivations = await deriveAll({
      projectPath,
      agentsMdContent: agentsMd,
      metadata,
      tools: effectiveTools,
      dryRun,
    });

    const warnings: string[] = [...validation.warnings];
    for (const d of derivations) {
      if (d.error) warnings.push(`${d.tool}: ${d.error}`);
    }

    if (!dryRun) {
      const manifestContent = corpus.manifest.dependencies.join("\n");
      const managed: ManagedFile[] = derivations
        .filter((d) => d.written)
        .map((d) => ({ tool: d.tool as ManagedFile["tool"], path: d.path, sha256: sha256("") }));

      const snapshot = buildSnapshot({
        projectPath,
        manifestContent,
        structureHash: sha256(corpus.structure.topLevelDirs.join(",")),
        filesManaged: [
          { tool: "agents-md", path: path.join(projectPath, "AGENTS.md"), sha256: sha256(agentsMd) },
          ...managed,
        ],
        language: metadata.project.language,
        framework: metadata.project.framework ?? null,
        topLevelDirs: corpus.structure.topLevelDirs,
        dependencyCount: corpus.manifest.dependencies.length,
        totalFiles: corpus.structure.totalFileCount,
      });
      await saveSnapshot(snapshot);
    }

    return {
      success: true,
      filesUpdated: derivations.filter((d) => !d.error).map((d) => ({ tool: d.tool, path: d.path })),
      customSectionsPreserved: derivations.reduce((s, d) => s + (d.customBlocksPreserved ?? 0), 0),
      warnings,
      skippedExtraction: false,
      dryRun,
    };
  }

  // Fast path: just re-derive from existing AGENTS.md using stub metadata
  const fastSnapshot = await loadSnapshot(projectPath);
  if (!fastSnapshot) {
    throw new AgentsSyncError("NO_SNAPSHOT", "No snapshot found. Run /agents-sync init first.");
  }

  const stubMetadata: ProjectMetadata = {
    project: {
      name: path.basename(projectPath),
      description: "",
      language: fastSnapshot.meta.language,
      framework: fastSnapshot.meta.framework ?? undefined,
    },
    stack: { other: [] },
    architecture: { keyDirs: {}, entryPoints: [] },
    conventions: [],
    gotchas: [],
    boundaries: { alwaysDo: [], askFirst: [], never: [] },
    testing: {},
    deployment: { notes: [] },
  };

  const derivations = await deriveAll({ projectPath, agentsMdContent: agentsMd, metadata: stubMetadata, tools: effectiveTools, dryRun });

  return {
    success: true,
    filesUpdated: derivations.filter((d) => !d.error).map((d) => ({ tool: d.tool, path: d.path })),
    customSectionsPreserved: derivations.reduce((s, d) => s + (d.customBlocksPreserved ?? 0), 0),
    warnings: ["Fast mode: used cached metadata (no Claude API call)"],
    skippedExtraction: true,
    dryRun,
  };
}
