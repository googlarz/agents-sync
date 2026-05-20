import fs from "node:fs/promises";
import { estimateTokens } from "../lib/token-estimate.js";
import type { SourceData, SampledFile } from "./source.js";

/**
 * Parse a repomix output file (plain-text or XML style) and return SourceData
 * compatible with the standard scanner pipeline.
 *
 * Supports:
 *  - Default repomix plain-text output (separated by ===...=== lines)
 *  - repomix --style xml output (<file path="..."><file_content>...</file_content></file>)
 */
export async function parseRepomixOutput(repomixPath: string): Promise<SourceData> {
  const raw = await fs.readFile(repomixPath, "utf-8");
  const files = raw.trimStart().startsWith("<") ? parseXml(raw) : parsePlainText(raw);

  const sampledFiles: SampledFile[] = files.map((f) => {
    const content = f.content.slice(0, 2000);
    return { path: f.path, content, tokens: estimateTokens(content) };
  });

  const totalTokens = sampledFiles.reduce((sum, f) => sum + f.tokens, 0);
  const importStyle = detectImportStyle(sampledFiles.map((f) => f.content));

  return {
    files: sampledFiles,
    totalTokens,
    importStyle,
    detectedPatterns: [],
  };
}

// ─── XML format ──────────────────────────────────────────────────────────────

function parseXml(content: string): Array<{ path: string; content: string }> {
  const files: Array<{ path: string; content: string }> = [];
  // Match <file path="..."> ... </file>
  const fileRegex = /<file\s+path="([^"]+)"[^>]*>([\s\S]*?)<\/file>/g;
  let match: RegExpExecArray | null;

  while ((match = fileRegex.exec(content)) !== null) {
    const filePath = match[1];
    let body = match[2];

    // Unwrap <file_content> if present
    const wrapMatch = /<file_content>([\s\S]*?)<\/file_content>/i.exec(body);
    if (wrapMatch) body = wrapMatch[1];

    // Strip CDATA
    const cdataMatch = /<!\[CDATA\[([\s\S]*?)\]\]>/i.exec(body);
    if (cdataMatch) body = cdataMatch[1];

    files.push({ path: filePath, content: body.trim() });
  }

  return files;
}

// ─── Plain-text format ───────────────────────────────────────────────────────
// Pattern:
//   ================================================================
//   File: src/index.ts
//   ================================================================
//   <content>

function parsePlainText(content: string): Array<{ path: string; content: string }> {
  const files: Array<{ path: string; content: string }> = [];
  const SEPARATOR = "=".repeat(64);
  const sections = content.split(SEPARATOR);

  // After splitting: sections[0]=preamble, then pairs (header, body) at (1,2), (3,4), ...
  for (let i = 1; i + 1 < sections.length; i += 2) {
    const header = sections[i];
    const body = sections[i + 1];
    const fileMatch = /^\s*File:\s+(.+?)\s*$/m.exec(header);
    if (fileMatch) {
      files.push({ path: fileMatch[1], content: body.trim() });
    }
  }

  return files;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function detectImportStyle(
  contents: string[],
): "esm" | "cjs" | "relative-only" | "unknown" {
  let esm = 0;
  let cjs = 0;
  for (const c of contents) {
    if (/import\s+.+\s+from\s+['"][^.@]/.test(c)) esm++;
    if (/require\s*\(/.test(c)) cjs++;
  }
  if (esm > 0 && cjs === 0) return "esm";
  if (cjs > 0 && esm === 0) return "cjs";
  if (esm > 0 || cjs > 0) return esm >= cjs ? "esm" : "cjs";
  return "unknown";
}
