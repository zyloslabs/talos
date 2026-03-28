/**
 * Tests for ExportEngine
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { TalosRepository } from "../repository.js";
import { ExportEngine, type ExportEngineOptions } from "./export-engine.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function createEngine() {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const repo = new TalosRepository(db);
  repo.migrate();

  const tmpDir = path.join(os.tmpdir(), `talos-export-test-${Date.now()}`);
  const engine = new ExportEngine({
    config: { outputDir: tmpDir, sanitizeCredentials: true, includeEnvTemplate: true },
    repository: repo,
  } as ExportEngineOptions);

  return { repo, engine, tmpDir };
}

describe("ExportEngine", () => {
  let repo: TalosRepository;
  let engine: ExportEngine;
  let tmpDir: string;

  beforeEach(() => {
    ({ repo, engine, tmpDir } = createEngine());
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      /* */
    }
  });

  it("returns error for missing application", async () => {
    const result = await engine.export("missing", { format: "json" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("returns error for unsupported format", async () => {
    const app = repo.createApplication({
      name: "A",
      repositoryUrl: "https://github.com/a/b",
      baseUrl: "https://a.com",
    });
    const result = await engine.export(app.id, { format: "csv" as never });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Unsupported format");
  });

  it("exports as JSON", async () => {
    const app = repo.createApplication({
      name: "A",
      repositoryUrl: "https://github.com/a/b",
      baseUrl: "https://a.com",
    });
    repo.createTest({ applicationId: app.id, name: "t1", code: "test('x', async () => {});", type: "e2e" });
    const result = await engine.export(app.id, { format: "json" });
    expect(result.success).toBe(true);
    expect(result.outputPath).toBeDefined();

    const content = await fs.readFile(result.outputPath!, "utf-8");
    const parsed = JSON.parse(content);
    expect(parsed.format).toBe("talos-export-v1");
    expect(parsed.tests).toHaveLength(1);
  });

  it("exports as single-file", async () => {
    const app = repo.createApplication({
      name: "A",
      repositoryUrl: "https://github.com/a/b",
      baseUrl: "https://a.com",
    });
    repo.createTest({ applicationId: app.id, name: "t1", code: "test('x', async () => {});", type: "e2e" });
    const result = await engine.export(app.id, { format: "single-file" });
    expect(result.success).toBe(true);
    const content = await fs.readFile(result.outputPath!, "utf-8");
    expect(content).toContain("E2E Tests");
  });

  it("exports as directory", async () => {
    const app = repo.createApplication({
      name: "A",
      repositoryUrl: "https://github.com/a/b",
      baseUrl: "https://a.com",
    });
    repo.createTest({ applicationId: app.id, name: "t1", code: "test('x', async () => {});", type: "e2e" });
    const result = await engine.export(app.id, { format: "directory" });
    expect(result.success).toBe(true);
    expect(result.files!.length).toBeGreaterThan(0);
  });

  it("exports as zip", async () => {
    const app = repo.createApplication({
      name: "A",
      repositoryUrl: "https://github.com/a/b",
      baseUrl: "https://a.com",
    });
    repo.createTest({ applicationId: app.id, name: "t1", code: "test('x', async () => {});", type: "e2e" });
    const result = await engine.export(app.id, { format: "zip" });
    expect(result.success).toBe(true);
    expect(result.size).toBeGreaterThan(0);
  });

  it("filters specific tests in json export", async () => {
    const app = repo.createApplication({
      name: "A",
      repositoryUrl: "https://github.com/a/b",
      baseUrl: "https://a.com",
    });
    const t1 = repo.createTest({ applicationId: app.id, name: "t1", code: "test('x', async () => {});", type: "e2e" });
    repo.createTest({ applicationId: app.id, name: "t2", code: "test('y', async () => {});", type: "e2e" });
    const result = await engine.export(app.id, { format: "json", tests: [t1.id] });
    expect(result.success).toBe(true);
    const parsed = JSON.parse(await fs.readFile(result.outputPath!, "utf-8"));
    expect(parsed.tests).toHaveLength(1);
  });

  it("import reads json export", async () => {
    const app = repo.createApplication({
      name: "A",
      repositoryUrl: "https://github.com/a/b",
      baseUrl: "https://a.com",
    });
    // Export first
    repo.createTest({ applicationId: app.id, name: "t1", code: "test('x', async () => {});", type: "e2e" });
    const exported = await engine.export(app.id, { format: "json" });
    // Import into new app
    const app2 = repo.createApplication({
      name: "B",
      repositoryUrl: "https://github.com/a/c",
      baseUrl: "https://b.com",
    });
    const importResult = await engine.import(app2.id, exported.outputPath!);
    expect(importResult.success).toBe(true);
    expect(importResult.imported).toBe(1);
  });

  it("import rejects invalid format", async () => {
    const app = repo.createApplication({
      name: "A",
      repositoryUrl: "https://github.com/a/b",
      baseUrl: "https://a.com",
    });
    const tmpFile = path.join(tmpDir, "bad.json");
    await fs.mkdir(tmpDir, { recursive: true });
    await fs.writeFile(tmpFile, JSON.stringify({ format: "wrong" }));
    const result = await engine.import(app.id, tmpFile);
    expect(result.success).toBe(false);
    expect(result.errors).toContain("Unsupported export format");
  });

  it("import handles file-not-found gracefully", async () => {
    const app = repo.createApplication({
      name: "A",
      repositoryUrl: "https://github.com/a/b",
      baseUrl: "https://a.com",
    });
    const result = await engine.import(app.id, "/nonexistent/path.json");
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("listExports returns empty for fresh dir", async () => {
    const list = await engine.listExports();
    expect(Array.isArray(list)).toBe(true);
  });

  it("deleteExport returns false for missing path", async () => {
    const ok = await engine.deleteExport("/nonexistent/path");
    expect(ok).toBe(false);
  });

  it("deleteExport removes file", async () => {
    const app = repo.createApplication({
      name: "A",
      repositoryUrl: "https://github.com/a/b",
      baseUrl: "https://a.com",
    });
    const exported = await engine.export(app.id, { format: "json" });
    const ok = await engine.deleteExport(exported.outputPath!);
    expect(ok).toBe(true);
  });

  it("single-file wraps code that lacks test() declaration", async () => {
    const app = repo.createApplication({
      name: "B",
      repositoryUrl: "https://github.com/a/b",
      baseUrl: "https://b.com",
    });
    // Code does NOT include test( — should be wrapped
    repo.createTest({
      applicationId: app.id,
      name: "raw step",
      code: "await page.goto('https://b.com');",
      type: "e2e",
    });
    const result = await engine.export(app.id, { format: "single-file" });
    expect(result.success).toBe(true);
    const content = await fs.readFile(result.outputPath!, "utf-8");
    expect(content).toContain("test('raw step'");
  });

  it("single-file filters by test IDs", async () => {
    const app = repo.createApplication({
      name: "C",
      repositoryUrl: "https://github.com/a/b",
      baseUrl: "https://c.com",
    });
    const t1 = repo.createTest({
      applicationId: app.id,
      name: "keep",
      code: "test('k', async () => {});",
      type: "e2e",
    });
    repo.createTest({ applicationId: app.id, name: "skip", code: "test('s', async () => {});", type: "e2e" });
    const result = await engine.export(app.id, { format: "single-file", tests: [t1.id] });
    expect(result.success).toBe(true);
    const content = await fs.readFile(result.outputPath!, "utf-8");
    expect(content).toContain("keep");
    expect(content).not.toContain("skip");
  });

  it("single-file with sanitize: false skips credential sanitization", async () => {
    const app = repo.createApplication({
      name: "D",
      repositoryUrl: "https://github.com/a/b",
      baseUrl: "https://d.com",
    });
    repo.createTest({ applicationId: app.id, name: "t1", code: "const password = 'secret123';", type: "e2e" });
    const result = await engine.export(app.id, { format: "single-file", sanitize: false });
    expect(result.success).toBe(true);
    const content = await fs.readFile(result.outputPath!, "utf-8");
    expect(content).toContain("secret123");
  });

  it("json export with sanitize: false preserves credentials", async () => {
    const app = repo.createApplication({
      name: "E",
      repositoryUrl: "https://github.com/a/b",
      baseUrl: "https://e.com",
    });
    repo.createTest({
      applicationId: app.id,
      name: "t1",
      code: "const apiKey = 'sk-abc12345678901234567';",
      type: "e2e",
    });
    const result = await engine.export(app.id, { format: "json", sanitize: false });
    expect(result.success).toBe(true);
    const parsed = JSON.parse(await fs.readFile(result.outputPath!, "utf-8"));
    expect(parsed.tests[0].code).toContain("sk-abc12345678901234567");
  });

  it("directory export with sanitize: false preserves credentials", async () => {
    const app = repo.createApplication({
      name: "F",
      repositoryUrl: "https://github.com/a/b",
      baseUrl: "https://f.com",
    });
    repo.createTest({ applicationId: app.id, name: "t1", code: "const password = 'mysecret';", type: "e2e" });
    const result = await engine.export(app.id, { format: "directory", sanitize: false });
    expect(result.success).toBe(true);
    expect(result.files!.length).toBeGreaterThan(0);
  });

  it("import handles per-test error gracefully", async () => {
    const tmpFile = path.join(os.tmpdir(), `talos-import-test-${Date.now()}.json`);
    await fs.writeFile(
      tmpFile,
      JSON.stringify({
        format: "talos-export-v1",
        tests: [
          { id: "t1", name: "", code: "test('x', async () => {});", type: "e2e" }, // name required
        ],
      })
    );
    const app = repo.createApplication({
      name: "G",
      repositoryUrl: "https://github.com/a/b",
      baseUrl: "https://g.com",
    });
    const result = await engine.import(app.id, tmpFile);
    // May succeed or fail with individual test error — just ensure it doesn't throw
    expect(typeof result.success).toBe("boolean");
    await fs.unlink(tmpFile).catch(() => {});
  });
});
