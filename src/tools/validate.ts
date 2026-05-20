import path from "node:path";
import crypto from "node:crypto";
import { assertProjectDir, readFileSafe, fileExists } from "../lib/file-utils.js";
import { loadSnapshot } from "../snapshot/writer.js";

export interface ValidateOptions {
  projectPath: string;
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
}

function sha256File(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

const TOOL_PATHS: Record<string, string> = {
  "agents-md": "AGENTS.md",
  claude: "CLAUDE.md",
  cursor: ".cursorrules",
  copilot: ".github/copilot-instructions.md",
};

export async function runValidate(options: ValidateOptions): Promise<ValidateResult> {
  await assertProjectDir(options.projectPath);

  const snapshot = await loadSnapshot(options.projectPath);
  const agentsMdPath = path.join(options.projectPath, "AGENTS.md");
  const canonicalExists = await fileExists(agentsMdPath);

  if (!snapshot) {
    // No snapshot: just check which files exist
    const toolFiles: FileValidation[] = [];
    for (const [tool, relPath] of Object.entries(TOOL_PATHS)) {
      if (tool === "agents-md") continue;
      const absPath = path.join(options.projectPath, relPath);
      const exists = await fileExists(absPath);
      toolFiles.push({
        tool,
        path: absPath,
        status: exists ? "drifted" : "missing",
        details: exists ? "No snapshot to compare against" : undefined,
      });
    }
    return {
      canonical: { path: agentsMdPath, exists: canonicalExists },
      toolFiles,
      allInSync: false,
      hasSnapshot: false,
    };
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
    if (currentHash !== managed.sha256 && managed.sha256 !== "") {
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

  return {
    canonical: { path: agentsMdPath, exists: canonicalExists },
    toolFiles,
    allInSync,
    hasSnapshot: true,
  };
}
