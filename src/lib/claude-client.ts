import Anthropic from "@anthropic-ai/sdk";
import { AgentsSyncError } from "./errors.js";

const MODEL = "claude-sonnet-4-6";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new AgentsSyncError(
        "MISSING_API_KEY",
        "ANTHROPIC_API_KEY environment variable is not set.",
        "Export it: export ANTHROPIC_API_KEY=sk-ant-...",
      );
    }
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

function debug(msg: string): void {
  if (process.env.AGENTS_SYNC_DEBUG === "1") {
    process.stderr.write(`[agents-sync:debug] ${msg}\n`);
  }
}

export interface ClaudeResponse {
  content: string;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };
}

export async function callClaude(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 4096,
): Promise<ClaudeResponse> {
  const client = getClient();
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      debug(`Claude call attempt ${attempt}, maxTokens=${maxTokens}`);

      const response = await client.messages.create({
        model: MODEL,
        max_tokens: maxTokens,
        system: [
          {
            type: "text",
            text: systemPrompt,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: userPrompt }],
      });

      const content = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");

      const usage = {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
      };

      debug(
        `Response: ${usage.outputTokens} out, ${usage.cacheReadTokens} cache_read, ${usage.cacheWriteTokens} cache_write`,
      );

      return { content, usage };
    } catch (e) {
      const err = e as { status?: number; message?: string };
      if (err.status === 429 && attempt < MAX_RETRIES) {
        debug(`Rate limited, retrying in ${RETRY_DELAY_MS * attempt}ms...`);
        await sleep(RETRY_DELAY_MS * attempt);
        continue;
      }
      if (err.status === 529 && attempt < MAX_RETRIES) {
        debug(`Overloaded, retrying in ${RETRY_DELAY_MS}ms...`);
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      throw new AgentsSyncError(
        err.status === 429 ? "RATE_LIMIT" : "API_ERROR",
        `Claude API error: ${err.message ?? String(e)}`,
        err.status === 429
          ? "Rate limited. Try again in ~60 seconds. Use --fast flag to skip re-extraction."
          : "Run with AGENTS_SYNC_DEBUG=1 to see full error.",
      );
    }
  }

  throw new AgentsSyncError(
    "RATE_LIMIT",
    "Rate limited after 3 retries.",
    "Wait ~60 seconds and try again.",
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
