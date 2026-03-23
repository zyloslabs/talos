/**
 * Tests for PackageBuilder
 */
import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { TalosRepository } from "../repository.js";
import { PackageBuilder, type PackageBuilderOptions } from "./package-builder.js";

function setup() {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const repo = new TalosRepository(db);
  repo.migrate();
  const builder = new PackageBuilder({ config: { outputDir: "/tmp", sanitizeCredentials: true, includeEnvTemplate: true }, repository: repo } as PackageBuilderOptions);
  return { repo, builder };
}

describe("PackageBuilder", () => {
  let repo: TalosRepository;
  let builder: PackageBuilder;

  beforeEach(() => {
    ({ repo, builder } = setup());
  });

  it("throws for unknown application", () => {
    expect(() => builder.build("missing")).toThrow("Application not found");
  });

  it("builds default package with config files", () => {
    const app = repo.createApplication({ name: "Demo App", repositoryUrl: "https://github.com/a/b", baseUrl: "https://demo.com" });
    const pkg = builder.build(app.id);

    expect(pkg.testCount).toBe(0);
    const paths = pkg.files.map((f) => f.path);
    expect(paths).toContain("playwright.config.ts");
    expect(paths).toContain("package.json");
    expect(paths).toContain("tsconfig.json");
    expect(paths).toContain(".gitignore");
    expect(paths).toContain("README.md");

    // Verify base URL substitution in playwright config
    const pwConfig = pkg.files.find((f) => f.path === "playwright.config.ts")!;
    expect(pwConfig.content).toContain("https://demo.com");

    // package.json has app name
    const pkgJson = pkg.files.find((f) => f.path === "package.json")!;
    expect(pkgJson.content).toContain("demo-app-tests");
  });

  it("includes test files in tests/ directory", () => {
    const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://a.com" });
    repo.createTest({
      applicationId: app.id,
      name: "Login Test",
      code: `import { test, expect } from '@playwright/test';\ntest('login', async ({page}) => { await page.goto('/login'); });`,
      type: "e2e",
    });
    const pkg = builder.build(app.id);

    expect(pkg.testCount).toBe(1);
    const testFile = pkg.files.find((f) => f.path.startsWith("tests/"));
    expect(testFile).toBeDefined();
    expect(testFile!.type).toBe("test");
    expect(testFile!.content).toContain("@playwright/test");
  });

  it("wraps bare code in test structure", () => {
    const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://a.com" });
    repo.createTest({ applicationId: app.id, name: "t1", code: `await page.goto('/');`, type: "e2e" });
    const pkg = builder.build(app.id);
    const testFile = pkg.files.find((f) => f.path.startsWith("tests/"))!;
    expect(testFile.content).toContain("test(");
    expect(testFile.content).toContain("import { test, expect }");
  });

  it("generates fixture file when requested", () => {
    const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://a.com" });
    const pkg = builder.build(app.id, { includeFixtures: true });
    const fixture = pkg.files.find((f) => f.path === "tests/fixtures.ts");
    expect(fixture).toBeDefined();
    expect(fixture!.type).toBe("fixture");
  });

  it("generates page objects when requested", () => {
    const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://a.com" });
    repo.createTest({
      applicationId: app.id,
      name: "t1",
      code: `import { test } from '@playwright/test';\ntest('x', async ({page}) => { await page.goto('/login'); });`,
      type: "e2e",
    });
    const pkg = builder.build(app.id, { includePageObjects: true });
    const pageObjs = pkg.files.filter((f) => f.path.startsWith("tests/pages/"));
    expect(pageObjs.length).toBeGreaterThanOrEqual(1); // base.page.ts at minimum
    expect(pageObjs.some((f) => f.path === "tests/pages/base.page.ts")).toBe(true);
  });

  it("skips env template when no credential replacements", () => {
    const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://a.com" });
    repo.createTest({ applicationId: app.id, name: "t1", code: `test('x', async () => {});`, type: "e2e" });
    const pkg = builder.build(app.id, { sanitizeCredentials: false });
    const envFile = pkg.files.find((f) => f.path === ".env.example");
    expect(envFile).toBeUndefined();
  });

  it("totalSize is sum of file content lengths", () => {
    const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://a.com" });
    const pkg = builder.build(app.id);
    const manualSum = pkg.files.reduce((s, f) => s + f.content.length, 0);
    expect(pkg.totalSize).toBe(manualSum);
  });
});
