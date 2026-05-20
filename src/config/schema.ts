import { z } from "zod";

export const ToolNameSchema = z.enum(["claude", "cursor", "copilot", "gemini", "windsurf", "cline"]);

export const AgentsSyncConfigSchema = z
  .object({
    /** Which tool files to generate. Overridden by --tools flag. */
    tools: z.array(ToolNameSchema).optional(),

    /** Team conventions injected into every generated file. */
    conventions: z
      .object({
        inject: z
          .array(z.string())
          .optional()
          .describe("Conventions appended to Claude-extracted ones"),
      })
      .optional(),

    /** Team boundaries injected into every generated file. */
    boundaries: z
      .object({
        alwaysDo: z.array(z.string()).optional(),
        askFirst: z.array(z.string()).optional(),
        never: z.array(z.string()).optional(),
      })
      .optional(),

    /** Tune the codebase scanner. */
    extraction: z
      .object({
        maxSourceFiles: z.number().int().positive().optional(),
        maxTokensPerFile: z.number().int().positive().optional(),
      })
      .optional(),
  })
  .strict();

export type AgentsSyncConfig = z.infer<typeof AgentsSyncConfigSchema>;
