import path from "node:path";
import fs from "node:fs/promises";
import { assertProjectDir, readFileSafe } from "../lib/file-utils.js";
import { AgentsSyncError } from "../lib/errors.js";
import { loadSnapshot, saveSnapshot, sha256 } from "../snapshot/writer.js";
import { deriveAll, type ToolName } from "../derivers/index.js";
import type { ProjectMetadata } from "../extractor/schema.js";

export interface ExportOptions {
  projectPath: string;
  tool: ToolName;
}

export interface ExportResult {
  tool: ToolName;
  path: string;
  written: boolean;
  report: string;
  error?: string;
}

export async function runExport(options: ExportOptions): Promise<ExportResult> {
  await assertProjectDir(options.projectPath);

  const snapshot = await loadSnapshot(options.projectPath);
  if (!snapshot) {
    throw new AgentsSyncError(
      "NO_SNAPSHOT",
      "No snapshot found. Cannot export without a prior sync.",
      "Run /agents-sync init first.",
    );
  }

  const agentsMd = await readFileSafe(path.join(options.projectPath, "AGENTS.md"));
  if (!agentsMd) {
    throw new AgentsSyncError(
      "NO_SNAPSHOT",
      "AGENTS.md not found. Cannot derive tool file without canonical source.",
      "Run /agents-sync init first.",
    );
  }

  // Build minimal metadata from snapshot for re-derivation (no Claude API call)
  const minimalMetadata: ProjectMetadata = {
    project: {
      name: path.basename(options.projectPath),
      description: "",
      language: snapshot.meta.language,
      framework: snapshot.meta.framework ?? undefined,
    },
    stack: { other: [] },
    architecture: { keyDirs: {}, entryPoints: [] },
    conventions: [],
    gotchas: [],
    boundaries: { alwaysDo: [], askFirst: [], never: [] },
    testing: {},
    deployment: { notes: [] },
  };

  const results = await deriveAll({
    projectPath: options.projectPath,
    agentsMdContent: agentsMd,
    metadata: minimalMetadata,
    tools: [options.tool],
  });

  const result = results.find((r) => r.tool === options.tool);
  if (!result) {
    return { tool: options.tool, path: "", written: false, report: `✗ ${options.tool}: No result from deriver`, error: "No result from deriver" };
  }

  const report = result.error
    ? `✗ ${options.tool}: ${result.error}`
    : `✓ ${options.tool} → ${result.path}`;

  // Update snapshot hash so validate doesn't flag the re-derived file as drifted
  if (result.written && !result.error) {
    const updatedSnapshot = { ...snapshot };
    const content = await fs.readFile(result.path, "utf-8").catch(() => "");
    const newHash = sha256(content);
    updatedSnapshot.filesManaged = snapshot.filesManaged.map((f) =>
      f.path === result.path ? { ...f, sha256: newHash } : f,
    );
    await saveSnapshot(updatedSnapshot);
  }

  return {
    tool: options.tool,
    path: result.path,
    written: result.written,
    report,
    error: result.error,
  };
}
