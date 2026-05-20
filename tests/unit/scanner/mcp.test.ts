import { describe, it, expect } from "vitest";
import { scanMcpServers, formatMcpSection } from "../../../src/scanner/mcp.js";
import { createTempProject } from "../helpers/temp.js";

describe("scanMcpServers", () => {
  it("returns empty when no .claude/settings.json exists", async () => {
    const dir = await createTempProject({});
    const result = await scanMcpServers(dir);
    expect(result.hasAny).toBe(false);
    expect(result.servers).toHaveLength(0);
  });

  it("parses mcpServers from .claude/settings.json", async () => {
    const dir = await createTempProject({
      ".claude/settings.json": JSON.stringify({
        mcpServers: {
          postgres: { command: "npx", args: ["@modelcontextprotocol/server-postgres", "postgresql://localhost/db"] },
          github: { command: "npx", args: ["@modelcontextprotocol/server-github"] },
        },
      }),
    });
    const result = await scanMcpServers(dir);
    expect(result.hasAny).toBe(true);
    expect(result.servers).toHaveLength(2);
    expect(result.servers.map((s) => s.name)).toContain("postgres");
    expect(result.servers.map((s) => s.name)).toContain("github");
  });

  it("infers descriptions from server names", async () => {
    const dir = await createTempProject({
      ".claude/settings.json": JSON.stringify({
        mcpServers: {
          postgres: { command: "npx", args: [] },
          github: { command: "npx", args: [] },
          slack: { command: "npx", args: [] },
        },
      }),
    });
    const result = await scanMcpServers(dir);
    const pg = result.servers.find((s) => s.name === "postgres");
    const gh = result.servers.find((s) => s.name === "github");
    expect(pg?.description).toMatch(/postgres/i);
    expect(gh?.description).toMatch(/github/i);
  });

  it("uses provided description over inferred", async () => {
    const dir = await createTempProject({
      ".claude/settings.json": JSON.stringify({
        mcpServers: {
          mydb: { command: "npx", args: [], description: "Internal analytics database" },
        },
      }),
    });
    const result = await scanMcpServers(dir);
    expect(result.servers[0].description).toBe("Internal analytics database");
  });

  it("merges settings.json and settings.local.json, first file wins", async () => {
    const dir = await createTempProject({
      ".claude/settings.json": JSON.stringify({
        mcpServers: { postgres: { command: "npx", args: [], description: "from settings" } },
      }),
      ".claude/settings.local.json": JSON.stringify({
        mcpServers: {
          postgres: { command: "npx", args: [], description: "from local" },
          redis: { command: "npx", args: [] },
        },
      }),
    });
    const result = await scanMcpServers(dir);
    const pg = result.servers.find((s) => s.name === "postgres");
    expect(pg?.description).toBe("from settings"); // settings.json wins
    expect(result.servers.some((s) => s.name === "redis")).toBe(true); // local adds new
  });

  it("ignores malformed JSON gracefully", async () => {
    const dir = await createTempProject({
      ".claude/settings.json": "{ not valid json",
    });
    const result = await scanMcpServers(dir);
    expect(result.hasAny).toBe(false);
  });
});

describe("formatMcpSection", () => {
  it("returns empty string when no servers", () => {
    expect(formatMcpSection({ servers: [], hasAny: false })).toBe("");
  });

  it("formats servers as a markdown list", () => {
    const result = formatMcpSection({
      hasAny: true,
      servers: [
        { name: "postgres", command: "npx @mcp/postgres", description: "PostgreSQL access" },
        { name: "github", command: "npx @mcp/github", description: "GitHub API" },
      ],
    });
    expect(result).toContain("## MCP Servers");
    expect(result).toContain("**postgres**");
    expect(result).toContain("PostgreSQL access");
    expect(result).toContain("**github**");
  });
});
