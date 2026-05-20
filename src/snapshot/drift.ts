import type { Snapshot } from "./schema.js";
import type { RawCorpus } from "../scanner/index.js";
import { sha256 } from "./writer.js";

export type DriftSeverity = "HIGH" | "MEDIUM" | "LOW";

export interface DriftSignal {
  severity: DriftSeverity;
  message: string;
  detail?: string;
}

export interface DriftReport {
  hasSnapshot: true;
  signals: DriftSignal[];
  daysSinceSync: number;
  recommendation: string;
  maxSeverity: DriftSeverity | "NONE";
}

export interface NoDrift {
  hasSnapshot: false;
}

export type DriftResult = DriftReport | NoDrift;

export function detectDrift(snapshot: Snapshot, corpus: RawCorpus): DriftReport {
  const signals: DriftSignal[] = [];

  // Manifest hash change
  const manifestContent =
    corpus.manifest.dependencies.join("\n") +
    corpus.manifest.devDependencies.join("\n");
  const currentManifestHash = sha256(manifestContent);

  if (currentManifestHash !== snapshot.manifestHash) {
    const prevCount = snapshot.meta.dependencyCount;
    const currCount = corpus.manifest.dependencies.length;
    const diff = currCount - prevCount;

    if (Math.abs(diff) >= 3) {
      signals.push({
        severity: "HIGH",
        message: `Dependency count changed significantly (${prevCount} → ${currCount})`,
        detail: diff > 0
          ? `${diff} new dependencies added`
          : `${Math.abs(diff)} dependencies removed`,
      });
    } else if (currentManifestHash !== snapshot.manifestHash) {
      signals.push({
        severity: "MEDIUM",
        message: "Manifest changed (dependencies or scripts updated)",
      });
    }
  }

  // New top-level dirs
  const prevDirs = new Set(snapshot.meta.topLevelDirs);
  const newDirs = corpus.structure.topLevelDirs.filter((d) => !prevDirs.has(d));
  for (const dir of newDirs) {
    signals.push({
      severity: "HIGH",
      message: `New top-level directory: ${dir}`,
    });
  }

  // Significant file count change
  const fileDiff = corpus.structure.totalFileCount - snapshot.meta.totalFiles;
  if (fileDiff > 50) {
    signals.push({
      severity: "MEDIUM",
      message: `${fileDiff} new files added since last sync`,
    });
  }

  // New gotchas found
  if (corpus.gotchas.length > 3) {
    signals.push({
      severity: "LOW",
      message: `${corpus.gotchas.length} FIXME/HACK/WARNING comments found in codebase`,
      detail: "Some may be new gotchas worth capturing",
    });
  }

  const daysSinceSync = Math.floor(
    (Date.now() - new Date(snapshot.syncedAt).getTime()) / (1000 * 60 * 60 * 24),
  );

  if (daysSinceSync > 14) {
    signals.push({
      severity: "LOW",
      message: `Last synced ${daysSinceSync} days ago`,
      detail: "Regular re-sync keeps AI tools accurate",
    });
  }

  const maxSeverity = computeMaxSeverity(signals);
  const recommendation =
    maxSeverity === "HIGH"
      ? "Re-sync strongly recommended. Run: /agents-sync sync"
      : maxSeverity === "MEDIUM"
      ? "Re-sync recommended. Run: /agents-sync sync"
      : maxSeverity === "LOW"
      ? "Minor drift detected. Re-sync when convenient."
      : `Up to date. Last synced ${daysSinceSync} day${daysSinceSync === 1 ? "" : "s"} ago.`;

  return { hasSnapshot: true, signals, daysSinceSync, recommendation, maxSeverity };
}

function computeMaxSeverity(signals: DriftSignal[]): DriftSeverity | "NONE" {
  if (signals.some((s) => s.severity === "HIGH")) return "HIGH";
  if (signals.some((s) => s.severity === "MEDIUM")) return "MEDIUM";
  if (signals.some((s) => s.severity === "LOW")) return "LOW";
  return "NONE";
}

/**
 * Detect contradictions between what AGENTS.md *claims* about the stack and what
 * the current manifest/filesystem actually contains.  Returns DriftSignals that can
 * be merged into a structural drift report.
 */
export function detectSemanticDrift(agentsMdContent: string, corpus: RawCorpus): DriftSignal[] {
  const signals: DriftSignal[] = [];
  const md = agentsMdContent.toLowerCase();
  const allDeps = new Set([
    ...corpus.manifest.dependencies.map((d) => d.toLowerCase()),
    ...corpus.manifest.devDependencies.map((d) => d.toLowerCase()),
  ]);
  const tree = corpus.structure.tree.toLowerCase();

  // ── Database layer conflicts ────────────────────────────────────────────────
  const dbConflicts: Array<[string, string[]]> = [
    ["prisma", ["drizzle-orm", "mongoose", "sequelize", "typeorm", "mikro-orm"]],
    ["drizzle", ["@prisma/client", "mongoose", "sequelize", "typeorm"]],
    ["mongoose", ["@prisma/client", "drizzle-orm", "sequelize", "typeorm"]],
    ["sequelize", ["@prisma/client", "drizzle-orm", "mongoose"]],
    ["typeorm", ["@prisma/client", "drizzle-orm", "mongoose", "sequelize"]],
    ["sqlalchemy", ["django.db", "peewee"]],
  ];
  for (const [stated, rivals] of dbConflicts) {
    if (!md.includes(stated)) continue;
    const found = rivals.filter((r) => allDeps.has(r));
    if (found.length) {
      signals.push({
        severity: "HIGH",
        message: `Stack contradiction: AGENTS.md states "${stated}" but manifest now has ${found.join(", ")}`,
        detail: "Database layer may have migrated — re-sync to update AI context",
      });
    }
  }

  // ── Test framework conflicts ────────────────────────────────────────────────
  const testConflicts: Array<[string, string[]]> = [
    ["vitest", ["jest", "@jest/core", "jasmine2", "mocha"]],
    ["jest", ["vitest", "jasmine", "mocha"]],
    ["pytest", ["nose2", "unittest2"]],
    ["mocha", ["jest", "vitest", "jasmine"]],
  ];
  for (const [stated, rivals] of testConflicts) {
    if (!md.includes(stated)) continue;
    const found = rivals.filter((r) => allDeps.has(r));
    if (found.length) {
      signals.push({
        severity: "HIGH",
        message: `Stack contradiction: AGENTS.md states "${stated}" for testing but manifest has ${found.join(", ")}`,
        detail: "Test framework may have changed — re-sync to update AI context",
      });
    }
  }

  // ── Primary framework conflicts ─────────────────────────────────────────────
  const frameworkConflicts: Array<[string, string[]]> = [
    ["next.js", ["remix", "sveltekit", "@nuxtjs", "astro", "@hono"]],
    ["remix", ["next", "sveltekit", "@nuxtjs"]],
    ["sveltekit", ["next", "remix", "@nuxtjs"]],
    ["express", ["fastify", "@hono/node-server", "elysia"]],
    ["fastify", ["express", "@hono/node-server"]],
    ["django", ["fastapi", "flask", "starlette"]],
    ["fastapi", ["django", "flask"]],
    ["flask", ["django", "fastapi"]],
    ["axum", ["actix-web", "warp", "rocket"]],
    ["actix-web", ["axum", "warp", "rocket"]],
  ];
  for (const [stated, rivals] of frameworkConflicts) {
    if (!md.includes(stated)) continue;
    const found = rivals.filter((r) => allDeps.has(r));
    if (found.length) {
      signals.push({
        severity: "HIGH",
        message: `Stack contradiction: AGENTS.md states "${stated}" but manifest now has ${found.join(", ")}`,
        detail: "Primary framework may have changed — re-sync strongly recommended",
      });
    }
  }

  // ── Deployment target vs config files ──────────────────────────────────────
  const deployConflicts: Array<[string, string[]]> = [
    ["vercel", ["fly.toml", "railway.json", ".railway", "dockerfile", "heroku.yml", "render.yaml"]],
    ["fly.io", ["vercel.json", ".vercel", "railway.json", "heroku.yml", "render.yaml"]],
    ["heroku", ["fly.toml", "vercel.json", "railway.json", "render.yaml"]],
    ["railway", ["fly.toml", "vercel.json", "heroku.yml", "render.yaml"]],
    ["render", ["fly.toml", "vercel.json", "heroku.yml", "railway.json"]],
  ];
  for (const [stated, conflictFiles] of deployConflicts) {
    if (!md.includes(stated)) continue;
    const found = conflictFiles.filter((f) => tree.includes(f));
    if (found.length) {
      signals.push({
        severity: "MEDIUM",
        message: `Stack contradiction: AGENTS.md states "${stated}" deployment but ${found[0]} found in project`,
        detail: "Deployment target may have changed — re-sync to update AI context",
      });
    }
  }

  return signals;
}

export function formatDriftReport(report: DriftReport): string {
  const NO_COLOR = process.env.NO_COLOR === "1";
  const color = (code: string, text: string) =>
    NO_COLOR ? text : `\x1b[${code}m${text}\x1b[0m`;

  const lines: string[] = [];
  lines.push(
    color("1", `agents-sync drift report (${new Date().toISOString().slice(0, 10)})`),
  );
  lines.push(color("2", `Last sync: ${report.daysSinceSync} day${report.daysSinceSync === 1 ? "" : "s"} ago\n`));

  if (report.signals.length === 0) {
    lines.push(color("32", "✓  No drift detected — everything is in sync."));
  } else {
    for (const s of report.signals) {
      const badge =
        s.severity === "HIGH"
          ? color("31;1", "HIGH  ")
          : s.severity === "MEDIUM"
          ? color("33;1", "MED   ")
          : color("34;1", "LOW   ");
      lines.push(`${badge} ${s.message}`);
      if (s.detail) lines.push(`       ${color("2", s.detail)}`);
    }
  }

  lines.push("");
  lines.push(color("1", report.recommendation));
  return lines.join("\n");
}

