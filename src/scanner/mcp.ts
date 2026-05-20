/**
 * MCP server scanner.
 *
 * Reads .claude/settings.json (project-level) and optionally
 * .claude/settings.local.json to discover which MCP servers this
 * project expects to be configured.
 *
 * Does NOT read ~/.claude/claude_desktop_config.json — that's user-level
 * and outside the project boundary.
 */
import path from "node:path";
import fs from "node:fs/promises";

export interface McpServerInfo {
  name: string;
  command: string;
  description?: string;
}

export interface McpScanResult {
  servers: McpServerInfo[];
  hasAny: boolean;
}

interface ClaudeSettings {
  mcpServers?: Record<string, {
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    description?: string;
  }>;
}

async function readSettings(filePath: string): Promise<ClaudeSettings | null> {
  const raw = await fs.readFile(filePath, "utf-8").catch(() => null);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ClaudeSettings;
  } catch {
    return null;
  }
}

// Infer a human-readable description from the server name/command.
function inferDescription(name: string, command: string, args: string[]): string {
  const all = [name, command, ...args].join(" ").toLowerCase();

  if (/postgres|pg\b/.test(all)) return "PostgreSQL database access";
  if (/mysql|mariadb/.test(all)) return "MySQL database access";
  if (/sqlite/.test(all)) return "SQLite database access";
  if (/redis/.test(all)) return "Redis cache access";
  if (/mongodb|mongo\b/.test(all)) return "MongoDB database access";
  if (/github/.test(all)) return "GitHub API access";
  if (/gitlab/.test(all)) return "GitLab API access";
  if (/linear/.test(all)) return "Linear issue tracking";
  if (/slack/.test(all)) return "Slack messaging";
  if (/stripe/.test(all)) return "Stripe payments";
  if (/filesystem|fs\b/.test(all)) return "Filesystem access";
  if (/browser|playwright|puppeteer/.test(all)) return "Browser automation";
  if (/fetch|http/.test(all)) return "HTTP fetch";
  if (/memory|recall/.test(all)) return "Persistent memory";
  if (/docker/.test(all)) return "Docker container management";

  return `${name} MCP server`;
}

export async function scanMcpServers(projectPath: string): Promise<McpScanResult> {
  const candidates = [
    path.join(projectPath, ".claude", "settings.json"),
    path.join(projectPath, ".claude", "settings.local.json"),
  ];

  const serverMap = new Map<string, McpServerInfo>();

  for (const candidate of candidates) {
    const settings = await readSettings(candidate);
    if (!settings?.mcpServers) continue;

    for (const [name, config] of Object.entries(settings.mcpServers)) {
      if (serverMap.has(name)) continue; // first file wins
      const command = [config.command ?? "npx", ...(config.args ?? [])].join(" ");
      const description = config.description ?? inferDescription(name, config.command ?? "", config.args ?? []);
      serverMap.set(name, { name, command, description });
    }
  }

  const servers = Array.from(serverMap.values());
  return { servers, hasAny: servers.length > 0 };
}

export function formatMcpSection(result: McpScanResult): string {
  if (!result.hasAny) return "";

  const lines: string[] = [
    "## MCP Servers",
    "",
    "The following MCP servers are configured for this project (`.claude/settings.json`):",
    "",
  ];

  for (const s of result.servers) {
    lines.push(`- **${s.name}** — ${s.description}`);
  }

  lines.push("");
  lines.push("To configure: add entries to `.claude/settings.json` in the project root.");

  return lines.join("\n");
}
