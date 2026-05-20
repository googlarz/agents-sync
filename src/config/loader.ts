import path from "node:path";
import fs from "node:fs/promises";
import { ZodError } from "zod";
import { AgentsSyncConfigSchema, type AgentsSyncConfig } from "./schema.js";
import type { ProjectMetadata } from "../extractor/schema.js";

const CONFIG_FILE = "agents-sync.config.json";

export async function loadConfig(projectPath: string): Promise<AgentsSyncConfig | null> {
  const configPath = path.join(projectPath, CONFIG_FILE);
  let raw: string;
  try {
    raw = await fs.readFile(configPath, "utf-8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`${CONFIG_FILE} is not valid JSON: ${(e as SyntaxError).message}`);
  }

  try {
    return AgentsSyncConfigSchema.parse(parsed);
  } catch (e) {
    if (e instanceof ZodError) {
      const issues = e.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
      throw new Error(`${CONFIG_FILE} has validation errors:\n${issues}`);
    }
    throw e;
  }
}

/**
 * Merge config-defined conventions and boundaries into extracted metadata.
 * Config items are appended after Claude-extracted ones so they survive re-sync.
 */
export function applyConfig(metadata: ProjectMetadata, config: AgentsSyncConfig | null): ProjectMetadata {
  if (!config) return metadata;

  return {
    ...metadata,
    conventions: [
      ...metadata.conventions,
      ...(config.conventions?.inject ?? []),
    ],
    boundaries: {
      alwaysDo: [...metadata.boundaries.alwaysDo, ...(config.boundaries?.alwaysDo ?? [])],
      askFirst: [...metadata.boundaries.askFirst, ...(config.boundaries?.askFirst ?? [])],
      never: [...metadata.boundaries.never, ...(config.boundaries?.never ?? [])],
    },
  };
}
