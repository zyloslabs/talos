/**
 * Failure Analyzer Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { FailureAnalyzer } from "./failure-analyzer.js";
import { TalosRepository } from "../repository.js";
import type { TalosTestRun } from "../types.js";

describe("FailureAnalyzer", () => {
  let db: Database.Database;
  let repo: TalosRepository;
  let analyzer: FailureAnalyzer;
  let appId: string;
  let testId: string;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    repo = new TalosRepository(db);
    repo.migrate();
    analyzer = new FailureAnalyzer(repo);

    const app = repo.createApplication({ name: "Test App" });
    appId = app.id;
    const test = repo.createTest({
      applicationId: appId,
      name: "Test",
      code: "await page.click('#btn');",
      type: "e2e",
    });
    testId = test.id;
  });

  function createFailedRun(errorMessage: string, errorStack = ""): TalosTestRun {
    const run = repo.createTestRun({ testId, triggeredBy: "test" });
    return repo.updateTestRun(run.id, {
      status: "failed",
      errorMessage,
      errorStack,
    })!;
  }

  describe("analyze", () => {
    it("should categorize timeout errors", async () => {
      const run = createFailedRun(
        "locator.click: Timeout 30000ms exceeded.",
        "locator('#submit-btn')"
      );

      const analysis = await analyzer.analyze(run);

      expect(analysis.category).toBe("timeout");
      expect(analysis.rootCause).toContain("timeout");
      expect(analysis.suggestedFixes.length).toBeGreaterThan(0);
    });

    it("should categorize strict mode violations", async () => {
      const run = createFailedRun(
        "strict mode violation: locator resolved to 3 elements",
        "locator('.button')"
      );

      const analysis = await analyzer.analyze(run);

      expect(analysis.category).toBe("selector-changed");
      expect(analysis.suggestedFixes.some((f) => f.type === "update-selector")).toBe(true);
    });

    it("should categorize assertion failures", async () => {
      const run = createFailedRun(
        "Error: expect(received).toBe(expected)\nExpected: 'Dashboard'\nReceived: 'Login'"
      );

      const analysis = await analyzer.analyze(run);

      expect(analysis.category).toBe("assertion-failed");
      expect(analysis.metadata?.expected).toContain("Dashboard");
      expect(analysis.metadata?.received).toContain("Login");
    });

    it("should categorize network errors", async () => {
      const run = createFailedRun("net::ERR_CONNECTION_REFUSED");

      const analysis = await analyzer.analyze(run);

      expect(analysis.category).toBe("network-error");
      expect(analysis.suggestedFixes.some((f) => f.type === "add-retry")).toBe(true);
    });

    it("should categorize authentication errors", async () => {
      const run = createFailedRun("401 Unauthorized");

      const analysis = await analyzer.analyze(run);

      expect(analysis.category).toBe("authentication-error");
      expect(analysis.suggestedFixes.some((f) => f.type === "manual-review")).toBe(true);
    });

    it("should categorize navigation errors", async () => {
      const run = createFailedRun(
        "navigation failed: page.goto('https://example.com') failed"
      );

      const analysis = await analyzer.analyze(run);

      expect(analysis.category).toBe("navigation-error");
    });

    it("should return unknown for unrecognized errors", async () => {
      const run = createFailedRun("Some random error that doesn't match");

      const analysis = await analyzer.analyze(run);

      expect(analysis.category).toBe("unknown");
      expect(analysis.confidence).toBeLessThan(0.5);
    });

    it("should extract selectors from error stack", async () => {
      const run = createFailedRun(
        "Timeout",
        `at locator('#myButton')
         at getByRole('button', { name: 'Submit' })
         at getByTestId('login-form')`
      );

      const analysis = await analyzer.analyze(run);

      expect(analysis.affectedElements.length).toBeGreaterThan(0);
      expect(analysis.affectedElements.some((e) => e.selector.includes("myButton"))).toBe(
        true
      );
    });

    it("should throw for non-failed runs", async () => {
      const run = repo.createTestRun({ testId, triggeredBy: "test" });
      repo.updateTestRun(run.id, { status: "passed" });

      await expect(analyzer.analyze(run)).rejects.toThrow();
    });
  });

  describe("getFailureStats", () => {
    it("should return failure statistics", () => {
      // Create some failed runs
      createFailedRun("Timeout 30000ms exceeded");
      createFailedRun("Timeout 30000ms exceeded");
      createFailedRun("401 Unauthorized");

      const stats = analyzer.getFailureStats(appId);

      expect(stats.totalFailures).toBe(3);
      expect(stats.byCategory.timeout).toBe(2);
      expect(stats.byCategory["authentication-error"]).toBe(1);
    });

    it("should return common selectors", () => {
      createFailedRun("Error", "locator('#submit')");
      createFailedRun("Error", "locator('#submit')");
      createFailedRun("Error", "locator('#cancel')");

      const stats = analyzer.getFailureStats(appId);

      expect(stats.commonSelectors.length).toBeGreaterThan(0);
      expect(stats.commonSelectors[0].selector).toBe("#submit");
      expect(stats.commonSelectors[0].count).toBe(2);
    });

    it("should return zeros for application with no failures", () => {
      const app = repo.createApplication({ name: "Clean App" });

      const stats = analyzer.getFailureStats(app.id);

      expect(stats.totalFailures).toBe(0);
      expect(Object.values(stats.byCategory).every((v) => v === 0)).toBe(true);
    });
  });
});
