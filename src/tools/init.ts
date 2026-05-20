import path from "node:path";
import { assertProjectDir, readFileSafe, writeFileAtomic } from "../lib/file-utils.js";
import { scan } from "../scanner/index.js";
import { extractMetadata } from "../extractor/extractor.js";
import { generateAgentsMd, appendMcpSection } from "../generator/agents-md.js";
import { validateAgentsMd } from "../generator/validator.js";
import { deriveAll, type ToolName } from "../derivers/index.js";
import { buildSnapshot, saveSnapshot, sha256 } from "../snapshot/writer.js";
import type { ManagedFile } from "../snapshot/schema.js";
import { isManagedByAgentsSync, injectCustomBlocks } from "../derivers/merger.js";
import { loadConfig, applyConfig } from "../config/loader.js";

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
}

export async function runInit(options: InitOptions): Promise<InitResult> {
  const { projectPath, tools, dryRun = false, repomixOutput } = options;

  await assertProjectDir(projectPath);

  // 1. Scan (optionally using repomix output as source corpus)
  process.stderr.write("agents-sync: scanning codebase…\n");
  const corpus = await scan(projectPath, { repomixPath: repomixOutput });

  // 2. Load team config (agents-sync.config.json) — non-fatal if missing
  const config = await loadConfig(projectPath);

  // 3. Extract metadata and merge config overrides
  process.stderr.write("agents-sync: extracting with Claude…\n");
  const rawMetadata = await extractMetadata(corpus);
  const metadata = applyConfig(rawMetadata, config);

  // 4. Resolve effective tool list: CLI flag > config > default (all)
  const effectiveTools = tools ?? (config?.tools as ToolName[] | undefined);

  // 5. Generate AGENTS.md, then append MCP section if servers detected
  const agentsMd = appendMcpSection(await generateAgentsMd(metadata), corpus.mcp);

  // 6. Validate
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
        .map((d) => ({ tool: d.tool as ManagedFile["tool"], path: d.path, sha256: sha256("") })),
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

  return {
    success: true,
    agentsMdPath,
    filesWritten,
    customSectionsPreserved,
    preservedExistingFiles,
    tokenUsage: { input: 0, output: 0, cacheHit: 0 },
    warnings,
    dryRun,
  };
}
