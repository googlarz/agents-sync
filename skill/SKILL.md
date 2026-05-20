---
name: agents-sync
description: Generate and sync AI context files (AGENTS.md, CLAUDE.md, .cursorrules, copilot-instructions.md) from your codebase. One canonical source, every tool stays current.
version: 1.0.0
---

# agents-sync

Generate and sync AI context files across every coding tool you use.

## Prerequisites

Add to your Claude Code MCP config (`.claude/settings.json` or `~/.claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "agents-sync": {
      "command": "npx",
      "args": ["@googlarz/agents-sync"],
      "env": { "ANTHROPIC_API_KEY": "sk-ant-..." }
    }
  }
}
```

Then restart Claude Code to connect.

## Commands

### `/agents-sync init`

First-time setup. Reads your codebase and generates all context files.

**When to use:** New project, or starting from scratch.

**What it does:**
1. Scans your codebase (manifests, structure, source samples, docs, TODO/FIXME comments)
2. Extracts project metadata via Claude API
3. Generates canonical `AGENTS.md`
4. Derives `CLAUDE.md`, `.cursorrules`, `.github/copilot-instructions.md`
5. Saves a snapshot for drift detection

**Usage:**
> Run `/agents-sync init` on this project

Claude will call `agents_sync_init` with the current project path.

---

### `/agents-sync sync`

Re-sync after your codebase has changed. Preserves any manual customizations.

**When to use:** After major refactors, new dependencies, architecture changes.

**Options:**
- Add `--fast` to skip Claude API call when drift is minor (re-derives from existing AGENTS.md)
- Add `--dry-run` to preview changes without writing

**Usage:**
> Sync my AI context files
> `/agents-sync sync --fast`

---

### `/agents-sync drift`

Check what changed in your codebase since the last sync. Read-only.

**Usage:**
> What's drifted in my AI context files?
> `/agents-sync drift`

---

### `/agents-sync export [tool]`

Re-derive a single tool file without re-running analysis.

**Tools:** `claude`, `cursor`, `copilot`

**Usage:**
> `/agents-sync export cursor`
> Regenerate just my .cursorrules

---

### `/agents-sync validate`

Check whether all managed files are in sync with AGENTS.md.

**Usage:**
> `/agents-sync validate`
> Are my AI context files in sync?

---

### `/agents-sync status`

Show sync status: last sync time, managed files, drift score.

**Usage:**
> `/agents-sync status`

---

## How Claude Should Handle These Commands

When the user types `/agents-sync <command>`, call the corresponding MCP tool:

| Command | MCP Tool | Required params |
|---|---|---|
| `init` | `agents_sync_init` | `projectPath` = cwd |
| `sync` | `agents_sync_sync` | `projectPath` = cwd |
| `drift` | `agents_sync_drift` | `projectPath` = cwd |
| `export <tool>` | `agents_sync_export` | `projectPath` = cwd, `tool` = argument |
| `validate` | `agents_sync_validate` | `projectPath` = cwd |
| `status` | `agents_sync_status` | `projectPath` = cwd |

**Determine `projectPath`:** Use the current working directory. If ambiguous, ask the user which project to target.

**If MCP not connected:** Respond with:
> agents-sync MCP server is not connected. Add this to your Claude Code settings and restart:
> ```json
> {
>   "mcpServers": {
>     "agents-sync": {
>       "command": "npx",
>       "args": ["@googlarz/agents-sync"],
>       "env": { "ANTHROPIC_API_KEY": "sk-ant-..." }
>     }
>   }
> }
> ```

**After init:** Remind the user to:
1. Add `AGENTS.md` to git
2. Add `.agents-sync/` to `.gitignore`

**After sync:** Show the list of files updated.

**Flags parsing:**
- `--fast` → set `fast: true` in `agents_sync_sync`
- `--dry-run` → set `dryRun: true`

## Custom Sections

Users can add permanent customizations to any managed file that survive re-syncs:

```markdown
<!-- AGENTS-SYNC:CUSTOM:START -->
When working on the payments module, always check with @alice first.
Use staging Stripe keys (in .env.staging) for all local testing.
<!-- AGENTS-SYNC:CUSTOM:END -->
```

Add this anywhere in `AGENTS.md`, `CLAUDE.md`, or `.cursorrules`. Re-sync preserves it.
