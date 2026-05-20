import { PrismaClient } from "@prisma/client";

// IMPORTANT: Use this singleton. Do NOT import PrismaClient directly elsewhere
// — causes connection pool exhaustion in serverless environments.
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
export const db = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
