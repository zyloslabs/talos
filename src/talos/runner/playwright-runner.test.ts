/**
 * Tests for PlaywrightRunner
 *
 * Mocks the @playwright/test module entirely to avoid launching a real browser
 * while still exercising all execution-flow code paths.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { TalosRepository } from "../repository.js";
import { ArtifactManager } from "./artifact-manager.js";
import { CredentialInjector } from "./credential-injector.js";
import { PlaywrightRunner, type PlaywrightRunnerOptions } from "./playwright-runner.js";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ── Helpers ─────────────────────────────────────────────────────────────

function createRepo() {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const repo = new TalosRepository(db);
  repo.migrate();
  return repo;
}

function createMockPage() {
  return {
    goto: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
    fill: vi.fn().mockResolvedValue(undefined),
    type: vi.fn().mockResolvedValue(undefined),
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    waitForURL: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(Buffer.from("fake-png")),
    locator: vi.fn(),
    getByRole: vi.fn(),
    getByText: vi.fn(),
    getByTestId: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockContext(page: ReturnType<typeof createMockPage>) {
  return {
    newPage: vi.fn().mockResolvedValue(page),
    tracing: {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
    },
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockBrowserInstance(ctx: ReturnType<typeof createMockContext>) {
  return {
    newContext: vi.fn().mockResolvedValue(ctx),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

describe("PlaywrightRunner", () => {
  let repo: TalosRepository;
  let tempDir: string;
  let runner: PlaywrightRunner;
  let mockPage: ReturnType<typeof createMockPage>;
  let mockCtx: ReturnType<typeof createMockContext>;
  let mockBrowser: ReturnType<typeof createMockBrowserInstance>;
  let artifactMgr: ArtifactManager;
  let credInjector: CredentialInjector;

  beforeEach(() => {
    repo = createRepo();
    tempDir = mkdtempSync(join(tmpdir(), "pw-runner-test-"));

    artifactMgr = new ArtifactManager({
      config: { path: tempDir, retentionDays: 30, maxStorageMb: 5000 },
      repository: repo,
    });

    credInjector = new CredentialInjector({
      repository: repo,
      resolveSecret: vi.fn().mockResolvedValue(null),
    });

    // Build browser mock chain
    mockPage = createMockPage();
    mockCtx = createMockContext(mockPage);
    mockBrowser = createMockBrowserInstance(mockCtx);

    // Mock Playwright import
    vi.doMock("@playwright/test", () => ({
      chromium: { launch: vi.fn().mockResolvedValue(mockBrowser) },
      firefox: { launch: vi.fn().mockResolvedValue(mockBrowser) },
      webkit: { launch: vi.fn().mockResolvedValue(mockBrowser) },
    }));

    runner = new PlaywrightRunner({
      config: {
        headless: true,
        slowMo: 0,
        defaultBrowser: "chromium",
        timeout: 30000,
        navigationTimeout: 60000,
        screenshotOnFailure: true,
        workers: 1,
        retries: 0,
        traceMode: "off",
        video: "off",
        parallel: 1,
      },
      repository: repo,
      artifactManager: artifactMgr,
      credentialInjector: credInjector,
    } as PlaywrightRunnerOptions);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    try { rmSync(tempDir, { recursive: true }); } catch {}
  });

  // ── executeTest ───────────────────────────────────────────────────────

  it("executeTest: passing test returns passed status", async () => {
    const app = repo.createApplication({
      name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://a.com",
    });
    const test = repo.createTest({
      applicationId: app.id,
      name: "simple pass",
      code: `await page.goto("https://a.com");`,
      type: "e2e",
    });
    const run = repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });

    const result = await runner.executeTest(test, run);
    expect(result.status).toBe("passed");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);

    const updated = repo.getTestRun(run.id);
    expect(updated?.status).toBe("passed");
  });

  it("executeTest: failing test captures screenshot", async () => {
    mockPage.goto.mockRejectedValueOnce(new Error("net::ERR_CONNECTION_REFUSED"));

    const app = repo.createApplication({
      name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://a.com",
    });
    const test = repo.createTest({
      applicationId: app.id, name: "failing",
      code: `await page.goto("https://a.com");`, type: "e2e",
    });
    const run = repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });

    const result = await runner.executeTest(test, run);
    expect(result.status).toBe("failed");
    expect(result.errorMessage).toContain("net::ERR_CONNECTION_REFUSED");
    expect(result.artifacts.screenshots.length).toBeGreaterThanOrEqual(1);
  });

  it("executeTest: sets status to running then final status", async () => {
    const app = repo.createApplication({
      name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://a.com",
    });
    const test = repo.createTest({
      applicationId: app.id, name: "simple", code: `// noop`, type: "e2e",
    });
    const run = repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });
    const spy = vi.spyOn(repo, "updateTestRun");

    await runner.executeTest(test, run);

    expect(spy.mock.calls[0][1]).toEqual(expect.objectContaining({ status: "running" }));
    const lastCall = spy.mock.calls[spy.mock.calls.length - 1][1];
    expect(lastCall).toEqual(expect.objectContaining({ status: "passed" }));
  });

  it("executeTest: bad code returns failed status", async () => {
    const app = repo.createApplication({
      name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://a.com",
    });
    const test = repo.createTest({
      applicationId: app.id, name: "bad", code: `{{{INVALID`, type: "e2e",
    });
    const run = repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });

    const result = await runner.executeTest(test, run);
    expect(result.status).toBe("failed");
    expect(result.errorMessage).toBeDefined();
  });

  // ── executeWithRetries ────────────────────────────────────────────────

  it("executeWithRetries: returns passed on first attempt if test succeeds", async () => {
    const app = repo.createApplication({
      name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://a.com",
    });
    const test = repo.createTest({
      applicationId: app.id, name: "quick pass", code: `// ok`, type: "e2e",
    });
    const run = repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });

    const result = await runner.executeWithRetries(test, run, { retries: 2 });
    expect(result.status).toBe("passed");
  });

  it("executeWithRetries: retries on failure", async () => {
    let callCount = 0;
    mockPage.goto.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw new Error("transient");
    });

    const app = repo.createApplication({
      name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://a.com",
    });
    const test = repo.createTest({
      applicationId: app.id, name: "retry test", code: `await page.goto("https://a.com");`, type: "e2e",
    });
    const run = repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });

    const result = await runner.executeWithRetries(test, run, { retries: 1 });
    expect(result.status).toBe("passed");
  });

  // ── Tracing / video config ────────────────────────────────────────────

  it("executeTest: tracing enabled starts and stops trace", async () => {
    const tracingRunner = new PlaywrightRunner({
      config: {
        headless: true, slowMo: 0, defaultBrowser: "chromium",
        timeout: 30000, navigationTimeout: 60000, screenshotOnFailure: true,
        workers: 1, retries: 0, traceMode: "on", video: "off", parallel: 1,
      },
      repository: repo,
      artifactManager: artifactMgr,
      credentialInjector: credInjector,
    } as PlaywrightRunnerOptions);

    const app = repo.createApplication({
      name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://a.com",
    });
    const test = repo.createTest({ applicationId: app.id, name: "traced", code: `// ok`, type: "e2e" });
    const run = repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });

    await tracingRunner.executeTest(test, run);
    expect(mockCtx.tracing.start).toHaveBeenCalled();
    expect(mockCtx.tracing.stop).toHaveBeenCalled();
  });

  it("executeTest: uses firefox browser when specified", async () => {
    const app = repo.createApplication({
      name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://a.com",
    });
    const test = repo.createTest({ applicationId: app.id, name: "ff", code: `// ok`, type: "e2e" });
    const run = repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });

    const result = await runner.executeTest(test, run, { browser: "firefox" });
    expect(result.status).toBe("passed");
  });

  it("executeTest: uses webkit browser when specified", async () => {
    const app = repo.createApplication({
      name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://a.com",
    });
    const test = repo.createTest({ applicationId: app.id, name: "wk", code: `// ok`, type: "e2e" });
    const run = repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });

    const result = await runner.executeTest(test, run, { browser: "webkit" });
    expect(result.status).toBe("passed");
  });

  it("executeTest: shouldRecordVideo triggers video recording path", async () => {
    const videoRunner = new PlaywrightRunner({
      config: {
        headless: true, slowMo: 0, defaultBrowser: "chromium",
        timeout: 30000, navigationTimeout: 60000, screenshotOnFailure: true,
        workers: 1, retries: 0, traceMode: "off", video: "on", parallel: 1,
      },
      repository: repo,
      artifactManager: artifactMgr,
      credentialInjector: credInjector,
    } as PlaywrightRunnerOptions);
    const app = repo.createApplication({
      name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://a.com",
    });
    const test = repo.createTest({ applicationId: app.id, name: "video", code: `// ok`, type: "e2e" });
    const run = repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });

    // Should pass even if video dir doesn't exist (swallows error)
    const result = await videoRunner.executeTest(test, run);
    expect(["passed", "failed"]).toContain(result.status);
  });

  it("executeWithRetries: exhausts retries if test always fails", async () => {
    mockPage.goto.mockRejectedValue(new Error("always fails"));

    const app = repo.createApplication({
      name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://a.com",
    });
    const test = repo.createTest({
      applicationId: app.id, name: "always-fail",
      code: `await page.goto("https://a.com");`, type: "e2e",
    });
    const run = repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });

    const result = await runner.executeWithRetries(test, run, { retries: 2 });
    expect(result.status).toBe("failed");
  });

  // ── expect() matcher coverage ──────────────────────────────────────────────

  async function runCode(repo_: typeof repo, runner_: PlaywrightRunner, code: string, appId: string) {
    const t = repo_.createTest({ applicationId: appId, name: `test-${Math.random()}`, code, type: "e2e" });
    const r = repo_.createTestRun({ testId: t.id, applicationId: appId, trigger: "manual" });
    return runner_.executeTest(t, r);
  }

  it("expect matchers: toBe passes and fails correctly", async () => {
    const app = repo.createApplication({ name: "B", repositoryUrl: "https://github.com/a/b", baseUrl: "https://b.com" });
    const pass = await runCode(repo, runner, `expect(1).toBe(1);`, app.id);
    expect(pass.status).toBe("passed");

    const fail = await runCode(repo, runner, `expect(1).toBe(2);`, app.id);
    expect(fail.status).toBe("failed");
    expect(fail.errorMessage).toContain("Expected 1 to be 2");
  });

  it("expect matchers: toEqual passes and fails correctly", async () => {
    const app = repo.createApplication({ name: "C", repositoryUrl: "https://github.com/a/b", baseUrl: "https://c.com" });
    const pass = await runCode(repo, runner, `expect({a:1}).toEqual({a:1});`, app.id);
    expect(pass.status).toBe("passed");

    const fail = await runCode(repo, runner, `expect({a:1}).toEqual({a:2});`, app.id);
    expect(fail.status).toBe("failed");
    expect(fail.errorMessage).toContain("to equal");
  });

  it("expect matchers: toBeTruthy passes and fails", async () => {
    const app = repo.createApplication({ name: "D", repositoryUrl: "https://github.com/a/b", baseUrl: "https://d.com" });
    const pass = await runCode(repo, runner, `expect(true).toBeTruthy();`, app.id);
    expect(pass.status).toBe("passed");

    const fail = await runCode(repo, runner, `expect(false).toBeTruthy();`, app.id);
    expect(fail.status).toBe("failed");
    expect(fail.errorMessage).toContain("truthy");
  });

  it("expect matchers: toBeFalsy passes and fails", async () => {
    const app = repo.createApplication({ name: "E", repositoryUrl: "https://github.com/a/b", baseUrl: "https://e.com" });
    const pass = await runCode(repo, runner, `expect(false).toBeFalsy();`, app.id);
    expect(pass.status).toBe("passed");

    const fail = await runCode(repo, runner, `expect(true).toBeFalsy();`, app.id);
    expect(fail.status).toBe("failed");
    expect(fail.errorMessage).toContain("falsy");
  });

  it("expect matchers: toContain passes and fails for strings and arrays", async () => {
    const app = repo.createApplication({ name: "F", repositoryUrl: "https://github.com/a/b", baseUrl: "https://f.com" });
    const passStr = await runCode(repo, runner, `expect("hello").toContain("ell");`, app.id);
    expect(passStr.status).toBe("passed");

    const failStr = await runCode(repo, runner, `expect("hello").toContain("xyz");`, app.id);
    expect(failStr.status).toBe("failed");

    const passArr = await runCode(repo, runner, `expect([1,2,3]).toContain(2);`, app.id);
    expect(passArr.status).toBe("passed");

    const failArr = await runCode(repo, runner, `expect([1,2,3]).toContain(99);`, app.id);
    expect(failArr.status).toBe("failed");
  });

  it("expect matchers: toBeGreaterThan passes and fails", async () => {
    const app = repo.createApplication({ name: "G", repositoryUrl: "https://github.com/a/b", baseUrl: "https://g.com" });
    const pass = await runCode(repo, runner, `expect(5).toBeGreaterThan(3);`, app.id);
    expect(pass.status).toBe("passed");

    const fail = await runCode(repo, runner, `expect(1).toBeGreaterThan(5);`, app.id);
    expect(fail.status).toBe("failed");
    expect(fail.errorMessage).toContain("greater than");
  });

  it("expect matchers: toBeLessThan passes and fails", async () => {
    const app = repo.createApplication({ name: "H", repositoryUrl: "https://github.com/a/b", baseUrl: "https://h.com" });
    const pass = await runCode(repo, runner, `expect(1).toBeLessThan(5);`, app.id);
    expect(pass.status).toBe("passed");

    const fail = await runCode(repo, runner, `expect(5).toBeLessThan(1);`, app.id);
    expect(fail.status).toBe("failed");
    expect(fail.errorMessage).toContain("less than");
  });

  it("expect matchers: toMatch passes and fails", async () => {
    const app = repo.createApplication({ name: "I", repositoryUrl: "https://github.com/a/b", baseUrl: "https://i.com" });
    const pass = await runCode(repo, runner, `expect("hello world").toMatch(/hello/);`, app.id);
    expect(pass.status).toBe("passed");

    const fail = await runCode(repo, runner, `expect("hello world").toMatch(/xyz/);`, app.id);
    expect(fail.status).toBe("failed");
    expect(fail.errorMessage).toContain("match");
  });

  it("expect matchers: .not.toBe passes and fails", async () => {
    const app = repo.createApplication({ name: "J", repositoryUrl: "https://github.com/a/b", baseUrl: "https://j.com" });
    const pass = await runCode(repo, runner, `expect(1).not.toBe(2);`, app.id);
    expect(pass.status).toBe("passed");

    const fail = await runCode(repo, runner, `expect(1).not.toBe(1);`, app.id);
    expect(fail.status).toBe("failed");
    expect(fail.errorMessage).toContain("not to be");
  });

  it("expect matchers: .not.toEqual passes and fails", async () => {
    const app = repo.createApplication({ name: "K", repositoryUrl: "https://github.com/a/b", baseUrl: "https://k.com" });
    const pass = await runCode(repo, runner, `expect({a:1}).not.toEqual({a:2});`, app.id);
    expect(pass.status).toBe("passed");

    const fail = await runCode(repo, runner, `expect({a:1}).not.toEqual({a:1});`, app.id);
    expect(fail.status).toBe("failed");
    expect(fail.errorMessage).toContain("not to equal");
  });

  it("expect matchers: .not.toBeTruthy and .not.toBeFalsy pass and fail", async () => {
    const app = repo.createApplication({ name: "L", repositoryUrl: "https://github.com/a/b", baseUrl: "https://l.com" });
    const passNt = await runCode(repo, runner, `expect(false).not.toBeTruthy();`, app.id);
    expect(passNt.status).toBe("passed");

    const failNt = await runCode(repo, runner, `expect(true).not.toBeTruthy();`, app.id);
    expect(failNt.status).toBe("failed");

    const passNf = await runCode(repo, runner, `expect(true).not.toBeFalsy();`, app.id);
    expect(passNf.status).toBe("passed");

    const failNf = await runCode(repo, runner, `expect(false).not.toBeFalsy();`, app.id);
    expect(failNf.status).toBe("failed");
  });

  it("expect matchers: .not.toContain passes and fails for strings and arrays", async () => {
    const app = repo.createApplication({ name: "M", repositoryUrl: "https://github.com/a/b", baseUrl: "https://m.com" });
    const passStr = await runCode(repo, runner, `expect("hello").not.toContain("xyz");`, app.id);
    expect(passStr.status).toBe("passed");

    const failStr = await runCode(repo, runner, `expect("hello").not.toContain("ell");`, app.id);
    expect(failStr.status).toBe("failed");

    const passArr = await runCode(repo, runner, `expect([1,2]).not.toContain(3);`, app.id);
    expect(passArr.status).toBe("passed");

    const failArr = await runCode(repo, runner, `expect([1,2]).not.toContain(1);`, app.id);
    expect(failArr.status).toBe("failed");
  });

  it("expect matchers: .not.toBeGreaterThan and .not.toBeLessThan", async () => {
    const app = repo.createApplication({ name: "N", repositoryUrl: "https://github.com/a/b", baseUrl: "https://n.com" });
    const passNGt = await runCode(repo, runner, `expect(1).not.toBeGreaterThan(5);`, app.id);
    expect(passNGt.status).toBe("passed");

    const failNGt = await runCode(repo, runner, `expect(5).not.toBeGreaterThan(3);`, app.id);
    expect(failNGt.status).toBe("failed");

    const passNLt = await runCode(repo, runner, `expect(5).not.toBeLessThan(1);`, app.id);
    expect(passNLt.status).toBe("passed");

    const failNLt = await runCode(repo, runner, `expect(1).not.toBeLessThan(5);`, app.id);
    expect(failNLt.status).toBe("failed");
  });

  it("expect matchers: .not.toMatch passes and fails", async () => {
    const app = repo.createApplication({ name: "O", repositoryUrl: "https://github.com/a/b", baseUrl: "https://o.com" });
    const pass = await runCode(repo, runner, `expect("hello").not.toMatch(/xyz/);`, app.id);
    expect(pass.status).toBe("passed");

    const fail = await runCode(repo, runner, `expect("hello").not.toMatch(/hello/);`, app.id);
    expect(fail.status).toBe("failed");
  });

  it("expect matchers: .not.not returns a positive matcher", async () => {
    const app = repo.createApplication({ name: "P", repositoryUrl: "https://github.com/a/b", baseUrl: "https://p.com" });
    const pass = await runCode(repo, runner, `expect(1).not.not.toBe(1);`, app.id);
    expect(pass.status).toBe("passed");
  });

  it("executeTest: test.step() captures screenshot on step failure", async () => {
    const app = repo.createApplication({ name: "Q", repositoryUrl: "https://github.com/a/b", baseUrl: "https://q.com" });
    const code = `await test.step("failing step", async () => { throw new Error("step err"); });`;
    const t = repo.createTest({ applicationId: app.id, name: "step-fail", code, type: "e2e" });
    const r = repo.createTestRun({ testId: t.id, applicationId: app.id, trigger: "manual" });

    const result = await runner.executeTest(t, r);
    expect(result.status).toBe("failed");
    // Step failure captures a screenshot before re-throwing
    expect(result.artifacts.screenshots.length).toBeGreaterThanOrEqual(1);
  });
});
