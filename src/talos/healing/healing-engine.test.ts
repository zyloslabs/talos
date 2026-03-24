/**
 * Tests for HealingEngine
 *
 * We mock both FixGenerator and CodeValidator modules to avoid
 * dealing with LLM response parsing and new Function() limitations.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { TalosRepository } from "../repository.js";
import type { PlaywrightRunner } from "../runner/playwright-runner.js";

// Mock CodeValidator
vi.mock("../generator/code-validator.js", () => ({
  CodeValidator: class {
    validate() { return { isValid: true, errors: [], warnings: [], suggestions: [] }; }
    autoFix(code: string) { return { code, fixes: [] }; }
  },
}));

// Mock FixGenerator so we control the fix generation outcome
const mockGenerateFixes = vi.fn();
const mockApplyFix = vi.fn();
vi.mock("./fix-generator.js", () => ({
  FixGenerator: class {
    constructor() {}
    generateFixes = mockGenerateFixes;
    applyFix = mockApplyFix;
  },
}));

// Import after mocks are declared
const { HealingEngine } = await import("./healing-engine.js");
type HealingEngineOptionsType = ConstructorParameters<typeof HealingEngine>[0];

function createRepo() {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const repo = new TalosRepository(db);
  repo.migrate();
  return repo;
}

function createEngine(repo: TalosRepository, opts?: {
  runnerStatus?: "passed" | "failed";
  enabled?: boolean;
}) {
  const status = opts?.runnerStatus ?? "passed";
  const mockRunner = {
    executeTest: vi.fn().mockImplementation(async (_test: unknown, run: { id: string }) => {
      repo.updateTestRun(run.id, { status, durationMs: 100 });
    }),
  } as unknown as PlaywrightRunner;

  const engine = new HealingEngine({
    config: { enabled: opts?.enabled ?? true, confidenceThreshold: 0.85, maxRetries: 3, cooldownMs: 0 },
    repository: repo,
    playwrightRunner: mockRunner,
    generateWithLLM: vi.fn(),
  } as HealingEngineOptionsType);

  return { engine, mockRunner };
}

describe("HealingEngine", () => {
  let repo: TalosRepository;

  beforeEach(() => {
    repo = createRepo();
    vi.clearAllMocks();
  });

  it("heal returns error when test not found", async () => {
    const { engine } = createEngine(repo);
    const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://a.com" });
    const test = repo.createTest({ applicationId: app.id, name: "t1", code: "test('x', async () => {});", type: "e2e" });
    const run = repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });
    repo.deleteTest(test.id);

    const result = await engine.heal(run);
    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("heal returns error when healing is disabled", async () => {
    const { engine } = createEngine(repo, { enabled: false });
    const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://a.com" });
    const test = repo.createTest({ applicationId: app.id, name: "t1", code: "test('x', async () => {});", type: "e2e" });
    const run = repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });

    const result = await engine.heal(run);
    expect(result.success).toBe(false);
    expect(result.error).toContain("disabled");
  });

  it("heal detects concurrent healing", async () => {
    mockGenerateFixes.mockImplementation(() => new Promise(() => {})); // never resolves
    const { engine } = createEngine(repo);
    const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://a.com" });
    const test = repo.createTest({ applicationId: app.id, name: "t1", code: "test('x', async () => {});", type: "e2e" });
    const run1 = repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });
    repo.updateTestRun(run1.id, { status: "failed", errorMessage: "locator('.old') exceeded timeout" });
    const run2 = repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });
    repo.updateTestRun(run2.id, { status: "failed", errorMessage: "locator('.old') exceeded timeout" });

    const p1 = engine.heal(repo.getTestRun(run1.id)!);
    const r2 = await engine.heal(repo.getTestRun(run2.id)!);
    expect(r2.success).toBe(false);
    expect(r2.error).toContain("already in progress");
    void p1.catch(() => {});
  });

  it("heal succeeds with passing verification", async () => {
    const fixedCode = "test('fixed', async ({page}) => { await page.goto('/ok'); });";
    mockGenerateFixes.mockResolvedValue({
      success: true,
      fixes: [{ originalCode: "old", fixedCode, changeDescription: "fixed selector", diff: "", confidence: 0.9, suggestedFix: { type: "update-selector" } }],
      selectedFix: { originalCode: "old", fixedCode, changeDescription: "fixed selector", diff: "", confidence: 0.9, suggestedFix: { type: "update-selector" } },
    });
    mockApplyFix.mockResolvedValue(null);

    const { engine } = createEngine(repo);
    const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://a.com" });
    const test = repo.createTest({ applicationId: app.id, name: "t1", code: "test('x', async ({page}) => {});", type: "e2e" });
    const run = repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });
    repo.updateTestRun(run.id, { status: "failed", errorMessage: "locator('.old') exceeded timeout" });

    const result = await engine.heal(repo.getTestRun(run.id)!);
    expect(result.success).toBe(true);
    expect(result.attempt.status).toBe("succeeded");
    expect(mockApplyFix).toHaveBeenCalled();
  });

  it("heal fails when no fix generated", async () => {
    mockGenerateFixes.mockResolvedValue({
      success: false,
      fixes: [],
      error: "No valid fixes could be generated",
    });

    const { engine } = createEngine(repo);
    const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://a.com" });
    const test = repo.createTest({ applicationId: app.id, name: "t1", code: "test('x', async ({page}) => {});", type: "e2e" });
    const run = repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });
    repo.updateTestRun(run.id, { status: "failed", errorMessage: "locator('.old') exceeded timeout" });

    const result = await engine.heal(repo.getTestRun(run.id)!);
    expect(result.success).toBe(false);
    expect(result.error).toBe("No valid fixes could be generated");
  });

  it("heal fails when verification fails", async () => {
    const fixedCode = "test('still-broken', async ({page}) => {});";
    mockGenerateFixes.mockResolvedValue({
      success: true,
      fixes: [{ originalCode: "old", fixedCode, changeDescription: "added wait", diff: "", confidence: 0.7, suggestedFix: { type: "add-wait" } }],
      selectedFix: { originalCode: "old", fixedCode, changeDescription: "added wait", diff: "", confidence: 0.7, suggestedFix: { type: "add-wait" } },
    });

    // Runner reports failure
    const { engine } = createEngine(repo, { runnerStatus: "failed" });
    const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://a.com" });
    const test = repo.createTest({ applicationId: app.id, name: "t1", code: "test('x', async ({page}) => {});", type: "e2e" });
    const run = repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });
    repo.updateTestRun(run.id, { status: "failed", errorMessage: "locator('.old') exceeded timeout" });

    const result = await engine.heal(repo.getTestRun(run.id)!);
    expect(result.success).toBe(false);
    expect(result.attempt.status).toBe("failed");
    expect(result.error).toContain("Verification failed");
  });

  it("heal catches unexpected exceptions", async () => {
    mockGenerateFixes.mockRejectedValue(new Error("unexpected kaboom"));
    const { engine } = createEngine(repo);
    const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://a.com" });
    const test = repo.createTest({ applicationId: app.id, name: "t1", code: "test('x', () => {});", type: "e2e" });
    const run = repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });
    repo.updateTestRun(run.id, { status: "failed", errorMessage: "oops" });

    const result = await engine.heal(repo.getTestRun(run.id)!);
    expect(result.success).toBe(false);
    expect(result.error).toBe("unexpected kaboom");
  });

  it("autoHeal skips when disabled", async () => {
    const { engine } = createEngine(repo, { enabled: false });
    const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://a.com" });
    const results = await engine.autoHeal(app.id);
    expect(results).toEqual([]);
  });

  it("autoHeal processes failed tests", async () => {
    const fixedCode = "test('fixed', async () => {});";
    mockGenerateFixes.mockResolvedValue({
      success: true,
      fixes: [{ originalCode: "old", fixedCode, changeDescription: "fix", diff: "", confidence: 0.9, suggestedFix: { type: "update-selector" } }],
      selectedFix: { originalCode: "old", fixedCode, changeDescription: "fix", diff: "", confidence: 0.9, suggestedFix: { type: "update-selector" } },
    });
    mockApplyFix.mockResolvedValue(null);

    const { engine } = createEngine(repo);
    const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://a.com" });
    const test = repo.createTest({ applicationId: app.id, name: "t1", code: "test('x', () => {});", type: "e2e" });
    const run = repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });
    repo.updateTestRun(run.id, { status: "failed", errorMessage: "locator('.old') exceeded timeout" });

    const results = await engine.autoHeal(app.id);
    expect(results.length).toBe(1);
    expect(results[0].success).toBe(true);
  });

  it("getHealingStats returns zeros for fresh app", () => {
    const { engine } = createEngine(repo);
    const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://a.com" });
    const stats = engine.getHealingStats(app.id);
    expect(stats.totalAttempts).toBe(0);
    expect(stats.successfulHeals).toBe(0);
    expect(stats.failedHeals).toBe(0);
    expect(stats.successRate).toBe(0);
    expect(stats.commonFixes).toEqual([]);
  });

  it("heal returns error when max retries is reached", async () => {
    const { engine } = createEngine(repo);
    const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://a.com" });
    // Pre-populate 3 healing attempts within the last hour (at maxRetries threshold)
    const now = new Date();
    const healingAttempts = [
      { id: "h1", testRunId: "r1", timestamp: new Date(now.getTime() - 5 * 60 * 1000).toISOString(), status: "failed", originalError: "err" },
      { id: "h2", testRunId: "r2", timestamp: new Date(now.getTime() - 10 * 60 * 1000).toISOString(), status: "failed", originalError: "err" },
      { id: "h3", testRunId: "r3", timestamp: new Date(now.getTime() - 15 * 60 * 1000).toISOString(), status: "failed", originalError: "err" },
    ];
    const test = repo.createTest({
      applicationId: app.id,
      name: "t1",
      code: "test('x', async () => {});",
      type: "e2e",
      metadata: { healingAttempts },
    });
    const run = repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });

    const result = await engine.heal(run);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Max healing attempts");
  });

  it("heal returns error when cooldown period has not elapsed", async () => {
    const mockRunner = {
      executeTest: vi.fn().mockImplementation(async (_test: unknown, run: { id: string }) => {
        repo.updateTestRun(run.id, { status: "passed", durationMs: 100 });
      }),
    } as unknown as PlaywrightRunner;
    const engine = new HealingEngine({
      config: { enabled: true, confidenceThreshold: 0.85, maxRetries: 3, cooldownMs: 30 * 60 * 1000 },
      repository: repo,
      playwrightRunner: mockRunner,
      generateWithLLM: vi.fn(),
    } as HealingEngineOptionsType);

    const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://a.com" });
    const now = new Date();
    // One healing attempt 5 minutes ago — within the 30-minute cooldown
    const healingAttempts = [
      { id: "h1", testRunId: "r1", timestamp: new Date(now.getTime() - 5 * 60 * 1000).toISOString(), status: "failed", originalError: "err" },
    ];
    const test = repo.createTest({
      applicationId: app.id,
      name: "t1",
      code: "test('x', async () => {});",
      type: "e2e",
      metadata: { healingAttempts },
    });
    const run = repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });

    const result = await engine.heal(run);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Cooldown period not elapsed");
  });

  it("getHealingStats aggregates attempts across tests with fix types", () => {
    const { engine } = createEngine(repo);
    const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://a.com" });
    const healingAttempts = [
      {
        id: "h1", testRunId: "r1", timestamp: new Date().toISOString(), status: "succeeded", originalError: "err",
        appliedFix: { suggestedFix: { type: "update-selector" } },
      },
      {
        id: "h2", testRunId: "r2", timestamp: new Date().toISOString(), status: "failed", originalError: "err",
      },
    ];
    repo.createTest({ applicationId: app.id, name: "t1", code: "test('x', () => {});", type: "e2e", metadata: { healingAttempts } });

    const stats = engine.getHealingStats(app.id);
    expect(stats.totalAttempts).toBe(2);
    expect(stats.successfulHeals).toBe(1);
    expect(stats.failedHeals).toBe(1);
    expect(stats.successRate).toBeCloseTo(0.5);
    expect(stats.commonFixes).toHaveLength(1);
    expect(stats.commonFixes[0].type).toBe("update-selector");
  });
});
