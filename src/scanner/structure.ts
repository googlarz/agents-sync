import path from "node:path";
import fg from "fast-glob";

export interface StructureData {
  topLevelDirs: string[];
  entryPoints: string[];
  testDirs: string[];
  totalFileCount: number;
  namingConvention: "kebab-case" | "camelCase" | "snake_case" | "PascalCase" | "mixed";
  tree: string;
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
];

const ENTRY_POINT_PATTERNS = [
  /^src\/index\./,
  /^index\./,
  /^main\./,
  /^app\./,
  /^server\./,
  /^cmd\/main\./,
  /^manage\.py$/,
  /^wsgi\.py$/,
];

function detectNamingConvention(
  names: string[],
): "kebab-case" | "camelCase" | "snake_case" | "PascalCase" | "mixed" {
  const counts = { kebab: 0, camel: 0, snake: 0, pascal: 0 };

  for (const name of names) {
    if (/^[A-Z][a-zA-Z0-9]*$/.test(name)) counts.pascal++;
    else if (/^[a-z][a-zA-Z0-9]*[A-Z]/.test(name)) counts.camel++;
    else if (name.includes("-")) counts.kebab++;
    else if (name.includes("_")) counts.snake++;
  }

  const total = names.length;
  if (total === 0) return "mixed";

  const threshold = 0.5;
  if (counts.kebab / total >= threshold) return "kebab-case";
  if (counts.camel / total >= threshold) return "camelCase";
  if (counts.snake / total >= threshold) return "snake_case";
  if (counts.pascal / total >= threshold) return "PascalCase";
  return "mixed";
}

function buildTree(files: string[], maxLines = 60): string {
  // Build a nested structure from paths
  const tree: Record<string, unknown> = {};

  for (const file of files) {
    const parts = file.split("/");
    let node: Record<string, unknown> = tree;
    for (const part of parts) {
      if (!(part in node)) {
        node[part] = {};
      }
      node = node[part] as Record<string, unknown>;
    }
  }

  const lines: string[] = ["."];

  function renderNode(
    node: Record<string, unknown>,
    prefix: string,
    depth: number,
  ): void {
    if (depth > 3) return;
    if (lines.length >= maxLines) return;

    const entries = Object.entries(node);
    entries.sort(([a], [b]) => a.localeCompare(b));

    for (let i = 0; i < entries.length; i++) {
      if (lines.length >= maxLines) return;
      const [key, child] = entries[i];
      const isLast = i === entries.length - 1;
      const connector = isLast ? "└── " : "├── ";
      const childPrefix = isLast ? "    " : "│   ";
      lines.push(`${prefix}${connector}${key}`);
      const childNode = child as Record<string, unknown>;
      if (Object.keys(childNode).length > 0) {
        renderNode(childNode, prefix + childPrefix, depth + 1);
      }
    }
  }

  renderNode(tree, "", 1);

  if (lines.length >= maxLines) {
    lines.push("... (truncated)");
  }

  return lines.join("\n");
}

export async function scanStructure(projectPath: string): Promise<StructureData> {
  try {
    // List files up to depth 3
    const files = await fg("**/*", {
      cwd: projectPath,
      onlyFiles: true,
      deep: 3,
      ignore: IGNORE_PATTERNS,
      dot: false,
    });

    // Total file count (no depth limit, capped at 9999)
    let totalFileCount: number;
    try {
      const allFiles = await fg("**/*", {
        cwd: projectPath,
        onlyFiles: true,
        ignore: IGNORE_PATTERNS,
        dot: false,
      });
      totalFileCount = Math.min(allFiles.length, 9999);
    } catch {
      totalFileCount = Math.min(files.length, 9999);
    }

    // Top-level dirs
    const topLevelDirSet = new Set<string>();
    for (const file of files) {
      const firstSegment = file.split("/")[0];
      if (firstSegment && firstSegment !== file) {
        topLevelDirSet.add(firstSegment);
      }
    }
    const topLevelDirs = Array.from(topLevelDirSet).sort();

    // Entry points
    const entryPoints = files.filter((f) =>
      ENTRY_POINT_PATTERNS.some((pattern) => pattern.test(f)),
    );

    // Test dirs
    const testDirSet = new Set<string>();
    for (const file of files) {
      const parts = file.split("/");
      for (let i = 0; i < parts.length - 1; i++) {
        const dir = parts[i];
        if (
          dir.toLowerCase().includes("test") ||
          dir.toLowerCase().includes("spec") ||
          dir === "__tests__"
        ) {
          testDirSet.add(parts.slice(0, i + 1).join("/"));
        }
      }
    }
    const testDirs = Array.from(testDirSet).sort();

    // Naming convention: sample first 20 filenames without extension
    const sampleNames = files
      .slice(0, 20)
      .map((f) => path.basename(f, path.extname(f)));
    const namingConvention = detectNamingConvention(sampleNames);

    // Tree
    const tree = buildTree(files);

    return {
      topLevelDirs,
      entryPoints,
      testDirs,
      totalFileCount,
      namingConvention,
      tree,
    };
  } catch {
    return {
      topLevelDirs: [],
      entryPoints: [],
      testDirs: [],
      totalFileCount: 0,
      namingConvention: "mixed",
      tree: ".",
    };
  }
}
