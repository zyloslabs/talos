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
  return { repo, repository: repo, tools, config };
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
      expect(["testing", "knowledge"]).toContain(tool.category);
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

  // ── talos_ingest_document (#297) ──

  describe("talos_ingest_document", () => {
    it("returns error when documentIngester is not configured", async () => {
      const t = findTool(tools, "talos_ingest_document");
      const result = await t.handler({
        applicationId: "app-1",
        content: "# Hello",
        format: "markdown",
        fileName: "readme.md",
        docType: "prd",
      });
      expect(result.isError).toBe(true);
      expect(result.text).toContain("not configured");
    });

    it("calls documentIngester and returns result", async () => {
      const mockIngester = {
        ingestDocument: async () => ({
          chunksCreated: 3,
          chunksSkipped: 1,
          totalTokens: 512,
          docId: "doc:app-1:readme.md:latest",
        }),
      };
      const toolsWithIngester = createTalosTools({
        ...makeTools(),
        documentIngester: mockIngester as unknown as import("./knowledge/document-ingester.js").DocumentIngester,
      });
      const t = findTool(toolsWithIngester, "talos_ingest_document");
      const result = await t.handler({
        applicationId: "app-1",
        content: "# Hello\n\nParagraph content",
        format: "markdown",
        fileName: "readme.md",
        docType: "prd",
        version: "1.0",
        tags: ["onboarding"],
      });
      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.text);
      expect(data.chunksCreated).toBe(3);
      expect(data.chunksSkipped).toBe(1);
      expect(data.totalTokens).toBe(512);
      expect(data.docId).toBe("doc:app-1:readme.md:latest");
    });

    it("validates input schema", async () => {
      const t = findTool(tools, "talos_ingest_document");
      expect(t.zodSchema).toBeDefined();
      expect(t.riskLevel).toBe("medium");
      expect(t.category).toBe("knowledge");
    });
  });

  // ── talos_generate_criteria (#298) ──

  describe("talos_generate_criteria", () => {
    it("returns error when criteriaGenerator is not configured", async () => {
      const t = findTool(tools, "talos_generate_criteria");
      const result = await t.handler({ applicationId: "app-1" });
      expect(result.isError).toBe(true);
      expect(result.text).toContain("not configured");
    });

    it("calls criteriaGenerator and returns result", async () => {
      const mockGenerator = {
        generateCriteria: async () => ({
          criteriaCreated: 5,
          totalChunksAnalyzed: 12,
          averageConfidence: 0.85,
        }),
      };
      const toolsWithGen = createTalosTools({
        ...makeTools(),
        criteriaGenerator: mockGenerator as unknown as import("./knowledge/criteria-generator.js").CriteriaGenerator,
      });
      const t = findTool(toolsWithGen, "talos_generate_criteria");
      const result = await t.handler({
        applicationId: "app-1",
        requirementFilter: "login",
        maxCriteria: 10,
      });
      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.text);
      expect(data.criteriaCreated).toBe(5);
      expect(data.averageConfidence).toBe(0.85);
    });

    it("validates input schema", async () => {
      const t = findTool(tools, "talos_generate_criteria");
      expect(t.riskLevel).toBe("medium");
      expect(t.category).toBe("knowledge");
    });
  });

  // ── talos_get_traceability (#299) ──

  describe("talos_get_traceability", () => {
    it("returns traceability report for app with no data", async () => {
      const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://example.com" });
      const t = findTool(tools, "talos_get_traceability");
      const result = await t.handler({ applicationId: app.id });
      expect(result.isError).toBeUndefined();
      expect(result.text).toContain("Traceability Report");
      expect(result.text).toContain("0/0 covered");
      expect(result.text).toContain("0%");
    });

    it("returns traceability with criteria data", async () => {
      const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://example.com" });
      repo.createAcceptanceCriteria({ applicationId: app.id, title: "AC1", description: "d1" });
      repo.createAcceptanceCriteria({ applicationId: app.id, title: "AC2", description: "d2", status: "implemented" });
      const t = findTool(tools, "talos_get_traceability");
      const result = await t.handler({ applicationId: app.id });
      expect(result.text).toContain("1/2 implemented");
    });

    it("has low riskLevel", async () => {
      const t = findTool(tools, "talos_get_traceability");
      expect(t.riskLevel).toBe("low");
      expect(t.category).toBe("knowledge");
    });
  });

  // ── talos_create_criteria (#300) ──

  describe("talos_create_criteria", () => {
    it("creates criteria with minimal fields", async () => {
      const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://example.com" });
      const t = findTool(tools, "talos_create_criteria");
      const result = await t.handler({
        applicationId: app.id,
        title: "Login works",
        description: "User can log in",
      });
      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.text);
      expect(data.title).toBe("Login works");
      expect(data.status).toBe("draft");
      expect(data.id).toBeTruthy();
    });

    it("creates criteria with full fields", async () => {
      const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://example.com" });
      const t = findTool(tools, "talos_create_criteria");
      const result = await t.handler({
        applicationId: app.id,
        title: "Password reset",
        description: "User can reset password",
        scenarios: [{ given: "registered user", when: "requests reset", then: "email sent" }],
        preconditions: ["user exists"],
        dataRequirements: ["valid email"],
        nfrTags: ["security"],
        status: "approved",
        confidence: 0.9,
        tags: ["auth"],
      });
      const data = JSON.parse(result.text);
      expect(data.title).toBe("Password reset");
      expect(data.status).toBe("approved");
      expect(data.confidence).toBe(0.9);
    });

    it("has medium riskLevel", () => {
      const t = findTool(tools, "talos_create_criteria");
      expect(t.riskLevel).toBe("medium");
    });
  });

  // ── talos_update_criteria (#300) ──

  describe("talos_update_criteria", () => {
    it("updates existing criteria", async () => {
      const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://example.com" });
      const ac = repo.createAcceptanceCriteria({ applicationId: app.id, title: "Original", description: "d" });
      const t = findTool(tools, "talos_update_criteria");
      const result = await t.handler({ id: ac.id, title: "Updated", status: "approved" });
      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.text);
      expect(data.title).toBe("Updated");
      expect(data.status).toBe("approved");
    });

    it("returns error for non-existent criteria", async () => {
      const t = findTool(tools, "talos_update_criteria");
      const result = await t.handler({ id: "00000000-0000-0000-0000-000000000000", title: "X" });
      expect(result.isError).toBe(true);
    });

    it("has medium riskLevel", () => {
      const t = findTool(tools, "talos_update_criteria");
      expect(t.riskLevel).toBe("medium");
    });
  });

  // ── talos_list_criteria (#300) ──

  describe("talos_list_criteria", () => {
    it("lists criteria for an application", async () => {
      const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://example.com" });
      repo.createAcceptanceCriteria({ applicationId: app.id, title: "AC1", description: "d1" });
      repo.createAcceptanceCriteria({ applicationId: app.id, title: "AC2", description: "d2" });
      const t = findTool(tools, "talos_list_criteria");
      const result = await t.handler({ applicationId: app.id });
      const data = JSON.parse(result.text);
      expect(data).toHaveLength(2);
      expect(data[0].title).toBeTruthy();
    });

    it("filters by status", async () => {
      const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://example.com" });
      repo.createAcceptanceCriteria({ applicationId: app.id, title: "Draft", description: "" });
      repo.createAcceptanceCriteria({ applicationId: app.id, title: "Approved", description: "", status: "approved" });
      const t = findTool(tools, "talos_list_criteria");
      const result = await t.handler({ applicationId: app.id, status: "approved" });
      const data = JSON.parse(result.text);
      expect(data).toHaveLength(1);
      expect(data[0].title).toBe("Approved");
    });

    it("returns empty array when no criteria", async () => {
      const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://example.com" });
      const t = findTool(tools, "talos_list_criteria");
      const result = await t.handler({ applicationId: app.id });
      expect(JSON.parse(result.text)).toEqual([]);
    });

    it("has low riskLevel", () => {
      const t = findTool(tools, "talos_list_criteria");
      expect(t.riskLevel).toBe("low");
    });
  });

  // ── talos_delete_criteria (#300) ──

  describe("talos_delete_criteria", () => {
    it("deletes existing criteria", async () => {
      const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://example.com" });
      const ac = repo.createAcceptanceCriteria({ applicationId: app.id, title: "Del", description: "" });
      const t = findTool(tools, "talos_delete_criteria");
      const result = await t.handler({ id: ac.id });
      expect(result.isError).toBeUndefined();
      expect(result.text).toContain("Deleted");
      // Verify it's gone
      expect(repo.getAcceptanceCriteria(ac.id)).toBeNull();
    });

    it("returns error for non-existent criteria", async () => {
      const t = findTool(tools, "talos_delete_criteria");
      const result = await t.handler({ id: "00000000-0000-0000-0000-000000000000" });
      expect(result.isError).toBe(true);
    });

    it("has high riskLevel", () => {
      const t = findTool(tools, "talos_delete_criteria");
      expect(t.riskLevel).toBe("high");
    });
  });

  // ── Engine wiring (#526–#529) ────────────────────────────────────────────

  describe("engine wiring", () => {
    it("run-test invokes PlaywrightRunner.executeTest when wired (#526)", async () => {
      const env = makeTools();
      const app = env.repo.createApplication({
        name: "RunApp",
        repositoryUrl: "https://github.com/a/b",
        baseUrl: "https://a.com",
      });
      const test = env.repo.createTest({ applicationId: app.id, name: "T", code: "test()", type: "e2e" });

      const executeTest = (await import("vitest")).vi.fn().mockResolvedValue({
        status: "passed",
        durationMs: 1234,
        artifacts: { screenshots: ["a.png"], videos: [], traces: [], logs: [] },
      });
      const tools = createTalosTools({
        ...env,
        playwrightRunner: { executeTest } as unknown as import("./runner/playwright-runner.js").PlaywrightRunner,
      });
      const t = findTool(tools, "talos-run-test");
      const result = await t.handler({ testId: test.id });
      expect(executeTest).toHaveBeenCalledTimes(1);
      const data = JSON.parse(result.text);
      expect(data.status).toBe("passed");
      expect(data.durationMs).toBe(1234);
      expect(data.artifactCounts.screenshots).toBe(1);
      expect(result.isError).toBeFalsy();
    });

    it("run-test surfaces failed status as isError (#526)", async () => {
      const env = makeTools();
      const app = env.repo.createApplication({
        name: "RunApp",
        repositoryUrl: "https://github.com/a/b",
        baseUrl: "https://a.com",
      });
      const test = env.repo.createTest({ applicationId: app.id, name: "T", code: "test()", type: "e2e" });
      const executeTest = (await import("vitest")).vi.fn().mockResolvedValue({
        status: "failed",
        durationMs: 50,
        errorMessage: "boom",
        artifacts: { screenshots: [], videos: [], traces: [], logs: [] },
      });
      const tools = createTalosTools({
        ...env,
        playwrightRunner: { executeTest } as unknown as import("./runner/playwright-runner.js").PlaywrightRunner,
      });
      const t = findTool(tools, "talos-run-test");
      const result = await t.handler({ testId: test.id });
      expect(result.isError).toBe(true);
    });

    it("run-test catches runner exceptions (#526)", async () => {
      const env = makeTools();
      const app = env.repo.createApplication({
        name: "RunApp",
        repositoryUrl: "https://github.com/a/b",
        baseUrl: "https://a.com",
      });
      const test = env.repo.createTest({ applicationId: app.id, name: "T", code: "test()", type: "e2e" });
      const executeTest = (await import("vitest")).vi.fn().mockRejectedValue(new Error("network down"));
      const tools = createTalosTools({
        ...env,
        playwrightRunner: { executeTest } as unknown as import("./runner/playwright-runner.js").PlaywrightRunner,
      });
      const t = findTool(tools, "talos-run-test");
      const result = await t.handler({ testId: test.id });
      expect(result.isError).toBe(true);
      expect(result.text).toContain("network down");
    });

    it("generate-test invokes TestGenerator.generate when wired (#527)", async () => {
      const env = makeTools();
      const app = env.repo.createApplication({
        name: "GenApp",
        repositoryUrl: "https://github.com/a/b",
        baseUrl: "https://a.com",
      });
      const generate = (await import("vitest")).vi.fn().mockResolvedValue({
        success: true,
        attempts: 1,
        test: {
          id: "gen-1",
          name: "Generated",
          code: "test('g', async () => {});",
          generationConfidence: 0.9,
        },
      });
      const tools = createTalosTools({
        ...env,
        testGenerator: { generate } as unknown as import("./generator/test-generator.js").TestGenerator,
      });
      const t = findTool(tools, "talos-generate-test");
      const result = await t.handler({ applicationId: app.id, prompt: "verify login flow" });
      expect(generate).toHaveBeenCalledWith(
        expect.objectContaining({ applicationId: app.id, request: "verify login flow" })
      );
      const data = JSON.parse(result.text);
      expect(data.testId).toBe("gen-1");
      expect(data.confidence).toBe(0.9);
    });

    it("generate-test reports generator failure (#527)", async () => {
      const env = makeTools();
      const app = env.repo.createApplication({
        name: "GenApp",
        repositoryUrl: "https://github.com/a/b",
        baseUrl: "https://a.com",
      });
      const generate = (await import("vitest")).vi
        .fn()
        .mockResolvedValue({ success: false, attempts: 3, error: "validation failed" });
      const tools = createTalosTools({
        ...env,
        testGenerator: { generate } as unknown as import("./generator/test-generator.js").TestGenerator,
      });
      const t = findTool(tools, "talos-generate-test");
      const result = await t.handler({ applicationId: app.id, prompt: "verify login flow" });
      expect(result.isError).toBe(true);
      expect(result.text).toContain("validation failed");
    });

    it("generate-test catches generator exceptions (#527)", async () => {
      const env = makeTools();
      const app = env.repo.createApplication({
        name: "GenApp",
        repositoryUrl: "https://github.com/a/b",
        baseUrl: "https://a.com",
      });
      const generate = (await import("vitest")).vi.fn().mockRejectedValue(new Error("LLM unavailable"));
      const tools = createTalosTools({
        ...env,
        testGenerator: { generate } as unknown as import("./generator/test-generator.js").TestGenerator,
      });
      const t = findTool(tools, "talos-generate-test");
      const result = await t.handler({ applicationId: app.id, prompt: "verify login flow" });
      expect(result.isError).toBe(true);
      expect(result.text).toContain("LLM unavailable");
    });

    it("discover-repository invokes DiscoveryEngine.startDiscovery when wired (#528)", async () => {
      const env = makeTools();
      const app = env.repo.createApplication({
        name: "DiscApp",
        repositoryUrl: "https://github.com/a/b",
        baseUrl: "https://a.com",
      });
      const startDiscovery = (await import("vitest")).vi.fn().mockResolvedValue({
        id: "job-1",
        applicationId: app.id,
        status: "completed",
        filesDiscovered: 10,
        filesIndexed: 10,
        chunksCreated: 50,
        errorMessage: null,
      });
      const tools = createTalosTools({
        ...env,
        discoveryEngine: {
          startDiscovery,
        } as unknown as import("./discovery/discovery-engine.js").DiscoveryEngine,
      });
      const t = findTool(tools, "talos-discover-repository");
      const result = await t.handler({ applicationId: app.id, force: true });
      expect(startDiscovery).toHaveBeenCalledWith(expect.objectContaining({ id: app.id }), true);
      const data = JSON.parse(result.text);
      expect(data.status).toBe("completed");
      expect(data.chunksCreated).toBe(50);
      expect(result.isError).toBeFalsy();
    });

    it("discover-repository surfaces failed job as isError (#528)", async () => {
      const env = makeTools();
      const app = env.repo.createApplication({
        name: "DiscApp",
        repositoryUrl: "https://github.com/a/b",
        baseUrl: "https://a.com",
      });
      const startDiscovery = (await import("vitest")).vi.fn().mockResolvedValue({
        id: "job-1",
        applicationId: app.id,
        status: "failed",
        filesDiscovered: 0,
        filesIndexed: 0,
        chunksCreated: 0,
        errorMessage: "auth failed",
      });
      const tools = createTalosTools({
        ...env,
        discoveryEngine: {
          startDiscovery,
        } as unknown as import("./discovery/discovery-engine.js").DiscoveryEngine,
      });
      const t = findTool(tools, "talos-discover-repository");
      const result = await t.handler({ applicationId: app.id });
      expect(result.isError).toBe(true);
    });

    it("discover-repository catches engine exceptions (#528)", async () => {
      const env = makeTools();
      const app = env.repo.createApplication({
        name: "DiscApp",
        repositoryUrl: "https://github.com/a/b",
        baseUrl: "https://a.com",
      });
      const startDiscovery = (await import("vitest")).vi.fn().mockRejectedValue(new Error("rate limited"));
      const tools = createTalosTools({
        ...env,
        discoveryEngine: {
          startDiscovery,
        } as unknown as import("./discovery/discovery-engine.js").DiscoveryEngine,
      });
      const t = findTool(tools, "talos-discover-repository");
      const result = await t.handler({ applicationId: app.id });
      expect(result.isError).toBe(true);
      expect(result.text).toContain("rate limited");
    });

    it("heal-test invokes HealingEngine.heal when wired (#529)", async () => {
      const env = makeTools();
      const app = env.repo.createApplication({
        name: "HealApp",
        repositoryUrl: "https://github.com/a/b",
        baseUrl: "https://a.com",
      });
      const test = env.repo.createTest({ applicationId: app.id, name: "T", code: "test()", type: "e2e" });
      const run = env.repo.createTestRun({ applicationId: app.id, testId: test.id, trigger: "manual" });
      env.repo.updateTestRun(run.id, { status: "failed", errorMessage: "selector timeout" });

      const heal = (await import("vitest")).vi.fn().mockResolvedValue({
        success: true,
        attempt: { id: "att-1", status: "applied" },
        analysis: { rootCause: "selector changed", category: "selector-changed", confidence: 0.92 },
        fixResult: { selectedFix: { changeDescription: "Use getByRole" } },
        verificationRun: { status: "passed" },
      });
      const tools = createTalosTools({
        ...env,
        healingEngine: { heal } as unknown as import("./healing/healing-engine.js").HealingEngine,
      });
      const t = findTool(tools, "talos-heal-test");
      const result = await t.handler({ testRunId: run.id });
      expect(heal).toHaveBeenCalledTimes(1);
      const data = JSON.parse(result.text);
      expect(data.success).toBe(true);
      expect(data.analysis.category).toBe("selector-changed");
      expect(data.fixApplied).toBe("Use getByRole");
      expect(data.verificationStatus).toBe("passed");
    });

    it("heal-test reports failure result (#529)", async () => {
      const env = makeTools();
      const app = env.repo.createApplication({
        name: "HealApp",
        repositoryUrl: "https://github.com/a/b",
        baseUrl: "https://a.com",
      });
      const test = env.repo.createTest({ applicationId: app.id, name: "T", code: "test()", type: "e2e" });
      const run = env.repo.createTestRun({ applicationId: app.id, testId: test.id, trigger: "manual" });
      env.repo.updateTestRun(run.id, { status: "failed", errorMessage: "x" });

      const heal = (await import("vitest")).vi.fn().mockResolvedValue({
        success: false,
        attempt: { id: "att-1", status: "failed" },
        error: "no candidate fix",
      });
      const tools = createTalosTools({
        ...env,
        healingEngine: { heal } as unknown as import("./healing/healing-engine.js").HealingEngine,
      });
      const t = findTool(tools, "talos-heal-test");
      const result = await t.handler({ testRunId: run.id });
      expect(result.isError).toBe(true);
      const data = JSON.parse(result.text);
      expect(data.error).toBe("no candidate fix");
    });

    it("heal-test catches engine exceptions (#529)", async () => {
      const env = makeTools();
      const app = env.repo.createApplication({
        name: "HealApp",
        repositoryUrl: "https://github.com/a/b",
        baseUrl: "https://a.com",
      });
      const test = env.repo.createTest({ applicationId: app.id, name: "T", code: "test()", type: "e2e" });
      const run = env.repo.createTestRun({ applicationId: app.id, testId: test.id, trigger: "manual" });
      env.repo.updateTestRun(run.id, { status: "failed", errorMessage: "x" });

      const heal = (await import("vitest")).vi.fn().mockRejectedValue(new Error("LLM down"));
      const tools = createTalosTools({
        ...env,
        healingEngine: { heal } as unknown as import("./healing/healing-engine.js").HealingEngine,
      });
      const t = findTool(tools, "talos-heal-test");
      const result = await t.handler({ testRunId: run.id });
      expect(result.isError).toBe(true);
      expect(result.text).toContain("LLM down");
    });
  });
});
