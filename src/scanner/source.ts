import path from "node:path";
import fg from "fast-glob";
import { readFileSafe } from "../lib/file-utils.js";
import { estimateTokens, truncateToTokenBudget } from "../lib/token-estimate.js";

export interface SampledFile {
  path: string;
  content: string;
  tokens: number;
}

export interface SourceData {
  files: SampledFile[];
  totalTokens: number;
  importStyle: "esm" | "cjs" | "relative-only" | "unknown";
  detectedPatterns: string[];
}

const IGNORE_PATTERNS = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/__pycache__/**",
  "**/.venv/**",
  "**/target/**",
  "**/.next/**",
  "**/coverage/**",
  "**/.cache/**",
  "**/*.min.js",
  "**/*.gen.*",
  "**/*.d.ts",
  "**/package-lock.json",
  "**/yarn.lock",
  "**/pnpm-lock.yaml",
  "**/Cargo.lock",
  "**/poetry.lock",
];

const PRIORITY_NAMES = new Set([
  "index",
  "app",
  "main",
  "server",
  "schema",
  "types",
  "routes",
]);

const PATTERN_KEYWORDS: Record<string, string> = {
  prisma: "prisma ORM",
  drizzle: "drizzle ORM",
  mongoose: "mongoose ODM",
  zod: "zod validation",
  yup: "yup validation",
  jwt: "JWT auth",
  supabase: "supabase",
  redis: "redis",
  graphql: "GraphQL",
  trpc: "tRPC",
  tailwind: "tailwind CSS",
  shadcn: "shadcn/ui",
};

function isPriority(filePath: string): boolean {
  const base = path.basename(filePath, path.extname(filePath)).toLowerCase();
  return PRIORITY_NAMES.has(base);
}

function detectImportStyle(
  contents: string[],
): "esm" | "cjs" | "relative-only" | "unknown" {
  let esmCount = 0;
  let cjsCount = 0;
  let relativeCount = 0;

  for (const content of contents) {
    if (/import\s+.+\s+from\s+['"][^.@]/.test(content)) esmCount++;
    if (/require\s*\(/.test(content)) cjsCount++;
    if (/import\s+.+\s+from\s+['"][./]/.test(content)) relativeCount++;
  }

  if (esmCount > 0 && cjsCount === 0) return "esm";
  if (cjsCount > 0 && esmCount === 0) return "cjs";
  if (relativeCount > 0 && esmCount === 0 && cjsCount === 0) return "relative-only";
  if (esmCount > 0 || cjsCount > 0) return esmCount >= cjsCount ? "esm" : "cjs";
  return "unknown";
}

function detectPatterns(allContent: string): string[] {
  const lower = allContent.toLowerCase();
  const found: string[] = [];
  for (const [keyword, label] of Object.entries(PATTERN_KEYWORDS)) {
    if (lower.includes(keyword)) found.push(label);
  }
  // Detect async/await usage
  if (/\basync\b/.test(allContent) && /\bawait\b/.test(allContent)) {
    found.unshift("uses async/await");
  }
  return found;
}

export async function sampleSource(
  projectPath: string,
  maxTokens = 10000,
): Promise<SourceData> {
  try {
    const allFiles = await fg("**/*", {
      cwd: projectPath,
      onlyFiles: true,
      ignore: IGNORE_PATTERNS,
      dot: false,
    });

    // Sort: priority files first, then alphabetical
    const sorted = [...allFiles].sort((a, b) => {
      const aPriority = isPriority(a) ? 0 : 1;
      const bPriority = isPriority(b) ? 0 : 1;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return a.localeCompare(b);
    });

    // Pick 1 file per unique directory (after priority files), up to 20 total
    const selected: string[] = [];
    const seenDirs = new Set<string>();

    for (const file of sorted) {
      if (selected.length >= 20) break;
      const dir = path.dirname(file);
      if (isPriority(file)) {
        selected.push(file);
      } else if (!seenDirs.has(dir)) {
        seenDirs.add(dir);
        selected.push(file);
      }
    }

    const sampledFiles: SampledFile[] = [];
    let remainingBudget = maxTokens;
    const allContents: string[] = [];

    for (const relPath of selected) {
      if (remainingBudget <= 0) break;

      const absPath = path.join(projectPath, relPath);
      const raw = await readFileSafe(absPath);
      if (!raw) continue;

      // Skip binary files
      const probe = raw.slice(0, 512);
      if (probe.includes("\0")) continue;

      const rawTokens = estimateTokens(raw);
      if (rawTokens > 3000) continue;
      if (rawTokens > remainingBudget) continue;

      const { text: content } = truncateToTokenBudget(raw, remainingBudget);
      const tokens = estimateTokens(content);

      sampledFiles.push({ path: relPath, content, tokens });
      allContents.push(content);
      remainingBudget -= tokens;
    }

    const totalTokens = sampledFiles.reduce((sum, f) => sum + f.tokens, 0);
    const importStyle = detectImportStyle(allContents);
    const detectedPatterns = detectPatterns(allContents.join("\n"));

    return { files: sampledFiles, totalTokens, importStyle, detectedPatterns };
  } catch {
    return {
      files: [],
      totalTokens: 0,
      importStyle: "unknown",
      detectedPatterns: [],
    };
  }
}
