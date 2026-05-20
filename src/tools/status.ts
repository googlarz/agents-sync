import crypto from "node:crypto";
import { assertProjectDir, fileExists, readFileSafe } from "../lib/file-utils.js";
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
  /** "ok" = synced recently + AGENTS.md unchanged, "stale" = >30 days, "modified" = AGENTS.md edited since last sync, "unknown" = no snapshot */
  driftScore: "unknown" | "stale" | "ok" | "modified";
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

  // Lightweight check: compare AGENTS.md hash against stored value (one file read, no scan)
  let driftScore: "ok" | "stale" | "modified" = daysSinceSync > 30 ? "stale" : "ok";
  const agentsMdEntry = snapshot.filesManaged.find((f) => f.tool === "agents-md");
  if (agentsMdEntry && agentsMdEntry.sha256) {
    const currentContent = await readFileSafe(agentsMdEntry.path);
    if (currentContent) {
      const currentHash = crypto.createHash("sha256").update(currentContent).digest("hex");
      if (currentHash !== agentsMdEntry.sha256) driftScore = "modified";
    }
  }

  const recommendation =
    driftScore === "modified"
      ? "AGENTS.md has been edited since last sync — run /agents-sync sync to update tool files."
      : driftScore === "stale"
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
