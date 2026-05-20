import crypto from "node:crypto";
import path from "node:path";
import { writeFileAtomic, readFileSafe } from "../lib/file-utils.js";
import { type Snapshot, type ManagedFile, SnapshotSchema, SNAPSHOT_DIR, SNAPSHOT_FILE } from "./schema.js";

export function sha256(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

export function snapshotPath(projectPath: string): string {
  return path.join(projectPath, SNAPSHOT_DIR, SNAPSHOT_FILE);
}

export async function loadSnapshot(projectPath: string): Promise<Snapshot | null> {
  const raw = await readFileSafe(snapshotPath(projectPath));
  if (!raw) return null;
  try {
    return SnapshotSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function saveSnapshot(snapshot: Snapshot): Promise<void> {
  await writeFileAtomic(
    snapshotPath(snapshot.projectPath),
    JSON.stringify(snapshot, null, 2),
  );
}

export function buildSnapshot(params: {
  projectPath: string;
  manifestContent: string;
  structureHash: string;
  filesManaged: ManagedFile[];
  language: string;
  framework: string | null;
  topLevelDirs: string[];
  dependencyCount: number;
  totalFiles: number;
}): Snapshot {
  const manifestHash = sha256(params.manifestContent);
  const codebaseHash = sha256(params.manifestContent + params.structureHash);

  return {
    version: "1.0",
    syncedAt: new Date().toISOString(),
    projectPath: params.projectPath,
    codebaseHash,
    manifestHash,
    filesManaged: params.filesManaged,
    meta: {
      dependencyCount: params.dependencyCount,
      topLevelDirs: params.topLevelDirs,
      language: params.language,
      framework: params.framework,
      totalFiles: params.totalFiles,
    },
  };
}
