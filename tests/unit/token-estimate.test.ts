import { describe, it, expect } from "vitest";
import { estimateTokens, truncateToTokenBudget } from "../../src/lib/token-estimate.js";

describe("estimateTokens", () => {
  it("estimates short string", () => {
    expect(estimateTokens("hello")).toBe(2); // ceil(5/4)
  });

  it("estimates empty string as 0", () => {
    expect(estimateTokens("")).toBe(0);
  });
});

describe("truncateToTokenBudget", () => {
  it("does not truncate when within budget", () => {
    const { text, truncated } = truncateToTokenBudget("short", 100);
    expect(text).toBe("short");
    expect(truncated).toBe(false);
  });

  it("truncates when over budget", () => {
    const long = "a".repeat(1000);
    const { text, truncated } = truncateToTokenBudget(long, 10);
    expect(truncated).toBe(true);
    expect(text).toContain("truncated");
    expect(text.length).toBeLessThan(long.length);
  });
});
