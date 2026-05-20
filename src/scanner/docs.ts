import path from "node:path";
import { readFileSafe } from "../lib/file-utils.js";
import { estimateTokens, truncateToTokenBudget } from "../lib/token-estimate.js";

export interface DocData {
  readme: string | null;
  contributing: string | null;
  architecture: string | null;
  existingAgentsMd: string | null;
  existingClaudeMd: string | null;
  existingCursorRules: string | null;
  hasExistingClaudeMd: boolean;
  hasExistingAgentsMd: boolean;
  totalTokens: number;
}

interface DocSpec {
  field: keyof DocData;
  candidates: string[];
  budget: number;
}

const DOC_SPECS: DocSpec[] = [
  { field: "existingAgentsMd", candidates: ["AGENTS.md"], budget: 3000 },
  { field: "existingClaudeMd", candidates: ["CLAUDE.md"], budget: 2000 },
  { field: "readme", candidates: ["README.md", "readme.md", "README.rst"], budget: 2500 },
  { field: "contributing", candidates: ["CONTRIBUTING.md", "contributing.md"], budget: 1000 },
  {
    field: "architecture",
    candidates: [
      "ARCHITECTURE.md",
      "architecture.md",
      "docs/ARCHITECTURE.md",
      "docs/architecture.md",
    ],
    budget: 1500,
  },
  { field: "existingCursorRules", candidates: [".cursorrules"], budget: 500 },
];

async function readFirstMatch(
  projectPath: string,
  candidates: string[],
  budget: number,
): Promise<string | null> {
  for (const candidate of candidates) {
    const raw = await readFileSafe(path.join(projectPath, candidate));
    if (raw !== null) {
      const { text } = truncateToTokenBudget(raw, budget);
      return text;
    }
  }
  return null;
}

export async function scanDocs(projectPath: string): Promise<DocData> {
  const result: DocData = {
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

  for (const spec of DOC_SPECS) {
    try {
      const content = await readFirstMatch(projectPath, spec.candidates, spec.budget);
      (result[spec.field] as string | null) = content;
    } catch {
      // leave null
    }
  }

  result.hasExistingClaudeMd = result.existingClaudeMd !== null;
  result.hasExistingAgentsMd = result.existingAgentsMd !== null;

  result.totalTokens =
    estimateTokens(result.readme ?? "") +
    estimateTokens(result.contributing ?? "") +
    estimateTokens(result.architecture ?? "") +
    estimateTokens(result.existingAgentsMd ?? "") +
    estimateTokens(result.existingClaudeMd ?? "") +
    estimateTokens(result.existingCursorRules ?? "");

  return result;
}
