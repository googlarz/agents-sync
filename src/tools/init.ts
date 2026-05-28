import path from "node:path";
import { assertProjectDir, readFileSafe, writeFileAtomic } from "../lib/file-utils.js";
import { scan } from "../scanner/index.js";
import { metadataFromCorpus } from "../extractor/extractor.js";
import { generateAgentsMdDirect, appendMcpSection, appendCodegraphSection } from "../generator/agents-md.js";
import { generateFromTemplate } from "../templates/index.js";
import { validateAgentsMd } from "../generator/validator.js";
import { deriveAll, type ToolName } from "../derivers/index.js";
import { buildSnapshot, saveSnapshot, sha256 } from "../snapshot/writer.js";
import type { ManagedFile } from "../snapshot/schema.js";
import { isManagedByAgentsSync, injectCustomBlocks } from "../derivers/merger.js";
import { loadConfig, applyConfig } from "../config/loader.js";
import { withSpinner } from "../lib/spinner.js";

export interface InitOptions {
  projectPath: string;
  tools?: ToolName[];
  dryRun?: boolean;
  /** Path to a repomix output file to use as source corpus instead of filesystem sampling. */
  repomixOutput?: string;
}

export interface InitResult {
  success: boolean;
  agentsMdPath: string;
  filesWritten: { tool: string; path: string }[];
  customSectionsPreserved: number;
  /** Files that existed before init and whose content was preserved as a custom block. */
  preservedExistingFiles: string[];
  tokenUsage: { input: number; output: number; cacheHit: number };
  warnings: string[];
  dryRun: boolean;
  /** First 40 lines of what AGENTS.md would contain — populated only when dryRun is true. */
  agentsMdPreview?: string;
  /** Per-tool previews — populated only when dryRun is true. */
  toolPreviews?: { tool: string; path: string; preview: string }[];
}

export async function runInit(options: InitOptions): Promise<InitResult> {
  const { projectPath, tools, dryRun = false, repomixOutput } = options;

  await assertProjectDir(projectPath);

  // 1. Scan (optionally using repomix output as source corpus)
  process.stderr.write("agents-sync: scanning codebase…\n");
  const corpus = await scan(projectPath, { repomixPath: repomixOutput });

  // 2. Load team config (agents-sync.config.json) — non-fatal if missing
  const config = await loadConfig(projectPath);

  // 3. Resolve effective tool list: CLI flag > config > default (all)
  const effectiveTools = tools ?? (config?.tools as ToolName[] | undefined);

  // 4. Generate AGENTS.md — single Claude call, or template if no API key
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

  // 5. Derive metadata from corpus (no extra API call) — used for skill recommendations + snapshot
  const metadata = applyConfig(rawMetadata, config);

  // 6. Append MCP section and codegraph section
  const agentsMd = appendCodegraphSection(appendMcpSection(rawAgentsMd, corpus.mcp), corpus.codegraph);

  // 7. Validate
  const validation = validateAgentsMd(agentsMd, corpus.structure.topLevelDirs);
  const warnings = [...validation.warnings];
  if (!validation.passed) {
    warnings.push(...validation.failures.map((f) => `Quality check: ${f}`));
  }

  // 7. Write AGENTS.md — preserve existing unmanaged content as custom block
  const agentsMdPath = path.join(projectPath, "AGENTS.md");
  const preservedExistingFiles: string[] = [];

  let agentsMdToWrite = agentsMd;
  const existingAgentsMd = await readFileSafe(agentsMdPath);
  if (existingAgentsMd && !isManagedByAgentsSync(existingAgentsMd)) {
    const block = `\n<!-- Pre-existing AGENTS.md content preserved by agents-sync -->\n${existingAgentsMd}\n`;
    agentsMdToWrite = injectCustomBlocks(agentsMd, [block]);
    preservedExistingFiles.push("AGENTS.md");
    warnings.push(
      "AGENTS.md existed before init and was not managed — previous content preserved as a custom section.",
    );
  }

  if (!dryRun) {
    await writeFileAtomic(agentsMdPath, agentsMdToWrite);
  }

  // 8. Derive tool files (each deriver handles its own overwrite protection)
  const derivations = await deriveAll({
    projectPath,
    agentsMdContent: agentsMdToWrite,
    metadata,
    tools: effectiveTools,
    dryRun,
  });

  const filesWritten = derivations
    .filter((d) => !d.error)
    .map((d) => ({ tool: d.tool, path: d.path }));

  const customSectionsPreserved = derivations.reduce(
    (sum, d) => sum + (d.customBlocksPreserved ?? 0),
    0,
  );

  for (const d of derivations) {
    if (d.error) warnings.push(`${d.tool}: ${d.error}`);
    if (d.customBlocksPreserved > 0 && d.tool !== "agents-md") {
      // Count preserved unmanaged files from derivers
      // (loadUnmanagedFileAsCustomBlock wraps the whole file as 1 block)
      preservedExistingFiles.push(d.path);
    }
  }

  // 9. Save snapshot
  if (!dryRun) {
    const manifestContent = corpus.manifest.dependencies.join("\n") +
      corpus.manifest.devDependencies.join("\n");
    const managedFiles: ManagedFile[] = [
      { tool: "agents-md", path: agentsMdPath, sha256: sha256(agentsMdToWrite) },
      ...derivations
        .filter((d) => d.written && d.tool !== "agents-md")
        .map((d) => ({ tool: d.tool as ManagedFile["tool"], path: d.path, sha256: d.contentHash ?? sha256("") })),
    ];

    const snapshot = buildSnapshot({
      projectPath,
      manifestContent,
      structureHash: sha256(corpus.structure.topLevelDirs.join(",")),
      filesManaged: managedFiles,
      language: metadata.project.language,
      framework: metadata.project.framework ?? null,
      topLevelDirs: corpus.structure.topLevelDirs,
      dependencyCount: corpus.manifest.dependencies.length,
      totalFiles: corpus.structure.totalFileCount,
    });

    await saveSnapshot(snapshot);
  }

  if (!dryRun) {
    warnings.push("Tip: add .agents-sync/ to your .gitignore");
  }

  const agentsMdPreview = dryRun
    ? (() => {
        const lines = agentsMdToWrite.split("\n");
        return lines.slice(0, 40).join("\n") + (lines.length > 40 ? "\n…" : "");
      })()
    : undefined;

  const toolPreviews = dryRun
    ? derivations
        .filter((d) => !d.error && d.dryRunPreview)
        .map((d) => ({ tool: d.tool as string, path: d.path, preview: d.dryRunPreview! }))
    : undefined;

  return {
    success: true,
    agentsMdPath,
    filesWritten,
    customSectionsPreserved,
    preservedExistingFiles,
    tokenUsage: { input: 0, output: 0, cacheHit: 0 },
    warnings,
    dryRun,
    agentsMdPreview,
    toolPreviews,
  };
}
