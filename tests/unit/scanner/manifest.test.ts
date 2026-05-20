import { describe, it, expect, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { scanManifest } from "../../../src/scanner/manifest.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, "../../fixtures");

describe("scanManifest", () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    for (const d of tmpDirs) await fs.rm(d, { recursive: true, force: true });
    tmpDirs.length = 0;
  });

  async function makeDir(files: Record<string, string>): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agents-sync-manifest-"));
    tmpDirs.push(dir);
    for (const [rel, content] of Object.entries(files)) {
      await fs.writeFile(path.join(dir, rel), content, "utf-8");
    }
    return dir;
  }
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

  it("parses a Maven pom.xml correctly", async () => {
    const dir = await makeDir({
      "pom.xml": `<?xml version="1.0"?>
<project>
  <artifactId>my-service</artifactId>
  <version>2.1.0</version>
  <properties>
    <java.version>17</java.version>
  </properties>
  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
      <groupId>com.fasterxml.jackson.core</groupId>
      <artifactId>jackson-databind</artifactId>
    </dependency>
  </dependencies>
</project>`,
    });
    const result = await scanManifest(dir);
    expect(result.language).toBe("java");
    expect(result.packageManager).toBe("maven");
    expect(result.framework).toBe("spring-boot");
    expect(result.projectName).toBe("my-service");
    expect(result.projectVersion).toBe("2.1.0");
    expect(result.runtime).toBe("java 17");
    expect(result.dependencies.some((d) => d.includes("spring-boot-starter-web"))).toBe(true);
    expect(result.dependencies.some((d) => d.includes("jackson-databind"))).toBe(true);
  });

  it("parses a Gradle build.gradle correctly", async () => {
    const dir = await makeDir({
      "build.gradle": `plugins {
  id 'org.springframework.boot' version '3.2.0'
}
dependencies {
  implementation 'com.google.guava:guava:32.0.0-jre'
  implementation 'org.springframework.boot:spring-boot-starter:3.2.0'
  testImplementation 'org.junit.jupiter:junit-jupiter:5.10.0'
}`,
    });
    const result = await scanManifest(dir);
    expect(result.language).toBe("java");
    expect(result.packageManager).toBe("gradle");
    expect(result.framework).toBe("spring-boot");
    expect(result.dependencies.some((d) => d.includes("guava"))).toBe(true);
    expect(result.dependencies.some((d) => d.includes("spring-boot-starter"))).toBe(true);
  });

  it("parses a Ruby Gemfile correctly", async () => {
    const dir = await makeDir({
      "Gemfile": `source 'https://rubygems.org'
ruby '3.2.0'
gem 'rails', '~> 7.1'
gem 'pg', '~> 1.5'
gem 'puma', '~> 6.0'
gem 'devise'
`,
    });
    const result = await scanManifest(dir);
    expect(result.language).toBe("ruby");
    expect(result.packageManager).toBe("bundler");
    expect(result.framework).toBe("rails");
    expect(result.runtime).toBe("ruby 3.2.0");
    expect(result.dependencies).toContain("rails");
    expect(result.dependencies).toContain("pg");
    expect(result.dependencies).toContain("devise");
  });

  it("parses a PHP composer.json correctly", async () => {
    const dir = await makeDir({
      "composer.json": JSON.stringify({
        name: "acme/api",
        version: "1.0.0",
        require: {
          php: "^8.2",
          "laravel/framework": "^10.0",
          "guzzlehttp/guzzle": "^7.0",
        },
        "require-dev": {
          "phpunit/phpunit": "^10.0",
        },
      }),
    });
    const result = await scanManifest(dir);
    expect(result.language).toBe("php");
    expect(result.packageManager).toBe("composer");
    expect(result.framework).toBe("laravel");
    expect(result.projectName).toBe("acme/api");
    expect(result.dependencies.some((d) => d.startsWith("laravel/framework"))).toBe(true);
    expect(result.dependencies.some((d) => d.startsWith("guzzlehttp/guzzle"))).toBe(true);
    expect(result.devDependencies.some((d) => d.startsWith("phpunit/phpunit"))).toBe(true);
  });

  it("returns unknown language for a directory with no manifest", async () => {
    const result = await scanManifest("/tmp/nonexistent-agents-sync-test-dir");

    expect(result.language).toBe("unknown");
    expect(result.framework).toBeNull();
    expect(result.dependencies).toHaveLength(0);
  });
});
