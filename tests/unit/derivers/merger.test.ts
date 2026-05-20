import { describe, it, expect } from "vitest";
import {
  extractCustomBlocks,
  injectCustomBlocks,
  buildCustomSection,
} from "../../../src/derivers/merger.js";

const CUSTOM_START = "<!-- AGENTS-SYNC:CUSTOM:START -->";
const CUSTOM_END = "<!-- AGENTS-SYNC:CUSTOM:END -->";

describe("extractCustomBlocks", () => {
  it("returns empty array when no markers present", () => {
    expect(extractCustomBlocks("# AGENTS.md\n\nNo custom sections here.")).toEqual([]);
  });

  it("extracts a single custom block", () => {
    const content = `# AGENTS.md\n\n${CUSTOM_START}\nPayments module: check with @alice first.\n${CUSTOM_END}\n`;
    const blocks = extractCustomBlocks(content);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toContain("check with @alice first");
  });

  it("extracts multiple custom blocks", () => {
    const content =
      `${CUSTOM_START}\nBlock one\n${CUSTOM_END}\n` +
      `${CUSTOM_START}\nBlock two\n${CUSTOM_END}\n`;
    const blocks = extractCustomBlocks(content);

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toContain("Block one");
    expect(blocks[1]).toContain("Block two");
  });

  it("ignores empty blocks", () => {
    const content = `${CUSTOM_START}\n   \n${CUSTOM_END}\n`;
    expect(extractCustomBlocks(content)).toHaveLength(0);
  });

  it("handles unclosed start marker gracefully", () => {
    const content = `${CUSTOM_START}\nsome content — no end marker`;
    expect(extractCustomBlocks(content)).toHaveLength(0);
  });
});

describe("injectCustomBlocks", () => {
  it("returns original content unchanged when no blocks", () => {
    const generated = "# AGENTS.md\n\nSome content.";
    expect(injectCustomBlocks(generated, [])).toBe(generated);
  });

  it("appends custom blocks after generated content", () => {
    const generated = "# AGENTS.md\n\nSome content.";
    const result = injectCustomBlocks(generated, ["\nUser note\n"]);

    expect(result).toContain(generated);
    expect(result).toContain(CUSTOM_START);
    expect(result).toContain("User note");
    expect(result).toContain(CUSTOM_END);
    // Custom section appears after the generated body
    expect(result.indexOf(generated)).toBeLessThan(result.indexOf(CUSTOM_START));
  });

  it("round-trips: extract → inject → extract gives same blocks", () => {
    const original = `# AGENTS.md\n\n${CUSTOM_START}\nmy custom note\n${CUSTOM_END}\n`;
    const blocks = extractCustomBlocks(original);
    const regenerated = "# AGENTS.md\n\nNew generated content.";
    const result = injectCustomBlocks(regenerated, blocks);

    expect(extractCustomBlocks(result)).toEqual(blocks);
  });
});

describe("buildCustomSection", () => {
  it("wraps content in markers", () => {
    const result = buildCustomSection("Check with @alice first.");

    expect(result).toContain(CUSTOM_START);
    expect(result).toContain("Check with @alice first.");
    expect(result).toContain(CUSTOM_END);
  });
});
