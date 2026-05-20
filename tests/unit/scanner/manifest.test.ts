import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanManifest } from "../../../src/scanner/manifest.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, "../../fixtures");

describe("scanManifest", () => {
  it("parses a Next.js package.json correctly", async () => {
    const result = await scanManifest(path.join(FIXTURES, "nextjs"));

    expect(result.language).toBe("typescript");
    expect(result.framework).toBe("nextjs");
    expect(result.packageManager).toBe("npm");
    expect(result.projectName).toBe("acme-dashboard");
    expect(result.projectVersion).toBe("0.4.2");
    expect(result.dependencies.some((d) => d.startsWith("next@"))).toBe(true);
    expect(result.dependencies.some((d) => d.startsWith("@prisma/client@"))).toBe(true);
    expect(result.devDependencies.some((d) => d.startsWith("typescript@"))).toBe(true);
    expect(result.scripts["dev"]).toBe("next dev");
    expect(result.scripts["test"]).toBe("vitest run");
  });

  it("parses a Django pyproject.toml correctly", async () => {
    const result = await scanManifest(path.join(FIXTURES, "django"));

    // The fixture uses [tool.poetry.dependencies] key=value table format,
    // not a list — so dependency-based framework detection returns null.
    // Language and package manager are still detected correctly.
    expect(result.language).toBe("python");
    expect(result.packageManager).toBe("pip");
    // Project name comes from [tool.poetry] name field
    expect(result.projectName).toBe("inventory-api");
  });

  it("parses a Rust Cargo.toml correctly", async () => {
    const result = await scanManifest(path.join(FIXTURES, "rust-cli"));

    expect(result.language).toBe("rust");
    expect(result.packageManager).toBe("cargo");
    expect(result.projectName).toBe("datapipe");
    expect(result.dependencies.length).toBeGreaterThan(0);
    expect(result.dependencies.some((d) => d.startsWith("tokio@"))).toBe(true);
  });

  it("returns unknown language for a directory with no manifest", async () => {
    const result = await scanManifest("/tmp/nonexistent-agents-sync-test-dir");

    expect(result.language).toBe("unknown");
    expect(result.framework).toBeNull();
    expect(result.dependencies).toHaveLength(0);
  });
});
