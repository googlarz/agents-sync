import path from "node:path";
import fg from "fast-glob";
import { readFileSafe } from "../lib/file-utils.js";

export interface Gotcha {
  file: string;
  line: number;
  type: "HACK" | "FIXME" | "WARNING" | "IMPORTANT" | "TODO" | "NOTE";
  comment: string;
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

type GotchaType = Gotcha["type"];

const TYPE_RANK: Record<GotchaType, number> = {
  HACK: 0,
  FIXME: 1,
  WARNING: 2,
  IMPORTANT: 3,
  TODO: 4,
  NOTE: 5,
};

// Regex to match keyword and capture everything after it on the line
const GOTCHA_REGEX =
  /\b(HACK|FIXME|WARNING|IMPORTANT|TODO|NOTE)\b[:\s]*(.*)/i;

function extractComment(rawMatch: string): string {
  // Remove leading comment markers: //, #, *, /*, etc.
  return rawMatch
    .replace(/^[/*#\s]+/, "")
    .replace(/\*\/$/, "")
    .trim();
}

function isBinary(content: string): boolean {
  const probe = content.slice(0, 512);
  return probe.includes("\0");
}

export async function scanGotchas(
  projectPath: string,
  maxResults = 20,
): Promise<Gotcha[]> {
  try {
    const files = await fg("**/*", {
      cwd: projectPath,
      onlyFiles: true,
      ignore: IGNORE_PATTERNS,
      dot: false,
    });

    const found: Gotcha[] = [];
    const seenComments = new Map<string, number>(); // text → count

    for (const relPath of files) {
      const absPath = path.join(projectPath, relPath);
      const raw = await readFileSafe(absPath);
      if (!raw) continue;
      if (isBinary(raw)) continue;

      const lines = raw.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match = GOTCHA_REGEX.exec(line);
        if (!match) continue;

        const type = match[1].toUpperCase() as GotchaType;
        const rawComment = match[2] ?? "";
        const comment = extractComment(rawComment);
        if (!comment) continue;

        const count = (seenComments.get(comment) ?? 0) + 1;
        seenComments.set(comment, count);

        // Deduplicate: if same text seen 3+ times, skip subsequent occurrences
        if (count >= 3 && count > 1) {
          if (count > 3) continue;
          // Keep the first occurrence (count=1 already added), skip count 2+
          continue;
        }
        if (count === 2) continue;

        found.push({
          file: relPath,
          line: i + 1,
          type,
          comment,
        });
      }
    }

    // Sort by rank (HACK first, NOTE last), then by file/line for stable order
    found.sort((a, b) => {
      const rankDiff = TYPE_RANK[a.type] - TYPE_RANK[b.type];
      if (rankDiff !== 0) return rankDiff;
      if (a.file !== b.file) return a.file.localeCompare(b.file);
      return a.line - b.line;
    });

    return found.slice(0, maxResults);
  } catch {
    return [];
  }
}
