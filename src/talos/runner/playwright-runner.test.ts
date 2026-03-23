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
});
