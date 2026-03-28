/**
 * Failure Analyzer
 *
 * Analyzes test failures to identify root causes and patterns.
 */

import type { TalosTestRun, TalosTestArtifact } from "../types.js";
import type { TalosRepository } from "../repository.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type FailureAnalysis = {
  runId: string;
  category: FailureCategory;
  confidence: number; // 0-1
  rootCause: string;
  affectedElements: AffectedElement[];
  suggestedFixes: SuggestedFix[];
  relatedFailures: string[]; // IDs of similar past failures
  metadata: Record<string, unknown>;
};

export type FailureCategory =
  | "selector-changed"
  | "element-not-found"
  | "timeout"
  | "assertion-failed"
  | "network-error"
  | "authentication-error"
  | "navigation-error"
  | "script-error"
  | "unknown";

export type AffectedElement = {
  selector: string;
  type: "locator" | "assertion" | "action" | "navigation";
  line?: number;
  context?: string;
};

export type SuggestedFix = {
  type: "update-selector" | "add-wait" | "update-assertion" | "add-retry" | "update-logic" | "manual-review";
  description: string;
  oldValue?: string;
  newValue?: string;
  confidence: number;
};

// ── Error Pattern Matchers ────────────────────────────────────────────────────

const ERROR_PATTERNS: Array<{
  pattern: RegExp;
  category: FailureCategory;
  extractDetails: (match: RegExpMatchArray, error: string) => Partial<FailureAnalysis>;
}> = [
  {
    pattern: /locator\..*exceeded.*timeout|waiting for.*timeout|Timeout.*exceeded/i,
    category: "timeout",
    extractDetails: (_match, error) => {
      const selectorMatch = error.match(/locator\(['"]([^'"]+)['"]\)/);
      return {
        rootCause: "Element did not appear within the timeout period",
        affectedElements: selectorMatch ? [{ selector: selectorMatch[1], type: "locator" }] : [],
        suggestedFixes: [
          { type: "add-wait", description: "Add explicit wait before interaction", confidence: 0.7 },
          {
            type: "update-selector",
            description: "Verify selector is correct for current page state",
            confidence: 0.6,
          },
        ],
      };
    },
  },
  {
    pattern: /strict mode violation|resolved to (\d+) elements/i,
    category: "selector-changed",
    extractDetails: (_match, error) => {
      const count = _match[1];
      const selectorMatch = error.match(/locator\(['"]([^'"]+)['"]\)/);
      return {
        rootCause: `Selector matched ${count} elements instead of exactly one`,
        affectedElements: selectorMatch ? [{ selector: selectorMatch[1], type: "locator" }] : [],
        suggestedFixes: [
          { type: "update-selector", description: "Make selector more specific", confidence: 0.8 },
          { type: "update-logic", description: "Use .first() or .nth() if intentional", confidence: 0.5 },
        ],
      };
    },
  },
  {
    pattern: /Error: expect\(.*\)\.(toBe|toEqual|toContain|toMatch)/i,
    category: "assertion-failed",
    extractDetails: (_match, error) => {
      const expectedMatch = error.match(/Expected:.*?([^\n]+)/);
      const receivedMatch = error.match(/Received:.*?([^\n]+)/);
      return {
        rootCause: "Assertion did not match expected value",
        affectedElements: [{ selector: "assertion", type: "assertion" }],
        suggestedFixes: [
          { type: "update-assertion", description: "Update expected value if behavior changed", confidence: 0.6 },
          { type: "manual-review", description: "Verify if this is a bug or expected change", confidence: 0.8 },
        ],
        metadata: {
          expected: expectedMatch?.[1]?.trim(),
          received: receivedMatch?.[1]?.trim(),
        },
      };
    },
  },
  {
    pattern: /net::ERR_|fetch.*failed|NetworkError/i,
    category: "network-error",
    extractDetails: (_match, _error) => ({
      rootCause: "Network request failed",
      affectedElements: [],
      suggestedFixes: [
        { type: "add-retry", description: "Add retry logic for flaky network", confidence: 0.7 },
        { type: "manual-review", description: "Check if API endpoint is correct", confidence: 0.6 },
      ],
    }),
  },
  {
    pattern: /401|403|Unauthorized|Forbidden|login.*failed/i,
    category: "authentication-error",
    extractDetails: (_match, _error) => ({
      rootCause: "Authentication failed",
      affectedElements: [],
      suggestedFixes: [
        { type: "manual-review", description: "Verify credentials are current", confidence: 0.9 },
        { type: "update-logic", description: "Check login flow for changes", confidence: 0.7 },
      ],
    }),
  },
  {
    pattern: /navigation.*failed|page\.goto.*failed/i,
    category: "navigation-error",
    extractDetails: (_match, error) => {
      const urlMatch = error.match(/goto\(['"]([^'"]+)['"]\)/);
      return {
        rootCause: "Page navigation failed",
        affectedElements: urlMatch ? [{ selector: urlMatch[1], type: "navigation" }] : [],
        suggestedFixes: [
          { type: "manual-review", description: "Verify URL is correct and accessible", confidence: 0.8 },
          { type: "add-retry", description: "Add retry for transient failures", confidence: 0.5 },
        ],
      };
    },
  },
];

// ── Failure Analyzer ──────────────────────────────────────────────────────────

export class FailureAnalyzer {
  private repository: TalosRepository;

  constructor(repository: TalosRepository) {
    this.repository = repository;
  }

  /**
   * Analyze a failed test run.
   */
  async analyze(testRun: TalosTestRun): Promise<FailureAnalysis> {
    if (testRun.status !== "failed") {
      throw new Error("Can only analyze failed test runs");
    }

    const errorMessage = testRun.errorMessage ?? "";
    const errorStack = testRun.errorStack ?? "";
    const fullError = `${errorMessage}\n${errorStack}`;

    // Try to match error patterns
    for (const { pattern, category, extractDetails } of ERROR_PATTERNS) {
      const match = fullError.match(pattern);
      if (match) {
        const details = extractDetails(match, fullError);

        // Find related failures
        const relatedFailures = await this.findRelatedFailures(testRun, category);

        return {
          runId: testRun.id,
          category,
          confidence: 0.8,
          rootCause: details.rootCause ?? "Unknown root cause",
          affectedElements: details.affectedElements ?? [],
          suggestedFixes: (details.suggestedFixes ?? []).map((fix) => ({
            ...fix,
            confidence: fix.confidence ?? 0.5,
          })),
          relatedFailures,
          metadata: {
            ...details.metadata,
            errorMessage,
            errorStack,
          },
        };
      }
    }

    // Unknown failure
    return {
      runId: testRun.id,
      category: "unknown",
      confidence: 0.3,
      rootCause: errorMessage || "Unknown error",
      affectedElements: this.extractSelectorsFromStack(errorStack),
      suggestedFixes: [{ type: "manual-review", description: "Manual review required", confidence: 0.9 }],
      relatedFailures: [],
      metadata: { errorMessage, errorStack },
    };
  }

  /**
   * Analyze a trace file for detailed failure information.
   */
  async analyzeTrace(_traceArtifact: TalosTestArtifact): Promise<{
    screenshots: Array<{ timestamp: number; description: string }>;
    actions: Array<{ timestamp: number; action: string; selector?: string }>;
    networkRequests: Array<{ url: string; status: number; duration: number }>;
  }> {
    // This would parse the Playwright trace file
    // For now, return empty structure
    return {
      screenshots: [],
      actions: [],
      networkRequests: [],
    };
  }

  /**
   * Find similar past failures.
   */
  private async findRelatedFailures(testRun: TalosTestRun, category: FailureCategory): Promise<string[]> {
    const test = this.repository.getTest(testRun.testId);
    if (!test) return [];

    // Get recent runs of the same test that failed
    const recentRuns = this.repository.getTestRunsByTest(testRun.testId, 20);
    const failedRuns = recentRuns.filter((run) => run.id !== testRun.id && run.status === "failed");

    // Filter to similar error patterns
    const related: string[] = [];
    for (const run of failedRuns) {
      if (!run.errorMessage) continue;

      // Simple similarity: same category
      for (const { pattern, category: patternCategory } of ERROR_PATTERNS) {
        if (patternCategory === category && pattern.test(run.errorMessage)) {
          related.push(run.id);
          break;
        }
      }
    }

    return related.slice(0, 5); // Limit to 5 related failures
  }

  /**
   * Extract selectors from error stack trace.
   */
  private extractSelectorsFromStack(stack: string): AffectedElement[] {
    const elements: AffectedElement[] = [];

    // Look for locator patterns
    const locatorMatches = stack.matchAll(/locator\(['"]([^'"]+)['"]\)/g);
    for (const match of locatorMatches) {
      elements.push({ selector: match[1], type: "locator" });
    }

    // Look for getByRole patterns
    const roleMatches = stack.matchAll(/getByRole\(['"]([^'"]+)['"],?\s*(?:\{[^}]*name:\s*['"]([^'"]+)['"])?/g);
    for (const match of roleMatches) {
      const selector = match[2] ? `role=${match[1]}[name="${match[2]}"]` : `role=${match[1]}`;
      elements.push({ selector, type: "locator" });
    }

    // Look for getByTestId patterns
    const testIdMatches = stack.matchAll(/getByTestId\(['"]([^'"]+)['"]\)/g);
    for (const match of testIdMatches) {
      elements.push({ selector: `[data-testid="${match[1]}"]`, type: "locator" });
    }

    return elements;
  }

  /**
   * Get failure statistics for an application.
   */
  getFailureStats(applicationId: string): {
    totalFailures: number;
    byCategory: Record<FailureCategory, number>;
    commonSelectors: Array<{ selector: string; count: number }>;
  } {
    const tests = this.repository.getTestsByApplication(applicationId);
    const byCategory: Record<FailureCategory, number> = {
      "selector-changed": 0,
      "element-not-found": 0,
      timeout: 0,
      "assertion-failed": 0,
      "network-error": 0,
      "authentication-error": 0,
      "navigation-error": 0,
      "script-error": 0,
      unknown: 0,
    };

    const selectorCounts = new Map<string, number>();
    let totalFailures = 0;

    for (const test of tests) {
      const runs = this.repository.getTestRunsByTest(test.id, 100);
      for (const run of runs) {
        if (run.status !== "failed") continue;
        totalFailures++;

        // Categorize
        const errorMessage = run.errorMessage ?? "";
        let matched = false;
        for (const { pattern, category } of ERROR_PATTERNS) {
          if (pattern.test(errorMessage)) {
            byCategory[category]++;
            matched = true;
            break;
          }
        }
        if (!matched) {
          byCategory.unknown++;
        }

        // Extract selectors
        const elements = this.extractSelectorsFromStack(run.errorStack ?? "");
        for (const el of elements) {
          selectorCounts.set(el.selector, (selectorCounts.get(el.selector) ?? 0) + 1);
        }
      }
    }

    // Sort selectors by count
    const commonSelectors = Array.from(selectorCounts.entries())
      .map(([selector, count]) => ({ selector, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return { totalFailures, byCategory, commonSelectors };
  }
}
