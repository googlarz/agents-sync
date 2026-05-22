import path from "node:path";
import crypto from "node:crypto";
import { assertProjectDir, readFileSafe, fileExists } from "../lib/file-utils.js";
import { loadSnapshot } from "../snapshot/writer.js";

export interface ValidateOptions {
  projectPath: string;
  strict?: boolean;
}

export type FileStatus = "in-sync" | "drifted" | "missing";

export interface FileValidation {
  tool: string;
  path: string;
  status: FileStatus;
  details?: string;
}

export interface ValidateResult {
  canonical: { path: string; exists: boolean };
  toolFiles: FileValidation[];
  allInSync: boolean;
  hasSnapshot: boolean;
  report: string;
}

function sha256File(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

const TOOL_PATHS: Record<string, string> = {
  "agents-md": "AGENTS.md",
  claude: "CLAUDE.md",
  cursor: ".cursorrules",
  copilot: ".github/copilot-instructions.md",
  gemini: "GEMINI.md",
  windsurf: ".windsurfrules",
  cline: ".clinerules",
  roo: ".roomodes",
  aider: "CONVENTIONS.md",
};

function buildReport(
  canonical: { path: string; exists: boolean },
  toolFiles: FileValidation[],
  hasSnapshot: boolean,
): string {
  const lines: string[] = [];
  lines.push(`AGENTS.md (canonical)  ${canonical.exists ? "✓" : "✗ MISSING"}`);
  lines.push("");
  for (const f of toolFiles) {
    const icon = f.status === "in-sync" ? "✓" : f.status === "drifted" ? "⚠" : "✗";
    const label = f.status === "in-sync" ? "in sync" : f.status;
    lines.push(`${icon} ${f.tool.padEnd(10)} ${label.padEnd(10)} ${f.path}`);
    if (f.details) lines.push(`              ${f.details}`);
  }
  if (!hasSnapshot) {
    lines.push("");
    lines.push("No snapshot found. Run init to establish a baseline.");
  }
  return lines.join("\n");
}

export async function runValidate(options: ValidateOptions): Promise<ValidateResult> {
  await assertProjectDir(options.projectPath);

  const snapshot = await loadSnapshot(options.projectPath);
  const agentsMdPath = path.join(options.projectPath, "AGENTS.md");
  const canonicalExists = await fileExists(agentsMdPath);

  if (!snapshot) {
    // No snapshot: report file presence but don't treat existing files as drifted.
    // --strict should not block CI on repos that have committed context files but
    // haven't run init yet — there is no baseline to compare against.
    const toolFiles: FileValidation[] = [];
    let allExist = true;
    for (const [tool, relPath] of Object.entries(TOOL_PATHS)) {
      if (tool === "agents-md") continue;
      const absPath = path.join(options.projectPath, relPath);
      const exists = await fileExists(absPath);
      if (!exists) allExist = false;
      toolFiles.push({
        tool,
        path: absPath,
        status: exists ? "in-sync" : "missing",
        details: exists ? "No baseline — run init to start tracking" : undefined,
      });
    }
    const result = {
      canonical: { path: agentsMdPath, exists: canonicalExists },
      toolFiles,
      allInSync: allExist,
      hasSnapshot: false,
    };
    return { ...result, report: buildReport(result.canonical, toolFiles, false) };
  }

  // Compare current file hashes against snapshot
  const toolFiles: FileValidation[] = [];
  let allInSync = true;

  for (const managed of snapshot.filesManaged) {
    if (managed.tool === "agents-md") continue;

    const currentContent = await readFileSafe(managed.path);
    if (!currentContent) {
      toolFiles.push({ tool: managed.tool, path: managed.path, status: "missing" });
      allInSync = false;
      continue;
    }

    const currentHash = sha256File(currentContent);
    if (currentHash !== managed.sha256) {
      toolFiles.push({
        tool: managed.tool,
        path: managed.path,
        status: "drifted",
        details: "File was modified after last sync",
      });
      allInSync = false;
    } else {
      toolFiles.push({ tool: managed.tool, path: managed.path, status: "in-sync" });
    }
  }

  const canonical = { path: agentsMdPath, exists: canonicalExists };
  return {
    canonical,
    toolFiles,
    allInSync,
    hasSnapshot: true,
    report: buildReport(canonical, toolFiles, true),
  };
}
