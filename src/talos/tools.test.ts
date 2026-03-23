/**
 * Tests for createTalosTools
 * Covers: all tool handler paths
 */

import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { TalosRepository } from "./repository.js";
import { createTalosTools, type ToolDefinition } from "./tools.js";

import { getDefaultTalosConfig } from "./config.js";

function makeTools() {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const repo = new TalosRepository(db);
  repo.migrate();
  const config = getDefaultTalosConfig();
  const tools = createTalosTools({ repository: repo, config });
  return { repo, tools, config };
}

function findTool(tools: ToolDefinition[], name: string) {
  const t = tools.find((t) => t.name === name);
  if (!t) throw new Error(`Tool ${name} not found`);
  return t;
}

describe("createTalosTools", () => {
  let repo: TalosRepository;
  let tools: ToolDefinition[];

  beforeEach(() => {
    const env = makeTools();
    repo = env.repo;
    tools = env.tools;
  });

  it("returns an array of tool definitions", () => {
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) {
      expect(tool.name).toBeTruthy();
      expect(tool.handler).toBeInstanceOf(Function);
      expect(tool.category).toBe("testing");
    }
  });

  // ── talos-list-applications ──

  it("list-applications returns empty array", async () => {
    const t = findTool(tools, "talos-list-applications");
    const result = await t.handler({});
    expect(JSON.parse(result.text)).toEqual([]);
  });

  it("list-applications returns apps", async () => {
    repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://example.com" });
    const t = findTool(tools, "talos-list-applications");
    const result = await t.handler({});
    const apps = JSON.parse(result.text);
    expect(apps).toHaveLength(1);
    expect(apps[0].name).toBe("A");
  });

  it("list-applications filters by status", async () => {
    repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://example.com" });
    const t = findTool(tools, "talos-list-applications");
    const result = await t.handler({ status: "archived" });
    expect(JSON.parse(result.text)).toEqual([]);
  });

  // ── talos-get-application ──

  it("get-application returns app", async () => {
    const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://example.com" });
    const t = findTool(tools, "talos-get-application");
    const result = await t.handler({ id: app.id });
    expect(JSON.parse(result.text).name).toBe("A");
  });

  it("get-application returns error for missing", async () => {
    const t = findTool(tools, "talos-get-application");
    const result = await t.handler({ id: "00000000-0000-0000-0000-000000000000" });
    expect(result.isError).toBe(true);
  });

  // ── talos-create-application ──

  it("create-application creates successfully", async () => {
    const t = findTool(tools, "talos-create-application");
    const result = await t.handler({
      name: "NewApp",
      repositoryUrl: "https://github.com/a/b",
      baseUrl: "https://example.com",
    });
    expect(result.text).toContain("NewApp");
    expect(result.text).toContain("ID:");
  });

  // ── talos-list-tests ──

  it("list-tests returns tests for app", async () => {
    const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://example.com" });
    repo.createTest({ applicationId: app.id, name: "T1", code: "test()", type: "e2e" });
    const t = findTool(tools, "talos-list-tests");
    const result = await t.handler({ applicationId: app.id });
    const tests = JSON.parse(result.text);
    expect(tests).toHaveLength(1);
    expect(tests[0].name).toBe("T1");
  });

  // ── talos-run-test ──

  it("run-test creates test run", async () => {
    const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://example.com" });
    const test = repo.createTest({ applicationId: app.id, name: "T1", code: "test()", type: "e2e" });
    const t = findTool(tools, "talos-run-test");
    const result = await t.handler({ testId: test.id });
    expect(result.text).toContain("Created test run");
  });

  it("run-test returns error for missing test", async () => {
    const t = findTool(tools, "talos-run-test");
    const result = await t.handler({ testId: "00000000-0000-0000-0000-000000000000" });
    expect(result.isError).toBe(true);
  });

  // ── talos-generate-test ──

  it("generate-test queues generation", async () => {
    const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://example.com" });
    const t = findTool(tools, "talos-generate-test");
    const result = await t.handler({ applicationId: app.id, prompt: "test login flow" });
    expect(result.text).toContain("generation queued");
  });

  it("generate-test returns error for missing app", async () => {
    const t = findTool(tools, "talos-generate-test");
    const result = await t.handler({ applicationId: "00000000-0000-0000-0000-000000000000", prompt: "test stuff" });
    expect(result.isError).toBe(true);
  });

  // ── talos-discover-repository ──

  it("discover-repository queues discovery", async () => {
    const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://example.com" });
    const t = findTool(tools, "talos-discover-repository");
    const result = await t.handler({ applicationId: app.id });
    expect(result.text).toContain("Discovery job queued");
  });

  it("discover-repository returns error for missing app", async () => {
    const t = findTool(tools, "talos-discover-repository");
    const result = await t.handler({ applicationId: "00000000-0000-0000-0000-000000000000" });
    expect(result.isError).toBe(true);
  });

  // ── talos-get-test-run ──

  it("get-test-run returns run with artifacts", async () => {
    const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://example.com" });
    const test = repo.createTest({ applicationId: app.id, name: "T1", code: "test()", type: "e2e" });
    const run = repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });
    const t = findTool(tools, "talos-get-test-run");
    const result = await t.handler({ runId: run.id });
    const data = JSON.parse(result.text);
    expect(data.id).toBe(run.id);
    expect(data.artifacts).toEqual([]);
  });

  it("get-test-run returns error for missing", async () => {
    const t = findTool(tools, "talos-get-test-run");
    const result = await t.handler({ runId: "00000000-0000-0000-0000-000000000000" });
    expect(result.isError).toBe(true);
  });

  // ── talos-list-test-runs ──

  it("list-test-runs by app", async () => {
    const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://example.com" });
    const test = repo.createTest({ applicationId: app.id, name: "T1", code: "test()", type: "e2e" });
    repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });
    const t = findTool(tools, "talos-list-test-runs");
    const result = await t.handler({ applicationId: app.id });
    expect(JSON.parse(result.text)).toHaveLength(1);
  });

  it("list-test-runs by test", async () => {
    const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://example.com" });
    const test = repo.createTest({ applicationId: app.id, name: "T1", code: "test()", type: "e2e" });
    repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });
    const t = findTool(tools, "talos-list-test-runs");
    const result = await t.handler({ testId: test.id });
    expect(JSON.parse(result.text)).toHaveLength(1);
  });

  it("list-test-runs requires filter", async () => {
    const t = findTool(tools, "talos-list-test-runs");
    const result = await t.handler({});
    expect(result.isError).toBe(true);
  });

  // ── talos-heal-test ──

  it("heal-test queues healing for failed run", async () => {
    const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://example.com" });
    const test = repo.createTest({ applicationId: app.id, name: "T1", code: "test()", type: "e2e" });
    const run = repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });
    // Update run to failed
    repo.updateTestRun(run.id, { status: "failed", errorMessage: "timeout" });
    const t = findTool(tools, "talos-heal-test");
    const result = await t.handler({ testRunId: run.id });
    expect(result.text).toContain("Healing analysis queued");
  });

  it("heal-test rejects non-failed run", async () => {
    const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://example.com" });
    const test = repo.createTest({ applicationId: app.id, name: "T1", code: "test()", type: "e2e" });
    const run = repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });
    const t = findTool(tools, "talos-heal-test");
    const result = await t.handler({ testRunId: run.id });
    expect(result.isError).toBe(true);
  });

  it("heal-test returns error for missing run", async () => {
    const t = findTool(tools, "talos-heal-test");
    const result = await t.handler({ testRunId: "00000000-0000-0000-0000-000000000000" });
    expect(result.isError).toBe(true);
  });

  // ── talos-export-tests ──

  it("export-tests queues export", async () => {
    const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://example.com" });
    const t = findTool(tools, "talos-export-tests");
    const result = await t.handler({ applicationId: app.id });
    expect(result.text).toContain("Export queued");
  });

  it("export-tests returns error for missing app", async () => {
    const t = findTool(tools, "talos-export-tests");
    const result = await t.handler({ applicationId: "00000000-0000-0000-0000-000000000000" });
    expect(result.isError).toBe(true);
  });
});
