/**
 * codegraph scanner
 *
 * Reads .codegraph/index.json (if present) and returns a lightweight summary
 * of community clusters + hub nodes that can be injected into the corpus.
 * This enriches AGENTS.md with evidence-backed architecture notes.
 *
 * Gracefully no-ops when .codegraph/ is absent — works without codegraph.
 */
import path from "node:path";
import fs from "node:fs/promises";

export interface CodegraphSummary {
  available: boolean;
  communities: CodegraphCommunity[];
  hubNodes: string[];
  entryPoints: string[];
}

export interface CodegraphCommunity {
  name: string;
  files: string[];
}

interface CodegraphIndex {
  communities?: Array<{
    label?: string;
    name?: string;
    files?: string[];
    nodes?: Array<{ file?: string; path?: string }>;
  }>;
  hubNodes?: Array<{ file?: string; path?: string; name?: string }>;
  entryPoints?: Array<{ file?: string; path?: string }>;
  nodes?: Array<{ file?: string; path?: string; isEntry?: boolean; hubScore?: number }>;
}

export async function readCodegraphIndex(projectPath: string): Promise<CodegraphSummary> {
  const candidates = [
    path.join(projectPath, ".codegraph", "index.json"),
    path.join(projectPath, ".codegraph", "graph.json"),
    path.join(projectPath, "codegraph.json"),
  ];

  for (const candidate of candidates) {
    const raw = await fs.readFile(candidate, "utf-8").catch(() => null);
    if (!raw) continue;

    let parsed: CodegraphIndex;
    try {
      parsed = JSON.parse(raw) as CodegraphIndex;
    } catch {
      continue;
    }

    const communities: CodegraphCommunity[] = (parsed.communities ?? []).slice(0, 8).map((c) => ({
      name: c.label ?? c.name ?? "unnamed",
      files: (c.files ?? c.nodes?.map((n) => n.file ?? n.path ?? "").filter(Boolean) ?? []).slice(0, 5),
    }));

    const hubNodes = (parsed.hubNodes ?? parsed.nodes?.filter((n) => (n.hubScore ?? 0) > 0.5) ?? [])
      .slice(0, 10)
      .map((n) => n.file ?? n.path ?? (n as { name?: string }).name ?? "")
      .filter(Boolean);

    const entryPoints = (parsed.entryPoints ?? parsed.nodes?.filter((n) => n.isEntry) ?? [])
      .slice(0, 8)
      .map((n) => n.file ?? n.path ?? "")
      .filter(Boolean);

    return { available: true, communities, hubNodes, entryPoints };
  }

  return { available: false, communities: [], hubNodes: [], entryPoints: [] };
}

export function formatCodegraphContext(summary: CodegraphSummary): string {
  if (!summary.available) return "";

  const lines: string[] = ["## Code Graph (from .codegraph/)"];

  if (summary.communities.length > 0) {
    lines.push("\n### Architecture clusters");
    for (const c of summary.communities) {
      lines.push(`- **${c.name}**: ${c.files.join(", ")}`);
    }
  }

  if (summary.hubNodes.length > 0) {
    lines.push("\n### High-connectivity files (call hubs)");
    lines.push(summary.hubNodes.map((n) => `- ${n}`).join("\n"));
  }

  if (summary.entryPoints.length > 0) {
    lines.push("\n### Entry points");
    lines.push(summary.entryPoints.map((n) => `- ${n}`).join("\n"));
  }

  return lines.join("\n");
}
