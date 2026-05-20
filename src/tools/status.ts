import { assertProjectDir, fileExists } from "../lib/file-utils.js";
import { loadSnapshot } from "../snapshot/writer.js";
import path from "node:path";

export interface StatusOptions {
  projectPath: string;
}

export interface StatusResult {
  hasSnapshot: boolean;
  lastSyncedAt: string | null;
  daysSinceSync: number | null;
  filesManaged: { tool: string; path: string }[];
  language: string | null;
  framework: string | null;
  driftScore: "unknown" | "stale" | "ok";
  recommendation: string;
}

export async function runStatus(options: StatusOptions): Promise<StatusResult> {
  await assertProjectDir(options.projectPath);

  const snapshot = await loadSnapshot(options.projectPath);

  if (!snapshot) {
    const agentsMdExists = await fileExists(path.join(options.projectPath, "AGENTS.md"));
    return {
      hasSnapshot: false,
      lastSyncedAt: null,
      daysSinceSync: null,
      filesManaged: [],
      language: null,
      framework: null,
      driftScore: "unknown",
      recommendation: agentsMdExists
        ? "AGENTS.md found but no snapshot. Run /agents-sync init to create a managed sync."
        : "Not initialized. Run /agents-sync init to get started.",
    };
  }

  const daysSinceSync = Math.floor(
    (Date.now() - new Date(snapshot.syncedAt).getTime()) / (1000 * 60 * 60 * 24),
  );

  const driftScore = daysSinceSync > 30 ? "stale" : "ok";

  const recommendation =
    driftScore === "stale"
      ? `Last synced ${daysSinceSync} days ago — run /agents-sync drift to check for changes.`
      : `Synced ${daysSinceSync} day${daysSinceSync === 1 ? "" : "s"} ago. Run /agents-sync drift to check for changes.`;

  return {
    hasSnapshot: true,
    lastSyncedAt: snapshot.syncedAt,
    daysSinceSync,
    filesManaged: snapshot.filesManaged.map((f) => ({ tool: f.tool, path: f.path })),
    language: snapshot.meta.language,
    framework: snapshot.meta.framework,
    driftScore,
    recommendation,
  };
}
