import { scanManifest, type ManifestData } from "./manifest.js";
import { scanStructure, type StructureData } from "./structure.js";
import { sampleSource, type SourceData } from "./source.js";
import { scanDocs, type DocData } from "./docs.js";
import { scanGotchas, type Gotcha } from "./gotchas.js";
import { parseRepomixOutput } from "./repomix.js";
import { readCodegraphIndex, type CodegraphSummary } from "./codegraph.js";

export type { ManifestData, StructureData, SourceData, DocData, Gotcha };
export type { CodegraphSummary };

export interface RawCorpus {
  manifest: ManifestData;
  structure: StructureData;
  source: SourceData;
  docs: DocData;
  gotchas: Gotcha[];
  codegraph: CodegraphSummary;
  totalEstimatedTokens: number;
  scanDurationMs: number;
}

const DEFAULT_MANIFEST: ManifestData = {
  language: "unknown",
  framework: null,
  runtime: null,
  packageManager: null,
  dependencies: [],
  devDependencies: [],
  scripts: {},
  projectName: null,
  projectVersion: null,
};

const DEFAULT_STRUCTURE: StructureData = {
  topLevelDirs: [],
  entryPoints: [],
  testDirs: [],
  totalFileCount: 0,
  namingConvention: "mixed",
  tree: ".",
};

const DEFAULT_SOURCE: SourceData = {
  files: [],
  totalTokens: 0,
  importStyle: "unknown",
  detectedPatterns: [],
};

const DEFAULT_DOCS: DocData = {
  readme: null,
  contributing: null,
  architecture: null,
  existingAgentsMd: null,
  existingClaudeMd: null,
  existingCursorRules: null,
  hasExistingClaudeMd: false,
  hasExistingAgentsMd: false,
  totalTokens: 0,
};

const DEBUG = process.env.AGENTS_SYNC_DEBUG === "1";

async function safeRun<T>(name: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    process.stderr.write(
      `[agents-sync] Warning: scanner "${name}" failed: ${(e as Error).message}\n`,
    );
    return fallback;
  }
}

export interface ScanOptions {
  /** Path to a repomix output file. When provided, replaces filesystem source sampling. */
  repomixPath?: string;
}

export async function scan(projectPath: string, options: ScanOptions = {}): Promise<RawCorpus> {
  const start = Date.now();

  // Phase 1: manifest + structure in parallel
  const [manifest, structure] = await Promise.all([
    safeRun("manifest", () => scanManifest(projectPath), DEFAULT_MANIFEST),
    safeRun("structure", () => scanStructure(projectPath), DEFAULT_STRUCTURE),
  ]);

  // Phase 2: source (or repomix) + docs + gotchas in parallel
  const sourceRunner = options.repomixPath
    ? () => parseRepomixOutput(options.repomixPath!)
    : () => sampleSource(projectPath);

  const EMPTY_CODEGRAPH: CodegraphSummary = { available: false, communities: [], hubNodes: [], entryPoints: [] };

  const [source, docs, gotchas, codegraph] = await Promise.all([
    safeRun("source", sourceRunner, DEFAULT_SOURCE),
    safeRun("docs", () => scanDocs(projectPath), DEFAULT_DOCS),
    safeRun("gotchas", () => scanGotchas(projectPath), [] as Gotcha[]),
    safeRun("codegraph", () => readCodegraphIndex(projectPath), EMPTY_CODEGRAPH),
  ]);

  const scanDurationMs = Date.now() - start;

  const totalEstimatedTokens =
    source.totalTokens +
    docs.totalTokens +
    // rough estimate for structured data
    Math.ceil(JSON.stringify({ manifest, structure, gotchas }).length / 4);

  if (DEBUG) {
    process.stderr.write(
      `[agents-sync] Scan complete in ${scanDurationMs}ms, ~${totalEstimatedTokens} tokens\n`,
    );
  }

  return {
    manifest,
    structure,
    source,
    docs,
    gotchas,
    codegraph,
    totalEstimatedTokens,
    scanDurationMs,
  };
}
