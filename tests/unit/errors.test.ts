import { describe, it, expect } from "vitest";
import { AgentsSyncError, toMcpError, isAgentsSyncError } from "../../src/lib/errors.js";

describe("AgentsSyncError", () => {
  it("formats message without hint", () => {
    const e = new AgentsSyncError("API_ERROR", "request failed");
    expect(e.format()).toBe("[API_ERROR] request failed");
  });

  it("formats message with hint", () => {
    const e = new AgentsSyncError("MISSING_API_KEY", "no key", "set ANTHROPIC_API_KEY");
    expect(e.format()).toContain("→ set ANTHROPIC_API_KEY");
  });

  it("isAgentsSyncError detects correctly", () => {
    expect(isAgentsSyncError(new AgentsSyncError("TIMEOUT", "t"))).toBe(true);
    expect(isAgentsSyncError(new Error("regular"))).toBe(false);
    expect(isAgentsSyncError("string")).toBe(false);
  });

  it("toMcpError handles all types", () => {
    expect(toMcpError(new AgentsSyncError("API_ERROR", "msg"))).toContain("API_ERROR");
    expect(toMcpError(new Error("plain"))).toBe("plain");
    expect(toMcpError("str")).toBe("str");
  });
});
