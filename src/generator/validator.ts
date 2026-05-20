export interface ValidationResult {
  passed: boolean;
  failures: string[];
  warnings: string[];
}

const MIN_CONVENTIONS = 2;
const MIN_WORDS = 300;
const MAX_WORDS = 1200;

export function validateAgentsMd(content: string, knownDirs: string[] = []): ValidationResult {
  const failures: string[] = [];
  const warnings: string[] = [];

  // Must have the header
  if (!content.includes("# AGENTS.md")) {
    failures.push("Missing '# AGENTS.md' header");
  }

  // Word count
  const words = content.split(/\s+/).filter(Boolean).length;
  if (words < MIN_WORDS) {
    failures.push(`Too short: ${words} words (minimum ${MIN_WORDS}). Output is too generic.`);
  }
  if (words > MAX_WORDS) {
    warnings.push(`Long: ${words} words. Consider trimming for readability.`);
  }

  // Must have conventions section with specific rules
  const conventionsMatch = content.match(/## Conventions\n([\s\S]*?)(?=\n## |\n# |$)/);
  if (!conventionsMatch) {
    failures.push("Missing '## Conventions' section");
  } else {
    const convText = conventionsMatch[1];
    const bulletCount = (convText.match(/^[-*\d]/gm) ?? []).length;
    if (bulletCount < MIN_CONVENTIONS) {
      failures.push(`Conventions section has ${bulletCount} items (minimum ${MIN_CONVENTIONS})`);
    }
    // Detect generic advice
    const genericPhrases = ["best practices", "follow conventions", "write clean code", "use good names"];
    for (const phrase of genericPhrases) {
      if (convText.toLowerCase().includes(phrase)) {
        warnings.push(`Generic phrase detected in Conventions: "${phrase}" — should be specific`);
      }
    }
  }

  // Must have boundaries section
  if (!content.includes("### Never")) {
    failures.push("Missing '### Never' section under Boundaries");
  }

  // Architecture dirs should reference real directories
  if (knownDirs.length > 0) {
    const archMatch = content.match(/## Architecture\n([\s\S]*?)(?=\n## |\n# |$)/);
    if (archMatch) {
      const archText = archMatch[1];
      const referencedDirs = archText.match(/`([^`]+)`|`([^`]+)`|\b(src\/\w+|tests?\/|\w+\/)/g) ?? [];
      const hasRealDir = referencedDirs.some((d) =>
        knownDirs.some((kd) => d.includes(kd.split("/")[0])),
      );
      if (!hasRealDir && knownDirs.length > 2) {
        warnings.push("Architecture section may not reference actual project directories");
      }
    }
  }

  // Testing section should have a command
  if (content.includes("## Testing")) {
    const testMatch = content.match(/## Testing\n([\s\S]*?)(?=\n## |\n# |$)/);
    if (testMatch && !testMatch[1].match(/`[^`]+`/)) {
      warnings.push("Testing section has no code-formatted command (e.g. `npm test`)");
    }
  }

  return {
    passed: failures.length === 0,
    failures,
    warnings,
  };
}
