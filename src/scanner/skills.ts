/**
 * Project-local skill/command scanner.
 *
 * Reads .claude/commands/ for custom slash commands, and .claude/skills/ for
 * locally-installed skills. Returns a summary that can be injected into
 * CLAUDE.md so the AI knows what's available in the project.
 */
import path from "node:path";
import fs from "node:fs/promises";

export interface LocalCommand {
  name: string;
  description: string;
  filePath: string;
}

export interface LocalSkill {
  name: string;
  description: string;
  dirPath: string;
}

export interface ProjectSkillsSummary {
  commands: LocalCommand[];
  skills: LocalSkill[];
  hasAny: boolean;
}

async function listMdFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith(".md"))
      .map((e) => path.join(dir, e.name));
  } catch {
    return [];
  }
}

function extractDescription(content: string, fallback: string): string {
  // Try to find a one-line description: first non-empty line after the title,
  // or the first non-heading paragraph, or just the first line.
  const lines = content.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.startsWith("#")) continue;
    if (line.startsWith("---")) continue;
    return line.slice(0, 120);
  }
  return fallback;
}

async function readFirstLines(filePath: string, maxBytes = 500): Promise<string> {
  try {
    const buf = Buffer.alloc(maxBytes);
    const handle = await fs.open(filePath, "r");
    const { bytesRead } = await handle.read(buf, 0, maxBytes, 0);
    await handle.close();
    return buf.subarray(0, bytesRead).toString("utf-8");
  } catch {
    return "";
  }
}

export async function scanProjectSkills(projectPath: string): Promise<ProjectSkillsSummary> {
  const commandsDir = path.join(projectPath, ".claude", "commands");
  const skillsDir = path.join(projectPath, ".claude", "skills");

  const [commandFiles, skillDirs] = await Promise.all([
    listMdFiles(commandsDir),
    (async () => {
      try {
        const entries = await fs.readdir(skillsDir, { withFileTypes: true });
        return entries.filter((e) => e.isDirectory()).map((e) => path.join(skillsDir, e.name));
      } catch {
        return [];
      }
    })(),
  ]);

  const commands: LocalCommand[] = await Promise.all(
    commandFiles.map(async (filePath) => {
      const name = path.basename(filePath, ".md");
      const content = await readFirstLines(filePath);
      const description = extractDescription(content, `/${name} command`);
      return { name, description, filePath };
    }),
  );

  const skills: LocalSkill[] = await Promise.all(
    skillDirs.map(async (dirPath) => {
      const name = path.basename(dirPath);
      const skillMdPath = path.join(dirPath, "SKILL.md");
      const content = await readFirstLines(skillMdPath);
      const description = extractDescription(content, `${name} skill`);
      return { name, description, dirPath };
    }),
  );

  return {
    commands,
    skills,
    hasAny: commands.length > 0 || skills.length > 0,
  };
}

export function formatSkillsSection(summary: ProjectSkillsSummary): string {
  if (!summary.hasAny) return "";

  const lines: string[] = ["## Project Commands & Skills", ""];

  if (summary.commands.length > 0) {
    lines.push("### Custom slash commands (`.claude/commands/`)");
    for (const cmd of summary.commands) {
      lines.push(`- \`/${cmd.name}\` — ${cmd.description}`);
    }
    lines.push("");
  }

  if (summary.skills.length > 0) {
    lines.push("### Local skills (`.claude/skills/`)");
    for (const skill of summary.skills) {
      lines.push(`- \`${skill.name}\` — ${skill.description}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
