import { z } from "zod";

export const ManagedFileSchema = z.object({
  path: z.string(),
  sha256: z.string(),
  tool: z.enum(["agents-md", "claude", "cursor", "copilot", "gemini", "windsurf", "cline", "roo", "aider"]),
});

export const SnapshotSchema = z.object({
  version: z.literal("1.0"),
  syncedAt: z.string().describe("ISO 8601 timestamp"),
  projectPath: z.string(),
  codebaseHash: z.string().describe("SHA-256 of manifest content + structure"),
  manifestHash: z.string().describe("SHA-256 of primary manifest file"),
  filesManaged: z.array(ManagedFileSchema),
  meta: z.object({
    dependencyCount: z.number(),
    topLevelDirs: z.array(z.string()),
    language: z.string(),
    framework: z.string().nullable(),
    totalFiles: z.number(),
  }),
});

export type Snapshot = z.infer<typeof SnapshotSchema>;
export type ManagedFile = z.infer<typeof ManagedFileSchema>;

export const SNAPSHOT_DIR = ".agents-sync";
export const SNAPSHOT_FILE = "snapshot.json";
