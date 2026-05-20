import { assertProjectDir } from "../lib/file-utils.js";
import { scan } from "../scanner/index.js";
import { loadSnapshot } from "../snapshot/writer.js";
import { detectDrift, formatDriftReport, type DriftResult } from "../snapshot/drift.js";

export interface DriftOptions {
  projectPath: string;
}

export interface DriftToolResult {
  hasSnapshot: boolean;
  report?: string;
  maxSeverity?: string;
  signalCount?: number;
  daysSinceSync?: number;
  recommendation?: string;
}

export async function runDrift(options: DriftOptions): Promise<DriftToolResult> {
  await assertProjectDir(options.projectPath);

  const snapshot = await loadSnapshot(options.projectPath);
  if (!snapshot) {
    return {
      hasSnapshot: false,
    };
  }

  const corpus = await scan(options.projectPath);
  const result: DriftResult = detectDrift(snapshot, corpus);

  if (!result.hasSnapshot) {
    return { hasSnapshot: false };
  }

  const report = formatDriftReport(result);

  return {
    hasSnapshot: true,
    report,
    maxSeverity: result.maxSeverity,
    signalCount: result.signals.length,
    daysSinceSync: result.daysSinceSync,
    recommendation: result.recommendation,
  };
}
