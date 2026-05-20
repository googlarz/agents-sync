# Contributing to agents-sync

Thank you for your interest. This document covers how to run the project locally, how to add
support for new languages or tools, and the pull request process.

## Prerequisites

- Node.js 18+
- An Anthropic API key (for integration tests only — unit tests run without one)

## Setup

```bash
git clone https://github.com/googlarz/agents-sync
cd agents-sync
npm install
npm run build     # compile TypeScript
npm test          # unit tests (no API key required)
```

## Running locally

```bash
# CLI
node dist/cli.js init /path/to/your/project

# MCP server (for use with Claude Code)
node dist/cli.js

# Watch mode during development
npm run dev
```

## Integration tests

Integration tests call the Claude API and write real files.

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npm run test:integration
```

## Project structure

```
src/
  cli.ts            Entry point for CLI
  server.ts         MCP server (StdioServerTransport)
  config/           agents-sync.config.json schema + loader
  derivers/         One file per tool (claude.ts, cursor.ts, …)
  extractor/        Claude API call + Zod schema for ProjectMetadata
  generator/        AGENTS.md generation
  lib/              Shared utilities
  scanner/          Codebase scanners (manifest, structure, source, docs, gotchas, repomix)
  snapshot/         Drift detection + snapshot persistence
  tools/            Orchestration for each command (init, sync, drift, …)
tests/
  fixtures/         Real project trees used by unit and integration tests
  unit/             Pure unit tests — no API calls, no filesystem writes
  integration/      End-to-end tests using real Claude API
```

## Adding a new target tool

1. Create `src/derivers/<tool>.ts`. Export an async function matching the `Deriver` interface
   (see `src/derivers/cursor.ts` as a reference).
2. Register it in `src/derivers/index.ts` — add the tool name to `ToolName` and the deriver
   to the `DERIVERS` map.
3. Update `src/server.ts` — add the tool name to each enum schema in the MCP tool definitions.
4. Add a unit test in `tests/unit/derivers/<tool>.test.ts`.
5. Update `README.md`, `skill/SKILL.md`, and the "The Problem" table.

## Adding a new language / manifest scanner

1. Open `src/scanner/manifest.ts` and extend the `detect*` functions for the new language.
2. Add a fixture directory under `tests/fixtures/<language>/` with a minimal project.
3. Add a test case in `tests/unit/scanner/manifest.test.ts`.

## Code style

- TypeScript strict mode — no `any`, use `unknown` and narrow.
- NodeNext module resolution — all local imports end in `.js`.
- Atomic file writes only — use `writeFileAtomic` from `src/lib/file-utils.ts`.
- No new dependencies without discussion — the dependency list is intentionally small.

## Pull request process

1. Open an issue first for anything beyond a trivial fix.
2. Branch from `main`. Name branches `feat/`, `fix/`, or `chore/`.
3. All unit tests must pass (`npm test`).
4. Typecheck must be clean (`npm run typecheck`).
5. For new features, add unit tests. For bugfixes, add a regression test.
6. PR description should explain the *why*, not just the *what*.

## Commit messages

Follow Conventional Commits loosely:

```
feat: add OpenRouter backend support
fix: handle empty package.json gracefully
chore: update @anthropic-ai/sdk to 0.40.0
docs: add Python/Django example to README
```

## Reporting issues

Use the GitHub issue templates. For bugs, include the output of:

```bash
AGENTS_SYNC_DEBUG=1 npx @googlarz/agents-sync init . 2>&1
```

## License

By contributing you agree that your contributions will be licensed under the MIT License.
