import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { toMcpError } from "./lib/errors.js";
import { runInit } from "./tools/init.js";
import { runSync } from "./tools/sync.js";
import { runDrift } from "./tools/drift.js";
import { runExport } from "./tools/export.js";
import { runValidate } from "./tools/validate.js";
import { runStatus } from "./tools/status.js";
import { runLint } from "./tools/lint.js";
import { runScanReport } from "./tools/scan-report.js";
import { runInstallHook, runUninstallHook } from "./tools/install-hook.js";

const VERSION = "1.5.1";

const server = new McpServer({
  name: "agents-sync",
  version: VERSION,
});

// ─── agents_sync_init ────────────────────────────────────────────────────────

server.tool(
  "agents_sync_init",
  "Analyze a codebase and generate AGENTS.md + all tool-specific context files (CLAUDE.md, .cursorrules, copilot-instructions.md, GEMINI.md, .windsurfrules, .clinerules). Run this once per project.",
  {
    projectPath: z.string().describe("Absolute path to the project root directory"),
    tools: z
      .array(z.enum(["claude", "cursor", "copilot", "gemini", "windsurf", "cline", "roo", "aider"]))
      .optional()
      .describe("Which tool files to generate. Default: all six."),
    dryRun: z
      .boolean()
      .optional()
      .describe("Preview what would be generated without writing any files."),
  },
  async ({ projectPath, tools, dryRun }) => {
    try {
      const result = await runInit({ projectPath, tools, dryRun });
      const lines: string[] = [];

      if (result.dryRun) {
        lines.push("DRY RUN — no files written\n");
        lines.push(`→ Would write: ${result.agentsMdPath}`);
        for (const f of result.filesWritten) {
          lines.push(`→ Would write: ${f.path}`);
        }
      } else {
        lines.push(`✓ AGENTS.md → ${result.agentsMdPath}`);
        for (const f of result.filesWritten) {
          lines.push(`✓ ${f.tool} → ${f.path}`);
        }
      }
      if (result.customSectionsPreserved > 0) {
        lines.push(`\n  ${result.customSectionsPreserved} custom section(s) preserved from existing files`);
      }
      if (result.warnings.length > 0) {
        lines.push("\nWarnings:");
        for (const w of result.warnings) lines.push(`  ⚠ ${w}`);
      }
      if (!result.dryRun) {
        lines.push("\n✓ Snapshot saved to .agents-sync/");
        lines.push("  → Add AGENTS.md to git. Add .agents-sync/ to .gitignore.");
      }

      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    } catch (e) {
      return { content: [{ type: "text" as const, text: `Error: ${toMcpError(e)}` }], isError: true };
    }
  },
);

// ─── agents_sync_sync ────────────────────────────────────────────────────────

server.tool(
  "agents_sync_sync",
  "Re-analyze the codebase and update all tool context files from current state. Preserves manual custom sections.",
  {
    projectPath: z.string().describe("Absolute path to the project root directory"),
    tools: z
      .array(z.enum(["claude", "cursor", "copilot", "gemini", "windsurf", "cline", "roo", "aider"]))
      .optional()
      .describe("Which tool files to update. Default: all."),
    fast: z
      .boolean()
      .optional()
      .describe("Skip re-extraction if only minor drift detected. No Claude API call."),
    dryRun: z.boolean().optional().describe("Preview changes without writing."),
  },
  async ({ projectPath, tools, fast, dryRun }) => {
    try {
      const result = await runSync({ projectPath, tools, fast, dryRun });
      const lines: string[] = [];

      if (result.dryRun) lines.push("DRY RUN — no files written\n");
      if (result.skippedExtraction) lines.push("⚡ Fast mode: skipped re-extraction\n");

      for (const f of result.filesUpdated) {
        lines.push(result.dryRun ? `→ Would write: ${f.path}` : `✓ ${f.tool} → ${f.path}`);
      }

      if (result.customSectionsPreserved > 0) {
        lines.push(`\n  ${result.customSectionsPreserved} custom section(s) preserved`);
      }
      if (result.warnings.length > 0) {
        lines.push("\nWarnings:");
        for (const w of result.warnings) lines.push(`  ⚠ ${w}`);
      }

      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    } catch (e) {
      return { content: [{ type: "text" as const, text: `Error: ${toMcpError(e)}` }], isError: true };
    }
  },
);

// ─── agents_sync_drift ───────────────────────────────────────────────────────

server.tool(
  "agents_sync_drift",
  "Check what has changed in the codebase since the last sync. Read-only — makes no changes.",
  {
    projectPath: z.string().describe("Absolute path to the project root directory"),
  },
  async ({ projectPath }) => {
    try {
      const result = await runDrift({ projectPath });

      if (!result.hasSnapshot) {
        return {
          content: [{
            type: "text" as const,
            text: "No snapshot found. Run /agents-sync init first to start tracking drift.",
          }],
        };
      }

      return { content: [{ type: "text" as const, text: result.report ?? "No report available." }] };
    } catch (e) {
      return { content: [{ type: "text" as const, text: `Error: ${toMcpError(e)}` }], isError: true };
    }
  },
);

// ─── agents_sync_export ──────────────────────────────────────────────────────

server.tool(
  "agents_sync_export",
  "Regenerate a single tool file from the existing AGENTS.md without re-running analysis.",
  {
    projectPath: z.string().describe("Absolute path to the project root directory"),
    tool: z
      .enum(["claude", "cursor", "copilot", "gemini", "windsurf", "cline", "roo", "aider"])
      .describe("Which tool file to regenerate"),
  },
  async ({ projectPath, tool }) => {
    try {
      const result = await runExport({ projectPath, tool });

      if (result.error) {
        return { content: [{ type: "text" as const, text: `Error: ${result.error}` }], isError: true };
      }

      return {
        content: [{
          type: "text" as const,
          text: `✓ ${result.tool} → ${result.path}`,
        }],
      };
    } catch (e) {
      return { content: [{ type: "text" as const, text: `Error: ${toMcpError(e)}` }], isError: true };
    }
  },
);

// ─── agents_sync_validate ────────────────────────────────────────────────────

server.tool(
  "agents_sync_validate",
  "Check whether all tool files are in sync with the canonical AGENTS.md. Use strict=true in CI to fail when any file is out of sync.",
  {
    projectPath: z.string().describe("Absolute path to the project root directory"),
    strict: z.boolean().optional().describe("Exit with isError=true when any file is out of sync (CI mode)."),
  },
  async ({ projectPath, strict }) => {
    try {
      const result = await runValidate({ projectPath, strict });
      const lines: string[] = [];

      const canonicalStatus = result.canonical.exists ? "✓" : "✗ MISSING";
      lines.push(`AGENTS.md (canonical)  ${canonicalStatus}`);
      lines.push("");

      for (const f of result.toolFiles) {
        const icon = f.status === "in-sync" ? "✓" : f.status === "missing" ? "✗" : "⚠";
        const label = f.status === "in-sync" ? "in sync" : f.status === "missing" ? "MISSING" : "DRIFTED";
        lines.push(`${icon} ${f.tool.padEnd(10)} ${label}  ${f.path}`);
        if (f.details) lines.push(`           ${f.details}`);
      }

      lines.push("");
      if (result.allInSync) {
        lines.push("✓ All files are in sync.");
      } else {
        lines.push("Some files are out of sync. Run /agents-sync sync to fix.");
      }

      if (!result.hasSnapshot) {
        lines.push("\nNote: No snapshot found — run /agents-sync init for full tracking.");
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
        isError: strict && !result.allInSync ? true : undefined,
      };
    } catch (e) {
      return { content: [{ type: "text" as const, text: `Error: ${toMcpError(e)}` }], isError: true };
    }
  },
);

// ─── agents_sync_status ──────────────────────────────────────────────────────

server.tool(
  "agents_sync_status",
  "Show sync status: last sync time, managed files, drift score.",
  {
    projectPath: z.string().describe("Absolute path to the project root directory"),
  },
  async ({ projectPath }) => {
    try {
      const result = await runStatus({ projectPath });
      const lines: string[] = ["agents-sync status\n"];

      if (!result.hasSnapshot) {
        lines.push("Not initialized.");
        lines.push(`\n→ ${result.recommendation}`);
      } else {
        lines.push(`Last synced:  ${result.lastSyncedAt ?? "unknown"} (${result.daysSinceSync} day${result.daysSinceSync === 1 ? "" : "s"} ago)`);
        lines.push(`Language:     ${result.language ?? "unknown"}${result.framework ? ` / ${result.framework}` : ""}`);
        lines.push(`Drift score:  ${result.driftScore}`);
        lines.push(`\nManaged files (${result.filesManaged.length}):`);
        for (const f of result.filesManaged) {
          lines.push(`  ${f.tool.padEnd(12)} ${f.path}`);
        }
        lines.push(`\n→ ${result.recommendation}`);
      }

      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    } catch (e) {
      return { content: [{ type: "text" as const, text: `Error: ${toMcpError(e)}` }], isError: true };
    }
  },
);

// ─── agents_sync_lint ────────────────────────────────────────────────────────

server.tool(
  "agents_sync_lint",
  "Verify the codebase against mechanically-checkable 'Never' rules in AGENTS.md. Returns a list of violations.",
  {
    projectPath: z.string().describe("Absolute path to the project root directory"),
    strict: z
      .boolean()
      .optional()
      .describe("Return isError=true when any violations are found (CI mode)."),
  },
  async ({ projectPath, strict }) => {
    try {
      const result = await runLint({ projectPath, strict });
      return {
        content: [{ type: "text" as const, text: result.report }],
        isError: strict && !result.passed ? true : undefined,
      };
    } catch (e) {
      return { content: [{ type: "text" as const, text: `Error: ${toMcpError(e)}` }], isError: true };
    }
  },
);

// ─── agents_sync_scan ────────────────────────────────────────────────────────

server.tool(
  "agents_sync_scan",
  "Scan a codebase and show what agents-sync detected — language, framework, dependencies, MCP servers, local skills, gotchas. Read-only, no API key needed. Run before init to verify scanner accuracy.",
  {
    projectPath: z.string().describe("Absolute path to the project root directory"),
  },
  async ({ projectPath }) => {
    try {
      const result = await runScanReport({ projectPath });
      return { content: [{ type: "text" as const, text: result.report }] };
    } catch (e) {
      return { content: [{ type: "text" as const, text: `Error: ${toMcpError(e)}` }], isError: true };
    }
  },
);

// ─── agents_sync_install_hook ─────────────────────────────────────────────────

server.tool(
  "agents_sync_install_hook",
  "Install a pre-commit hook that blocks commits when AI context files have drifted from AGENTS.md. Auto-detects husky, lefthook, or plain git hooks.",
  {
    projectPath: z.string().describe("Absolute path to the project root directory"),
    manager: z
      .enum(["husky", "lefthook", "git"])
      .optional()
      .describe("Force a specific hook manager. Default: auto-detect."),
    dryRun: z
      .boolean()
      .optional()
      .describe("Preview what would be written without making changes."),
  },
  async ({ projectPath, manager, dryRun }) => {
    try {
      const result = await runInstallHook({ projectPath, manager, dryRun });
      return { content: [{ type: "text" as const, text: result.report }] };
    } catch (e) {
      return { content: [{ type: "text" as const, text: `Error: ${toMcpError(e)}` }], isError: true };
    }
  },
);

// ─── agents_sync_uninstall_hook ───────────────────────────────────────────────

server.tool(
  "agents_sync_uninstall_hook",
  "Remove the agents-sync pre-commit hook installed by agents_sync_install_hook.",
  {
    projectPath: z.string().describe("Absolute path to the project root directory"),
    manager: z
      .enum(["husky", "lefthook", "git"])
      .optional()
      .describe("Force a specific hook manager. Default: auto-detect."),
    dryRun: z
      .boolean()
      .optional()
      .describe("Preview what would be removed without making changes."),
  },
  async ({ projectPath, manager, dryRun }) => {
    try {
      const result = await runUninstallHook({ projectPath, manager, dryRun });
      return { content: [{ type: "text" as const, text: result.report }] };
    } catch (e) {
      return { content: [{ type: "text" as const, text: `Error: ${toMcpError(e)}` }], isError: true };
    }
  },
);

// ─── Start ───────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`agents-sync MCP server v${VERSION} ready\n`);
}

main().catch((e) => {
  process.stderr.write(`Fatal: ${e}\n`);
  process.exit(1);
});
