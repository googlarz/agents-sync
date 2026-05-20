import path from "node:path";
import { readFileSafe } from "../lib/file-utils.js";

export interface ManifestData {
  language: string;
  framework: string | null;
  runtime: string | null;
  packageManager: string | null;
  dependencies: string[];
  devDependencies: string[];
  scripts: Record<string, string>;
  projectName: string | null;
  projectVersion: string | null;
}

const EMPTY: ManifestData = {
  language: "unknown",
  framework: null,
  runtime: null,
  packageManager: null,
  dependencies: [],
  devDependencies: [],
  scripts: {},
  projectName: null,
  projectVersion: null,
};

function detectFrameworkFromDeps(deps: Record<string, string>): string | null {
  if ("next" in deps) return "nextjs";
  if ("express" in deps) return "express";
  if ("fastify" in deps) return "fastify";
  if ("koa" in deps) return "koa";
  if ("hono" in deps) return "hono";
  if ("@nestjs/core" in deps) return "nestjs";
  if ("nuxt" in deps) return "nuxt";
  if ("@sveltejs/kit" in deps) return "sveltekit";
  if ("remix" in deps || "@remix-run/node" in deps) return "remix";
  if ("astro" in deps) return "astro";
  return null;
}

function detectPackageManager(raw: string | null): string | null {
  if (raw) {
    try {
      const pkg = JSON.parse(raw);
      if (pkg.packageManager) {
        const pm = String(pkg.packageManager);
        if (pm.startsWith("pnpm")) return "pnpm";
        if (pm.startsWith("yarn")) return "yarn";
        if (pm.startsWith("npm")) return "npm";
        if (pm.startsWith("bun")) return "bun";
      }
    } catch {
      // ignore
    }
  }
  return null;
}

function depsToStrings(deps: Record<string, string>, limit: number): string[] {
  return Object.entries(deps)
    .slice(0, limit)
    .map(([name, version]) => `${name}@${version}`);
}

async function fromPackageJson(projectPath: string): Promise<ManifestData | null> {
  const raw = await readFileSafe(path.join(projectPath, "package.json"));
  if (!raw) return null;

  try {
    const pkg = JSON.parse(raw) as Record<string, unknown>;
    const deps = (pkg.dependencies ?? {}) as Record<string, string>;
    const devDeps = (pkg.devDependencies ?? {}) as Record<string, string>;
    const scripts = (pkg.scripts ?? {}) as Record<string, string>;

    const isTypeScript = "typescript" in devDeps || "typescript" in deps;
    const language = isTypeScript ? "typescript" : "javascript";

    const allDeps = { ...deps };
    const framework = detectFrameworkFromDeps(allDeps);

    // Detect Node version from engines field
    let runtime: string | null = null;
    const engines = pkg.engines as Record<string, string> | undefined;
    if (engines?.node) {
      runtime = `node ${engines.node}`;
    }

    // Package manager: packageManager field or detect from devDeps
    let packageManager = detectPackageManager(raw);
    if (!packageManager) {
      // Check common indicators in devDeps
      if ("pnpm" in devDeps) packageManager = "pnpm";
      else if ("yarn" in devDeps) packageManager = "yarn";
      else packageManager = "npm";
    }

    return {
      language,
      framework,
      runtime,
      packageManager,
      dependencies: depsToStrings(deps, 25),
      devDependencies: depsToStrings(devDeps, 15),
      scripts,
      projectName: typeof pkg.name === "string" ? pkg.name : null,
      projectVersion: typeof pkg.version === "string" ? pkg.version : null,
    };
  } catch {
    return { ...EMPTY, language: "javascript" };
  }
}

function parsePyprojectLine(
  lines: string[],
  key: string,
): string | null {
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith(`${key} =`) || trimmed.startsWith(`${key}=`)) {
      const idx = trimmed.indexOf("=");
      return trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    }
  }
  return null;
}

function parsePyprojectDeps(lines: string[]): string[] {
  const deps: string[] = [];
  let inDeps = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "dependencies = [" || trimmed === "dependencies=[") {
      inDeps = true;
      continue;
    }
    if (inDeps) {
      if (trimmed === "]") break;
      const dep = trimmed.replace(/^["']|["',]*$/g, "").trim();
      if (dep) deps.push(dep);
    }
  }
  return deps;
}

async function fromPyproject(projectPath: string): Promise<ManifestData | null> {
  const raw = await readFileSafe(path.join(projectPath, "pyproject.toml"));
  if (!raw) return null;

  try {
    const lines = raw.split("\n");
    const name = parsePyprojectLine(lines, "name");
    const version = parsePyprojectLine(lines, "version");
    const requiresPython = parsePyprojectLine(lines, "requires-python");
    const runtime = requiresPython ? `python ${requiresPython.replace(/[^0-9.]/g, "").slice(0, 6)}` : null;

    const deps = parsePyprojectDeps(lines);
    const depsLower = deps.map((d) => d.toLowerCase());

    let framework: string | null = null;
    if (depsLower.some((d) => d.startsWith("fastapi"))) framework = "fastapi";
    else if (depsLower.some((d) => d.startsWith("django"))) framework = "django";
    else if (depsLower.some((d) => d.startsWith("flask"))) framework = "flask";

    return {
      language: "python",
      framework,
      runtime,
      packageManager: "pip",
      dependencies: deps.slice(0, 25),
      devDependencies: [],
      scripts: {},
      projectName: name,
      projectVersion: version,
    };
  } catch {
    return { ...EMPTY, language: "python" };
  }
}

async function fromCargoToml(projectPath: string): Promise<ManifestData | null> {
  const raw = await readFileSafe(path.join(projectPath, "Cargo.toml"));
  if (!raw) return null;

  try {
    const lines = raw.split("\n");
    const name = parsePyprojectLine(lines, "name");
    const version = parsePyprojectLine(lines, "version");

    const deps: string[] = [];
    let inDeps = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === "[dependencies]") { inDeps = true; continue; }
      if (inDeps) {
        if (trimmed.startsWith("[")) break;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx > 0) {
          const depName = trimmed.slice(0, eqIdx).trim();
          const depVal = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
          if (depName) deps.push(`${depName}@${depVal}`);
        }
      }
    }

    const rawContent = raw.toLowerCase();
    let framework: string | null = null;
    if (rawContent.includes("axum")) framework = "axum";
    else if (rawContent.includes("actix-web")) framework = "actix";

    return {
      language: "rust",
      framework,
      runtime: null,
      packageManager: "cargo",
      dependencies: deps.slice(0, 25),
      devDependencies: [],
      scripts: {},
      projectName: name,
      projectVersion: version,
    };
  } catch {
    return { ...EMPTY, language: "rust" };
  }
}

async function fromGoMod(projectPath: string): Promise<ManifestData | null> {
  const raw = await readFileSafe(path.join(projectPath, "go.mod"));
  if (!raw) return null;

  try {
    const lines = raw.split("\n");
    let moduleName: string | null = null;
    let goVersion: string | null = null;
    const deps: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("module ")) {
        moduleName = trimmed.slice(7).trim();
      } else if (trimmed.startsWith("go ")) {
        goVersion = `go ${trimmed.slice(3).trim()}`;
      } else if (trimmed && !trimmed.startsWith("//") && trimmed.includes(" ")) {
        // require block entries
        const parts = trimmed.split(/\s+/);
        if (parts.length >= 2 && !parts[0].startsWith("(") && !parts[0].startsWith(")")) {
          deps.push(`${parts[0]}@${parts[1]}`);
        }
      }
    }

    const rawContent = raw.toLowerCase();
    let framework: string | null = null;
    if (rawContent.includes("github.com/gin-gonic/gin")) framework = "gin";
    else if (rawContent.includes("github.com/labstack/echo")) framework = "echo";

    return {
      language: "go",
      framework,
      runtime: goVersion,
      packageManager: null,
      dependencies: deps.slice(0, 25),
      devDependencies: [],
      scripts: {},
      projectName: moduleName,
      projectVersion: null,
    };
  } catch {
    return { ...EMPTY, language: "go" };
  }
}

export async function scanManifest(projectPath: string): Promise<ManifestData> {
  try {
    const result =
      (await fromPackageJson(projectPath)) ??
      (await fromPyproject(projectPath)) ??
      (await fromCargoToml(projectPath)) ??
      (await fromGoMod(projectPath));

    if (result) return result;
    return { ...EMPTY };
  } catch {
    return { ...EMPTY };
  }
}
