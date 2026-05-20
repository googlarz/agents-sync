import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanDocs } from "../../../src/scanner/docs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, "../../fixtures");

describe("scanDocs", () => {
  it("reads README from Next.js fixture", async () => {
    const result = await scanDocs(path.join(FIXTURES, "nextjs"));

    expect(result.readme).not.toBeNull();
    expect(result.readme!.length).toBeGreaterThan(10);
    expect(result.hasExistingAgentsMd).toBe(false);
    expect(result.hasExistingClaudeMd).toBe(false);
    expect(result.totalTokens).toBeGreaterThan(0);
  });

  it("reads README from Django fixture", async () => {
    const result = await scanDocs(path.join(FIXTURES, "django"));

    expect(result.readme).not.toBeNull();
    expect(result.readme!.toLowerCase()).toMatch(/django|api/);
  });

  it("returns nulls for empty directory", async () => {
    const result = await scanDocs("/tmp/nonexistent-agents-sync-test-dir");

    expect(result.readme).toBeNull();
    expect(result.existingAgentsMd).toBeNull();
    expect(result.existingClaudeMd).toBeNull();
    expect(result.hasExistingAgentsMd).toBe(false);
    expect(result.hasExistingClaudeMd).toBe(false);
    expect(result.totalTokens).toBe(0);
  });

  it("totalTokens sums all loaded docs", async () => {
    const result = await scanDocs(path.join(FIXTURES, "nextjs"));

    const readmeTokens = Math.ceil((result.readme?.length ?? 0) / 4);
    expect(result.totalTokens).toBeGreaterThanOrEqual(readmeTokens);
  });
});
