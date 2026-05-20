import path from "node:path";
import { assertProjectDir, readFileSafe } from "../lib/file-utils.js";
import { scan } from "../scanner/index.js";
import { loadSnapshot } from "../snapshot/writer.js";
import { detectDrift, detectSemanticDrift, formatDriftReport, type DriftResult } from "../snapshot/drift.js";

export interface DriftOptions {
  projectPath: string;
}

export interface DriftToolResult {
  hasSnapshot: boolean;
  report: string;
  maxSeverity?: string;
  signalCount?: number;
  daysSinceSync?: number;
  recommendation?: string;
  /** true when maxSeverity is HIGH — use to set CI exit code */
  highDrift: boolean;
}

export async function runDrift(options: DriftOptions): Promise<DriftToolResult> {
  await assertProjectDir(options.projectPath);

  const snapshot = await loadSnapshot(options.projectPath);
  if (!snapshot) {
    return {
      hasSnapshot: false,
      report: "No snapshot found. Run init first.",
      highDrift: false,
    };
  }

  const corpus = await scan(options.projectPath);
  const result: DriftResult = detectDrift(snapshot, corpus);

  if (!result.hasSnapshot) {
    return { hasSnapshot: false, report: "No snapshot found. Run init first.", highDrift: false };
  }

  // Augment with semantic drift — contradictions between AGENTS.md claims and current stack
  const agentsMd = await readFileSafe(path.join(options.projectPath, "AGENTS.md"));
  if (agentsMd) {
    const semanticSignals = detectSemanticDrift(agentsMd, corpus);
    result.signals.push(...semanticSignals);
    // Recompute maxSeverity after merging
    if (semanticSignals.some((s) => s.severity === "HIGH")) result.maxSeverity = "HIGH";
    else if (semanticSignals.some((s) => s.severity === "MEDIUM") && result.maxSeverity === "NONE")
      result.maxSeverity = "MEDIUM";
    result.recommendation =
      result.maxSeverity === "HIGH"
        ? "Re-sync strongly recommended. Run: /agents-sync sync"
        : result.maxSeverity === "MEDIUM"
        ? "Re-sync recommended. Run: /agents-sync sync"
        : result.maxSeverity === "LOW"
        ? "Minor drift detected. Re-sync when convenient."
        : `Up to date. Last synced ${result.daysSinceSync} day${result.daysSinceSync === 1 ? "" : "s"} ago.`;
  }

  const report = formatDriftReport(result);

  return {
    hasSnapshot: true,
    report,
    maxSeverity: result.maxSeverity,
    signalCount: result.signals.length,
    daysSinceSync: result.daysSinceSync,
    recommendation: result.recommendation,
    highDrift: result.maxSeverity === "HIGH",
  };
}
