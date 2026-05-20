export type ErrorCode =
  | "MISSING_API_KEY"
  | "INVALID_PROJECT_PATH"
  | "NO_SNAPSHOT"
  | "RATE_LIMIT"
  | "API_ERROR"
  | "EXTRACTION_FAILED"
  | "GENERATION_FAILED"
  | "WRITE_ERROR"
  | "PARSE_ERROR"
  | "TIMEOUT";

export class AgentsSyncError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly hint?: string,
  ) {
    super(message);
    this.name = "AgentsSyncError";
  }

  format(): string {
    const lines = [`[${this.code}] ${this.message}`];
    if (this.hint) lines.push(`  → ${this.hint}`);
    return lines.join("\n");
  }
}

export function isAgentsSyncError(e: unknown): e is AgentsSyncError {
  return e instanceof AgentsSyncError;
}

export function toMcpError(e: unknown): string {
  if (e instanceof AgentsSyncError) return e.format();
  if (e instanceof Error) return e.message;
  return String(e);
}
