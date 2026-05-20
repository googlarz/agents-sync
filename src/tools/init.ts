import path from "node:path";
import { assertProjectDir } from "../lib/file-utils.js";
import { scan } from "../scanner/index.js";
import { extractMetadata } from "../extractor/extractor.js";
import { generateAgentsMd } from "../generator/agents-md.js";
import { validateAgentsMd } from "../generator/validator.js";
import { deriveAll, type ToolName } from "../derivers/index.js";
import { buildSnapshot, saveSnapshot, sha256 } from "../snapshot/writer.js";
import type { ManagedFile } from "../snapshot/schema.js";
import { writeFileAtomic } from "../lib/file-utils.js";

export interface InitOptions {
  projectPath: string;
  tools?: ToolName[];
  dryRun?: boolean;
}

export interface InitResult {
  success: boolean;
  agentsMdPath: string;
  filesWritten: { tool: string; path: string }[];
  customSectionsPreserved: number;
  tokenUsage: { input: number; output: number; cacheHit: number };
  warnings: string[];
  dryRun: boolean;
}

export async function runInit(options: InitOptions): Promise<InitResult> {
  const { projectPath, tools, dryRun = false } = options;

  await assertProjectDir(projectPath);

  // 1. Scan
  const corpus = await scan(projectPath);

  // 2. Extract metadata
  const metadata = await extractMetadata(corpus);

  // 3. Generate AGENTS.md
  const agentsMd = await generateAgentsMd(metadata);

  // 4. Validate
  const validation = validateAgentsMd(agentsMd, corpus.structure.topLevelDirs);
  const warnings = [...validation.warnings];
  if (!validation.passed) {
    warnings.push(...validation.failures.map((f) => `Quality check: ${f}`));
  }

  // 5. Write AGENTS.md
  const agentsMdPath = path.join(projectPath, "AGENTS.md");
  if (!dryRun) {
    await writeFileAtomic(agentsMdPath, agentsMd);
  }

  // 6. Derive tool files
  const derivations = await deriveAll({
    projectPath,
    agentsMdContent: agentsMd,
    metadata,
    tools,
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
  }

  // 7. Save snapshot
  if (!dryRun) {
    const manifestContent = corpus.manifest.dependencies.join("\n") +
      corpus.manifest.devDependencies.join("\n");
    const managedFiles: ManagedFile[] = [
      { tool: "agents-md", path: agentsMdPath, sha256: sha256(agentsMd) },
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
    tokenUsage: { input: 0, output: 0, cacheHit: 0 },
    warnings,
    dryRun,
  };
}
