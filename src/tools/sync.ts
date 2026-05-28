import path from "node:path";
import { assertProjectDir, readFileSafe, writeFileAtomic } from "../lib/file-utils.js";
import { AgentsSyncError } from "../lib/errors.js";
import { scan } from "../scanner/index.js";
import { metadataFromCorpus } from "../extractor/extractor.js";
import { generateAgentsMdDirect, appendMcpSection, appendCodegraphSection } from "../generator/agents-md.js";
import { generateFromTemplate } from "../templates/index.js";
import { validateAgentsMd } from "../generator/validator.js";
import { deriveAll, type ToolName } from "../derivers/index.js";
import { buildSnapshot, loadSnapshot, saveSnapshot, sha256 } from "../snapshot/writer.js";
import { detectDrift } from "../snapshot/drift.js";
import type { ManagedFile } from "../snapshot/schema.js";
import { loadConfig, applyConfig } from "../config/loader.js";
import { withSpinner } from "../lib/spinner.js";

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
  /** Per-tool previews — populated only when dryRun is true. */
  toolPreviews?: { tool: string; path: string; preview: string }[];
}

export async function runSync(options: SyncOptions): Promise<SyncResult> {
  const { projectPath, tools, fast = false, dryRun = false, repomixOutput } = options;
  await assertProjectDir(projectPath);

  // 1. Load team config (agents-sync.config.json) — non-fatal if missing
  const config = await loadConfig(projectPath);

  // 2. Resolve effective tool list: CLI flag > config > default (all)
  const effectiveTools = tools ?? (config?.tools as ToolName[] | undefined);

  // 3. Scan always (optionally using repomix output as source corpus)
  process.stderr.write("agents-sync: scanning codebase…\n");
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
    // Full re-generation — single Claude call, or template if no API key
    let rawAgentsMd: string;
    let rawMetadata: ReturnType<typeof metadataFromCorpus>;

    if (process.env.ANTHROPIC_API_KEY) {
      rawAgentsMd = await withSpinner("generating with Claude…", () => generateAgentsMdDirect(corpus));
      rawMetadata = metadataFromCorpus(corpus, projectPath);
    } else {
      const tpl = generateFromTemplate(corpus, projectPath);
      rawAgentsMd = tpl.agentsMd;
      rawMetadata = tpl.metadata;
      process.stderr.write(`agents-sync: no API key — generated from ${tpl.templateUsed} template\n`);
      process.stderr.write(`  Add ANTHROPIC_API_KEY for AI-powered output: export ANTHROPIC_API_KEY=sk-ant-...\n`);
    }

    const metadata = applyConfig(rawMetadata, config);
    agentsMd = appendCodegraphSection(appendMcpSection(rawAgentsMd, corpus.mcp), corpus.codegraph);
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
        .map((d) => ({ tool: d.tool as ManagedFile["tool"], path: d.path, sha256: d.contentHash ?? sha256("") }));

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
      toolPreviews: dryRun
        ? derivations.filter((d) => !d.error && d.dryRunPreview).map((d) => ({ tool: d.tool as string, path: d.path, preview: d.dryRunPreview! }))
        : undefined,
    };
  }

  // Fast path: just re-derive from existing AGENTS.md using stub metadata
  const fastSnapshot = await loadSnapshot(projectPath);
  if (!fastSnapshot) {
    throw new AgentsSyncError("NO_SNAPSHOT", "No snapshot found. Run /agents-sync init first.");
  }

  // Build corpus-derived metadata for fast path (no API call)
  const stubMetadata = metadataFromCorpus(corpus, projectPath);

  // Always refresh MCP and codegraph sections — local, free, no API call
  agentsMd = appendCodegraphSection(appendMcpSection(agentsMd, corpus.mcp), corpus.codegraph);

  process.stderr.write(`agents-sync: ⚡ fast mode — drift is LOW, skipped re-extraction (no Claude API call)\n`);

  const derivations = await deriveAll({ projectPath, agentsMdContent: agentsMd, metadata: stubMetadata, tools: effectiveTools, dryRun });

  // Update syncedAt so daysSinceSync stays accurate after fast syncs
  if (!dryRun) {
    await saveSnapshot({ ...fastSnapshot, syncedAt: new Date().toISOString() });
  }

  return {
    success: true,
    filesUpdated: derivations.filter((d) => !d.error).map((d) => ({ tool: d.tool, path: d.path })),
    customSectionsPreserved: derivations.reduce((s, d) => s + (d.customBlocksPreserved ?? 0), 0),
    warnings: ["Fast mode: drift is LOW — used cached metadata (no Claude API call)"],
    skippedExtraction: true,
    dryRun,
    toolPreviews: dryRun
      ? derivations.filter((d) => !d.error && d.dryRunPreview).map((d) => ({ tool: d.tool as string, path: d.path, preview: d.dryRunPreview! }))
      : undefined,
  };
}
