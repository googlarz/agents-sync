#!/usr/bin/env node
/**
 * agents-sync CLI
 *
 * Usage:
 *   npx @googlarz/agents-sync                  Start MCP server (default)
 *   npx @googlarz/agents-sync init [path]      Generate all context files
 *   npx @googlarz/agents-sync sync [path]      Re-sync after codebase changes
 *   npx @googlarz/agents-sync drift [path]     Check what changed
 *   npx @googlarz/agents-sync validate [path]  Check files are in sync
 *   npx @googlarz/agents-sync status [path]    Show sync status
 *   npx @googlarz/agents-sync export <tool> [path]  Re-derive a single file
 */
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import process from "node:process";
import { isAgentsSyncError } from "./lib/errors.js";

const args = process.argv.slice(2);
const cwd = process.cwd();

// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------

function hasFlag(...flags: string[]): boolean {
  return flags.some((f) => args.includes(f));
}

function removeFlags(argv: string[]): string[] {
  return argv.filter((a) => !a.startsWith("--") && !a.startsWith("-"));
}

// ---------------------------------------------------------------------------
// --version / --help
// ---------------------------------------------------------------------------

if (hasFlag("--version", "-v")) {
  const pkgPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as { version: string };
  process.stdout.write(`@googlarz/agents-sync v${pkg.version}\n`);
  process.exit(0);
}

if (hasFlag("--help", "-h")) {
  process.stdout.write(`
agents-sync — AI context file generator and syncer

USAGE
  agents-sync [command] [path] [options]

COMMANDS
  init [path]               Analyze codebase, generate all context files
  sync [path]               Re-sync after codebase changes
  drift [path]              Check what changed since last sync
  validate [path]           Check if all files match AGENTS.md
  status [path]             Show sync status and managed files
  export <tool> [path]      Re-derive a single tool file (no API call)
                            Tools: claude, cursor, copilot, gemini, windsurf, cline

  (no command)              Start MCP server (stdio transport)

OPTIONS
  --dry-run                 Preview changes without writing files
  --fast                    sync only — skip API call if drift is minor
  --ci                      drift only — exit 1 when drift is HIGH (for CI)
  --tools <list>            Comma-separated tools to generate (init/sync)
                            e.g. --tools claude,cursor,copilot
  --repomix-output <file>   Use repomix XML/text output as source corpus
                            (init/sync) instead of filesystem sampling
  --version, -v             Print version
  --help, -h                Show this help

EXAMPLES
  npx @googlarz/agents-sync init .
  npx @googlarz/agents-sync sync . --fast
  npx @googlarz/agents-sync drift . --ci
  npx @googlarz/agents-sync export cursor .

SETUP (MCP — Claude Code)
  Add to ~/.claude/claude_desktop_config.json or .claude/settings.json:

  {
    "mcpServers": {
      "agents-sync": {
        "command": "npx",
        "args": ["@googlarz/agents-sync"],
        "env": { "ANTHROPIC_API_KEY": "sk-ant-..." }
      }
    }
  }

ENVIRONMENT
  ANTHROPIC_API_KEY     Required for init and sync
  AGENTS_SYNC_DEBUG=1   Verbose debug output to stderr
  NO_COLOR=1            Disable ANSI color

`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// CLI subcommand dispatch
// ---------------------------------------------------------------------------

const positional = removeFlags(args);
const subcommand = positional[0];

const dryRun = hasFlag("--dry-run");
const fast = hasFlag("--fast");
const ci = hasFlag("--ci");

function resolvePath(pos: string | undefined): string {
  return pos ? path.resolve(pos) : cwd;
}

function getTools(): string[] | undefined {
  const idx = args.indexOf("--tools");
  if (idx === -1) return undefined;
  const val = args[idx + 1];
  return val ? val.split(",").map((t) => t.trim()) : undefined;
}

function getFlag(name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

function die(msg: string): never {
  process.stderr.write(`agents-sync error: ${msg}\n`);
  process.exit(1);
}

function printResult(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + "\n");
}

async function runCli(): Promise<void> {
  switch (subcommand) {
    case "init": {
      const { runInit } = await import("./tools/init.js");
      const projectPath = resolvePath(positional[1]);
      const tools = getTools() as Parameters<typeof runInit>[0]["tools"];
      const repomixOutput = getFlag("--repomix-output");
      const result = await runInit({ projectPath, tools, dryRun, repomixOutput });
      if (result.dryRun) {
        process.stdout.write(`Dry run — no files written.\n`);
        process.stdout.write(`Would generate:\n`);
        process.stdout.write(`  AGENTS.md\n`);
      } else {
        process.stdout.write(`✓ AGENTS.md → ${result.agentsMdPath}\n`);
        for (const f of result.filesWritten) {
          process.stdout.write(`✓ ${f.tool} → ${f.path}\n`);
        }
        if (result.preservedExistingFiles.length > 0) {
          process.stdout.write(`\n⚠ Preserved pre-existing files as custom sections:\n`);
          for (const f of result.preservedExistingFiles) {
            process.stdout.write(`  ${f}\n`);
          }
        }
      }
      for (const w of result.warnings) {
        process.stdout.write(`  → ${w}\n`);
      }
      break;
    }

    case "sync": {
      const { runSync } = await import("./tools/sync.js");
      const projectPath = resolvePath(positional[1]);
      const tools = getTools() as Parameters<typeof runSync>[0]["tools"];
      const repomixOutput = getFlag("--repomix-output");
      const result = await runSync({ projectPath, tools, fast, dryRun, repomixOutput });
      for (const f of result.filesUpdated) {
        process.stdout.write(`✓ ${f.tool} → ${f.path}\n`);
      }
      for (const w of result.warnings) {
        process.stdout.write(`  → ${w}\n`);
      }
      break;
    }

    case "drift": {
      const { runDrift } = await import("./tools/drift.js");
      const projectPath = resolvePath(positional[1]);
      const result = await runDrift({ projectPath });
      process.stdout.write(result.report + "\n");
      if (ci && result.highDrift) {
        process.exit(1);
      }
      break;
    }

    case "validate": {
      const { runValidate } = await import("./tools/validate.js");
      const projectPath = resolvePath(positional[1]);
      const result = await runValidate({ projectPath });
      process.stdout.write(result.report + "\n");
      if (!result.allInSync) process.exit(1);
      break;
    }

    case "status": {
      const { runStatus } = await import("./tools/status.js");
      const projectPath = resolvePath(positional[1]);
      const result = await runStatus({ projectPath });
      printResult(result);
      break;
    }

    case "export": {
      const { runExport } = await import("./tools/export.js");
      const tool = positional[1];
      const projectPath = resolvePath(positional[2]);
      if (!tool) die("export requires a tool name: claude, cursor, copilot, gemini, windsurf, cline");
      const result = await runExport({ projectPath, tool: tool as Parameters<typeof runExport>[0]["tool"] });
      process.stdout.write(result.report + "\n");
      break;
    }

    case undefined:
    case "--mcp": {
      // Default: start MCP server
      await import("./server.js");
      break;
    }

    default:
      die(`unknown command: ${subcommand}. Run --help for usage.`);
  }
}

runCli().catch((err: unknown) => {
  if (isAgentsSyncError(err) && err.code === "MISSING_API_KEY") {
    process.stderr.write(
      [
        "",
        "  agents-sync: ANTHROPIC_API_KEY not set",
        "",
        "  The init and sync commands call Claude to analyze your codebase.",
        "  These commands do NOT need an API key:",
        "    agents-sync drift     agents-sync validate",
        "    agents-sync status    agents-sync export",
        "",
        "  Get a key at: https://console.anthropic.com/",
        "  Then set it:  export ANTHROPIC_API_KEY=sk-ant-...",
        "",
      ].join("\n"),
    );
    process.exit(1);
  }
  const msg = isAgentsSyncError(err) ? err.format() : err instanceof Error ? err.message : String(err);
  process.stderr.write(`agents-sync error: ${msg}\n`);
  process.exit(1);
});
