import { z } from "zod";

export const ProjectMetadataSchema = z.object({
  project: z.object({
    name: z.string().describe("Project name from manifest"),
    description: z.string().describe("What this project does, 1-2 sentences"),
    language: z.string().describe("Primary language: typescript, javascript, python, rust, go, etc"),
    framework: z.string().optional().describe("Primary framework: nextjs, django, express, axum, etc"),
    version: z.string().optional().describe("Project version from manifest"),
  }),
  stack: z.object({
    runtime: z.string().optional().describe("Runtime and version: node 20, python 3.11, etc"),
    database: z.string().optional().describe("Database + ORM: postgres via prisma, sqlite via drizzle, etc"),
    auth: z.string().optional().describe("Auth solution: next-auth, jwt, supabase auth, etc"),
    testing: z.string().optional().describe("Test framework and runner: vitest, pytest, cargo test, etc"),
    deploy: z.string().optional().describe("Deployment target: vercel, railway, fly.io, docker, etc"),
    other: z.array(z.string()).describe("Other notable stack items: redis, stripe, openai, etc"),
  }),
  architecture: z.object({
    style: z.string().optional().describe("feature-first, layered, monorepo, flat, etc"),
    keyDirs: z.record(z.string()).describe("Map of important dirs to their purpose: { 'src/features': 'domain modules' }"),
    entryPoints: z.array(z.string()).describe("Main entry point files relative to project root"),
  }),
  conventions: z.array(z.string()).describe(
    "Specific coding conventions Claude must follow. Be concrete: 'kebab-case filenames', 'named exports only', 'zod for all external input'. No generic advice.",
  ),
  gotchas: z.array(z.string()).describe(
    "Things that will break if ignored. Include consequence: 'Do not import PrismaClient directly — causes connection pool exhaustion. Use lib/db.ts singleton instead.'",
  ),
  boundaries: z.object({
    alwaysDo: z.array(z.string()).describe("Things AI must always do"),
    askFirst: z.array(z.string()).describe("Things requiring human approval before doing"),
    never: z.array(z.string()).describe("Hard constraints — never violate these"),
  }),
  testing: z.object({
    framework: z.string().optional().describe("Test framework name"),
    command: z.string().optional().describe("Exact command to run tests: npm test, pytest, cargo test"),
    location: z.string().optional().describe("Where tests live: colocated, tests/, __tests__/"),
    coverageCommand: z.string().optional().describe("Command to run with coverage"),
  }),
  deployment: z.object({
    target: z.string().optional().describe("Where it deploys: vercel, fly.io, etc"),
    command: z.string().optional().describe("Deploy command if any"),
    envFile: z.string().optional().describe(".env file name if non-standard"),
    notes: z.array(z.string()).describe("Important deployment notes"),
  }),
});

export type ProjectMetadata = z.infer<typeof ProjectMetadataSchema>;

export const METADATA_VERSION = "1.0";
