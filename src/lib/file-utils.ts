import fs from "node:fs/promises";
import path from "node:path";
import { AgentsSyncError } from "./errors.js";

export async function readFileSafe(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

export async function writeFileAtomic(filePath: string, content: string): Promise<void> {
  const tmp = filePath + ".agents-sync.tmp";
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(tmp, content, "utf-8");
    await fs.rename(tmp, filePath);
  } catch (e) {
    try { await fs.unlink(tmp); } catch { /* ignore */ }
    throw new AgentsSyncError(
      "WRITE_ERROR",
      `Cannot write to ${filePath}: ${(e as Error).message}`,
      "Check file permissions and disk space.",
    );
  }
}

export async function dirExists(p: string): Promise<boolean> {
  try {
    const stat = await fs.stat(p);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

export async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

export function assertAbsolutePath(p: string): void {
  if (!path.isAbsolute(p)) {
    throw new AgentsSyncError(
      "INVALID_PROJECT_PATH",
      `Path must be absolute: ${p}`,
      "Pass the full path, e.g. /Users/you/my-project",
    );
  }
}

export async function assertProjectDir(p: string): Promise<void> {
  assertAbsolutePath(p);
  if (!(await dirExists(p))) {
    throw new AgentsSyncError(
      "INVALID_PROJECT_PATH",
      `Project path not found: ${p}`,
      "Make sure the directory exists and the path is correct.",
    );
  }
}
