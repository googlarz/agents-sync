import { readFileSafe } from "../lib/file-utils.js";

const CUSTOM_START = "<!-- AGENTS-SYNC:CUSTOM:START -->";
const CUSTOM_END = "<!-- AGENTS-SYNC:CUSTOM:END -->";

const CUSTOM_DIVIDER =
  "\n---\n<!-- Custom additions — preserved on re-sync. Edit freely. -->\n";

/**
 * Returns all text between CUSTOM_START and CUSTOM_END markers.
 * Multiple blocks are supported; each returned string is the inner content
 * (exclusive of the marker lines themselves).
 */
export function extractCustomBlocks(content: string): string[] {
  const blocks: string[] = [];
  let searchFrom = 0;

  while (true) {
    const startIdx = content.indexOf(CUSTOM_START, searchFrom);
    if (startIdx === -1) break;

    const endIdx = content.indexOf(CUSTOM_END, startIdx + CUSTOM_START.length);
    if (endIdx === -1) break;

    const inner = content.slice(startIdx + CUSTOM_START.length, endIdx);
    // Only include non-empty blocks (after trimming surrounding newlines).
    if (inner.trim().length > 0) {
      blocks.push(inner);
    }

    searchFrom = endIdx + CUSTOM_END.length;
  }

  return blocks;
}

/**
 * Appends custom blocks at the end of the generated content, each wrapped in
 * markers and preceded by a divider on the first block.
 */
export function injectCustomBlocks(generated: string, blocks: string[]): string {
  if (blocks.length === 0) return generated;

  const wrapped = blocks
    .map((block) => `${CUSTOM_START}${block}${CUSTOM_END}`)
    .join("\n");

  return `${generated}${CUSTOM_DIVIDER}${wrapped}\n`;
}

/**
 * Reads the file at filePath (if it exists) and extracts its custom blocks.
 * Returns [] when the file is missing or contains no custom blocks.
 */
export async function loadExistingCustomBlocks(filePath: string): Promise<string[]> {
  const content = await readFileSafe(filePath);
  if (content === null) return [];
  return extractCustomBlocks(content);
}

/**
 * Wraps user-provided content in the CUSTOM markers so it can be embedded in a
 * managed file.
 */
export function buildCustomSection(userContent: string): string {
  return `${CUSTOM_START}\n${userContent}\n${CUSTOM_END}`;
}
