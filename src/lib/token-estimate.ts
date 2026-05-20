/** Rough token estimate: ~4 chars per token for code */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function truncateToTokenBudget(
  text: string,
  maxTokens: number,
): { text: string; truncated: boolean } {
  const estimated = estimateTokens(text);
  if (estimated <= maxTokens) return { text, truncated: false };

  const maxChars = maxTokens * 4;
  return {
    text: text.slice(0, maxChars) + `\n\n[... truncated at ~${maxTokens} tokens]`,
    truncated: true,
  };
}
