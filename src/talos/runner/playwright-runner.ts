/**
 * Playwright Runner
 *
 * Executes Playwright tests with artifact capture and credential injection.
 */

import type { TalosTest, TalosTestRun, TalosTestRunStatus } from "../types.js";
import type { TalosRepository } from "../repository.js";
import type { RunnerConfig } from "../config.js";
import { ArtifactManager } from "./artifact-manager.js";
import { CredentialInjector, type ResolvedCredentials } from "./credential-injector.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PlaywrightRunnerOptions = {
  config: RunnerConfig;
  repository: TalosRepository;
  artifactManager: ArtifactManager;
  credentialInjector: CredentialInjector;
};

export type TestExecutionResult = {
  status: TalosTestRunStatus;
  durationMs: number;
  errorMessage?: string;
  errorStack?: string;
  artifacts: {
    screenshots: string[];
    videos: string[];
    traces: string[];
    logs: string[];
  };
};

export type ExecutionOptions = {
  browser?: "chromium" | "firefox" | "webkit";
  credentials?: ResolvedCredentials;
  headless?: boolean;
  timeout?: number;
  retries?: number;
  slowMo?: number;
};

// ── Playwright Runner ─────────────────────────────────────────────────────────

export class PlaywrightRunner {
  private config: RunnerConfig;
  private repository: TalosRepository;
  private artifactManager: ArtifactManager;

  constructor(options: PlaywrightRunnerOptions) {
    this.config = options.config;
    this.repository = options.repository;
    this.artifactManager = options.artifactManager;
    void options.credentialInjector; // Placeholder for future use
  }

  /**
   * Execute a test and update the run record.
   */
  async executeTest(
    test: TalosTest,
    testRun: TalosTestRun,
    options: ExecutionOptions = {}
  ): Promise<TestExecutionResult> {
    const startTime = Date.now();
    const browser = options.browser ?? this.config.defaultBrowser;

    // Update run status to running
    this.repository.updateTestRun(testRun.id, {
      status: "running",
      startedAt: new Date(),
    });

    const result: TestExecutionResult = {
      status: "passed",
      durationMs: 0,
      artifacts: {
        screenshots: [],
        videos: [],
        traces: [],
        logs: [],
      },
    };

    try {
      // Dynamic import Playwright
      const playwright = await import("@playwright/test");
      const { chromium, firefox, webkit } = playwright;

      // Select browser
      const browserType = browser === "firefox" ? firefox : browser === "webkit" ? webkit : chromium;

      // Launch browser
      const browserInstance = await browserType.launch({
        headless: options.headless ?? this.config.headless,
        slowMo: options.slowMo ?? this.config.slowMo,
      });

      // Create context with tracing
      const context = await browserInstance.newContext({
        recordVideo: this.shouldRecordVideo() ? {
          dir: `/tmp/talos-videos-${testRun.id}`,
        } : undefined,
      });

      // Start tracing if configured
      if (this.shouldTrace()) {
        await context.tracing.start({
          screenshots: true,
          snapshots: true,
          sources: true,
        });
      }

      const page = await context.newPage();

      // Execute test code
      const testFunction = this.compileTest(test.code);
      const testContext = this.createTestContext(page, testRun.id, result);

      try {
        await testFunction(testContext);
        result.status = "passed";
      } catch (error) {
        result.status = "failed";
        result.errorMessage = error instanceof Error ? error.message : String(error);
        result.errorStack = error instanceof Error ? error.stack : undefined;

        // Capture failure screenshot
        const screenshot = await page.screenshot({ fullPage: true });
        const artifact = await this.artifactManager.saveScreenshot(
          testRun.id,
          screenshot,
          "failure.png",
          "Test failure"
        );
        result.artifacts.screenshots.push(artifact.id);
      }

      // Stop tracing and save
      if (this.shouldTrace()) {
        const tracePath = `/tmp/talos-trace-${testRun.id}.zip`;
        await context.tracing.stop({ path: tracePath });
        const traceArtifact = await this.artifactManager.saveTrace(testRun.id, tracePath);
        result.artifacts.traces.push(traceArtifact.id);
      }

      // Save video if recorded
      await page.close();
      await context.close();

      if (this.shouldRecordVideo()) {
        // Video is saved when context closes
        const fs = await import("node:fs/promises");
        const videoDir = `/tmp/talos-videos-${testRun.id}`;
        try {
          const files = await fs.readdir(videoDir);
          for (const file of files) {
            if (file.endsWith(".webm")) {
              const videoArtifact = await this.artifactManager.saveVideo(
                testRun.id,
                `${videoDir}/${file}`
              );
              result.artifacts.videos.push(videoArtifact.id);
            }
          }
        } catch {
          // Video directory may not exist
        }
      }

      await browserInstance.close();
    } catch (error) {
      result.status = "failed";
      result.errorMessage = error instanceof Error ? error.message : String(error);
      result.errorStack = error instanceof Error ? error.stack : undefined;
    }

    result.durationMs = Date.now() - startTime;

    // Update run record
    this.repository.updateTestRun(testRun.id, {
      status: result.status,
      durationMs: result.durationMs,
      errorMessage: result.errorMessage,
      errorStack: result.errorStack,
      completedAt: new Date(),
    });

    return result;
  }

  /**
   * Execute test with retries.
   */
  async executeWithRetries(
    test: TalosTest,
    testRun: TalosTestRun,
    options: ExecutionOptions = {}
  ): Promise<TestExecutionResult> {
    const maxRetries = options.retries ?? this.config.retries;
    let lastResult: TestExecutionResult | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // Update retry attempt
      this.repository.updateTestRun(testRun.id, {
        retryAttempt: attempt,
      });

      lastResult = await this.executeTest(test, testRun, options);

      if (lastResult.status === "passed") {
        return lastResult;
      }

      // Only retry on failure, not on other statuses
      if (lastResult.status !== "failed") {
        return lastResult;
      }
    }

    return lastResult!;
  }

  /**
   * Compile test code into an executable function.
   */
  private compileTest(code: string): (ctx: TestContext) => Promise<void> {
    // Create a function from the test code
    // The code should export a default async function
    const wrappedCode = `
      return async function(ctx) {
        const { page, expect, test } = ctx;
        ${code}
      }
    `;

    try {
      const fn = new Function(wrappedCode);
      return fn();
    } catch (error) {
      throw new Error(`Failed to compile test code: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create test execution context.
   */
  private createTestContext(
    page: PlaywrightPage,
    testRunId: string,
    result: TestExecutionResult
  ): TestContext {
    return {
      page,
      expect: createExpect(),
      test: {
        step: async (name: string, fn: () => Promise<void>) => {
          try {
            await fn();
          } catch (error) {
            // Capture screenshot on step failure
            const screenshot = await page.screenshot();
            const artifact = await this.artifactManager.saveScreenshot(
              testRunId,
              screenshot,
              `step-${name.replace(/\s+/g, "-")}.png`,
              name
            );
            result.artifacts.screenshots.push(artifact.id);
            throw error;
          }
        },
      },
    };
  }

  private shouldTrace(): boolean {
    return this.config.traceMode !== "off";
  }

  private shouldRecordVideo(): boolean {
    return this.config.video !== "off";
  }
}

// ── Test Context Types ────────────────────────────────────────────────────────

interface PlaywrightPage {
  goto(url: string, options?: { timeout?: number }): Promise<unknown>;
  click(selector: string, options?: { timeout?: number }): Promise<void>;
  fill(selector: string, value: string): Promise<void>;
  type(selector: string, text: string, options?: { delay?: number }): Promise<void>;
  waitForSelector(selector: string, options?: { timeout?: number; state?: string }): Promise<unknown>;
  waitForURL(url: string | RegExp, options?: { timeout?: number }): Promise<void>;
  screenshot(options?: { path?: string; fullPage?: boolean }): Promise<Buffer>;
  locator(selector: string): PlaywrightLocator;
  getByRole(role: string, options?: { name?: string | RegExp }): PlaywrightLocator;
  getByText(text: string | RegExp): PlaywrightLocator;
  getByTestId(testId: string): PlaywrightLocator;
  close(): Promise<void>;
}

interface PlaywrightLocator {
  click(options?: { timeout?: number }): Promise<void>;
  fill(value: string): Promise<void>;
  isVisible(): Promise<boolean>;
  textContent(): Promise<string | null>;
  getAttribute(name: string): Promise<string | null>;
}

interface TestContext {
  page: PlaywrightPage;
  expect: ExpectFunction;
  test: {
    step: (name: string, fn: () => Promise<void>) => Promise<void>;
  };
}

type ExpectFunction = (actual: unknown) => Matchers;

interface Matchers {
  toBe(expected: unknown): void;
  toEqual(expected: unknown): void;
  toBeTruthy(): void;
  toBeFalsy(): void;
  toContain(expected: unknown): void;
  toBeGreaterThan(expected: number): void;
  toBeLessThan(expected: number): void;
  toMatch(expected: string | RegExp): void;
  not: Matchers;
}

function createExpect(): ExpectFunction {
  return (actual: unknown) => {
    const matchers: Matchers = {
      toBe(expected: unknown) {
        if (actual !== expected) {
          throw new Error(`Expected ${actual} to be ${expected}`);
        }
      },
      toEqual(expected: unknown) {
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
          throw new Error(`Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`);
        }
      },
      toBeTruthy() {
        if (!actual) {
          throw new Error(`Expected ${actual} to be truthy`);
        }
      },
      toBeFalsy() {
        if (actual) {
          throw new Error(`Expected ${actual} to be falsy`);
        }
      },
      toContain(expected: unknown) {
        if (typeof actual === "string" && typeof expected === "string") {
          if (!actual.includes(expected)) {
            throw new Error(`Expected "${actual}" to contain "${expected}"`);
          }
        } else if (Array.isArray(actual)) {
          if (!actual.includes(expected)) {
            throw new Error(`Expected array to contain ${expected}`);
          }
        }
      },
      toBeGreaterThan(expected: number) {
        if (typeof actual !== "number" || actual <= expected) {
          throw new Error(`Expected ${actual} to be greater than ${expected}`);
        }
      },
      toBeLessThan(expected: number) {
        if (typeof actual !== "number" || actual >= expected) {
          throw new Error(`Expected ${actual} to be less than ${expected}`);
        }
      },
      toMatch(expected: string | RegExp) {
        const regex = typeof expected === "string" ? new RegExp(expected) : expected;
        if (typeof actual !== "string" || !regex.test(actual)) {
          throw new Error(`Expected "${actual}" to match ${expected}`);
        }
      },
      get not() {
        return createNegatedMatchers(actual);
      },
    };
    return matchers;
  };
}

function createNegatedMatchers(actual: unknown): Matchers {
  const negated: Matchers = {
    toBe(expected: unknown) {
      if (actual === expected) {
        throw new Error(`Expected ${actual} not to be ${expected}`);
      }
    },
    toEqual(expected: unknown) {
      if (JSON.stringify(actual) === JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(actual)} not to equal ${JSON.stringify(expected)}`);
      }
    },
    toBeTruthy() {
      if (actual) {
        throw new Error(`Expected ${actual} not to be truthy`);
      }
    },
    toBeFalsy() {
      if (!actual) {
        throw new Error(`Expected ${actual} not to be falsy`);
      }
    },
    toContain(expected: unknown) {
      if (typeof actual === "string" && typeof expected === "string") {
        if (actual.includes(expected)) {
          throw new Error(`Expected "${actual}" not to contain "${expected}"`);
        }
      } else if (Array.isArray(actual)) {
        if (actual.includes(expected)) {
          throw new Error(`Expected array not to contain ${expected}`);
        }
      }
    },
    toBeGreaterThan(expected: number) {
      if (typeof actual === "number" && actual > expected) {
        throw new Error(`Expected ${actual} not to be greater than ${expected}`);
      }
    },
    toBeLessThan(expected: number) {
      if (typeof actual === "number" && actual < expected) {
        throw new Error(`Expected ${actual} not to be less than ${expected}`);
      }
    },
    toMatch(expected: string | RegExp) {
      const regex = typeof expected === "string" ? new RegExp(expected) : expected;
      if (typeof actual === "string" && regex.test(actual)) {
        throw new Error(`Expected "${actual}" not to match ${expected}`);
      }
    },
    get not() {
      return createExpect()(actual);
    },
  };
  return negated;
}
