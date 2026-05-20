#!/usr/bin/env node
/**
 * agents-sync CLI — run as `npx @googlarz/agents-sync` or `agents-sync`
 * Routes to the MCP server by default, or handles --version / --help.
 */
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const args = process.argv.slice(2);

if (args.includes("--version") || args.includes("-v")) {
  const pkgPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as { version: string };
  process.stdout.write(`@googlarz/agents-sync v${pkg.version}\n`);
  process.exit(0);
}

if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write(`
agents-sync — AI context file generator and syncer

USAGE
  agents-sync [--version] [--help]

  When invoked without flags, starts the MCP server (stdio transport).
  Connect via your AI tool's MCP configuration.

SETUP (Claude Code)
  Add to your ~/.claude/claude_desktop_config.json or project .claude/settings.json:

  {
    "mcpServers": {
      "agents-sync": {
        "command": "npx",
        "args": ["@googlarz/agents-sync"],
        "env": { "ANTHROPIC_API_KEY": "sk-ant-..." }
      }
    }
  }

SETUP (Cursor)
  Add to .cursor/mcp.json:

  {
    "mcpServers": {
      "agents-sync": {
        "command": "npx",
        "args": ["@googlarz/agents-sync"],
        "env": { "ANTHROPIC_API_KEY": "sk-ant-..." }
      }
    }
  }

TOOLS AVAILABLE (via MCP)
  agents_sync_init      Analyze codebase, generate all context files
  agents_sync_sync      Re-sync after codebase changes
  agents_sync_drift     Check what changed since last sync
  agents_sync_export    Re-derive a single tool file
  agents_sync_validate  Check if files are in sync
  agents_sync_status    Show sync status

ENVIRONMENT
  ANTHROPIC_API_KEY     Required for init and sync commands
  AGENTS_SYNC_DEBUG=1   Enable verbose debug output to stderr
  NO_COLOR=1            Disable ANSI color in output

`);
  process.exit(0);
}

// Default: start MCP server
import("./server.js");
