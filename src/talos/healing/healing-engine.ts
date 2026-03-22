/**
 * Healing Engine
 *
 * Orchestrates the self-healing process for failed tests.
 */

import type { TalosTest, TalosTestRun, HealingAttempt, HealingStatus } from "../types.js";
import type { TalosRepository } from "../repository.js";
import type { HealingConfig } from "../config.js";
import { FailureAnalyzer, type FailureAnalysis } from "./failure-analyzer.js";
import { FixGenerator, type FixGenerationResult } from "./fix-generator.js";
import { CodeValidator } from "../generator/code-validator.js";
import { PlaywrightRunner } from "../runner/playwright-runner.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type HealingEngineOptions = {
  config: HealingConfig;
  repository: TalosRepository;
  playwrightRunner: PlaywrightRunner;
  /** Function to call the LLM for fix generation */
  generateWithLLM: (systemPrompt: string, userPrompt: string) => Promise<string>;
};

export type HealingResult = {
  success: boolean;
  attempt: HealingAttempt;
  analysis?: FailureAnalysis;
  fixResult?: FixGenerationResult;
  verificationRun?: TalosTestRun;
  error?: string;
};

// ── Healing Engine ────────────────────────────────────────────────────────────

export class HealingEngine {
  private config: HealingConfig;
  private repository: TalosRepository;
  private failureAnalyzer: FailureAnalyzer;
  private fixGenerator: FixGenerator;
  private playwrightRunner: PlaywrightRunner;
  private codeValidator: CodeValidator;

  // Track healing attempts to prevent infinite loops
  private healingInProgress = new Set<string>();

  constructor(options: HealingEngineOptions) {
    this.config = options.config;
    this.repository = options.repository;
    this.playwrightRunner = options.playwrightRunner;
    this.codeValidator = new CodeValidator();
    
    this.failureAnalyzer = new FailureAnalyzer(options.repository);
    this.fixGenerator = new FixGenerator({
      repository: options.repository,
      codeValidator: this.codeValidator,
      generateWithLLM: options.generateWithLLM,
    });
  }

  /**
   * Attempt to heal a failed test.
   */
  async heal(testRun: TalosTestRun): Promise<HealingResult> {
    const test = this.repository.getTest(testRun.testId);
    if (!test) {
      return this.createFailedResult(testRun.id, "Test not found");
    }

    // Check if already healing
    if (this.healingInProgress.has(test.id)) {
      return this.createFailedResult(testRun.id, "Healing already in progress for this test");
    }

    // Check if healing is enabled
    if (!this.config.enabled) {
      return this.createFailedResult(testRun.id, "Self-healing is disabled");
    }

    // Check max attempts
    const recentAttempts = this.getRecentHealingAttempts(test.id);
    if (recentAttempts.length >= this.config.maxRetries) {
      return this.createFailedResult(
        testRun.id,
        `Max healing attempts (${this.config.maxRetries}) reached`
      );
    }

    // Check cooldown
    if (recentAttempts.length > 0) {
      const lastAttempt = recentAttempts[0];
      const cooldownMs = this.config.cooldownMs;
      const timeSinceLastAttempt = Date.now() - lastAttempt.timestamp.getTime();
      
      if (timeSinceLastAttempt < cooldownMs) {
        return this.createFailedResult(
          testRun.id,
          `Cooldown period not elapsed. Wait ${Math.ceil((cooldownMs - timeSinceLastAttempt) / 60000)} minutes.`
        );
      }
    }

    // Start healing
    this.healingInProgress.add(test.id);
    const attempt = this.createHealingAttempt(testRun.id, test.id);

    try {
      // Step 1: Analyze the failure
      const analysis = await this.failureAnalyzer.analyze(testRun);
      attempt.analysis = analysis;

      // Step 2: Generate fixes
      const fixResult = await this.fixGenerator.generateFixes(test, testRun, analysis);
      attempt.fixes = fixResult.fixes;

      if (!fixResult.success || !fixResult.selectedFix) {
        attempt.status = "failed";
        attempt.error = fixResult.error ?? "No valid fix generated";
        return {
          success: false,
          attempt,
          analysis,
          fixResult,
          error: attempt.error,
        };
      }

      // Step 3: Apply the fix temporarily for verification
      void test.code; // Keep original code reference for potential rollback
      const fixedCode = fixResult.selectedFix.fixedCode;

      // Step 4: Run verification test
      const verificationRun = await this.runVerification(test, fixedCode);
      attempt.verificationRunId = verificationRun.id;

      if (verificationRun.status === "passed") {
        // Success! Apply the fix permanently
        await this.fixGenerator.applyFix(test.id, fixResult.selectedFix);
        attempt.status = "succeeded";
        attempt.appliedFix = fixResult.selectedFix;

        return {
          success: true,
          attempt,
          analysis,
          fixResult,
          verificationRun,
        };
      } else {
        // Fix didn't work
        attempt.status = "failed";
        attempt.error = "Verification failed after applying fix";

        // Restore original code (already unchanged since we used temp code for verification)
        return {
          success: false,
          attempt,
          analysis,
          fixResult,
          verificationRun,
          error: attempt.error,
        };
      }
    } catch (error) {
      attempt.status = "failed";
      attempt.error = error instanceof Error ? error.message : String(error);

      return {
        success: false,
        attempt,
        error: attempt.error,
      };
    } finally {
      this.healingInProgress.delete(test.id);
    }
  }

  /**
   * Auto-heal mode: check all recent failures and attempt healing.
   */
  async autoHeal(applicationId: string): Promise<HealingResult[]> {
    if (!this.config.enabled) {
      return [];
    }

    const tests = this.repository.getTestsByApplication(applicationId);
    const results: HealingResult[] = [];

    for (const test of tests) {
      // Get most recent run
      const runs = this.repository.getTestRunsByTest(test.id, 1);
      const latestRun = runs[0];

      if (latestRun?.status === "failed") {
        const result = await this.heal(latestRun);
        results.push(result);

        // Rate limit between tests
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  /**
   * Get healing statistics for an application.
   */
  getHealingStats(applicationId: string): {
    totalAttempts: number;
    successfulHeals: number;
    failedHeals: number;
    successRate: number;
    commonFixes: Array<{ type: string; count: number }>;
  } {
    const tests = this.repository.getTestsByApplication(applicationId);
    let totalAttempts = 0;
    let successfulHeals = 0;
    let failedHeals = 0;
    const fixTypeCounts = new Map<string, number>();

    for (const test of tests) {
      const attempts = this.getHealingAttemptsFromMetadata(test);
      totalAttempts += attempts.length;

      for (const attempt of attempts) {
        if (attempt.status === "succeeded") {
          successfulHeals++;
          const appliedFix = attempt.appliedFix as { suggestedFix?: { type?: string } } | null;
          if (appliedFix?.suggestedFix?.type) {
            const type = appliedFix.suggestedFix.type;
            fixTypeCounts.set(type, (fixTypeCounts.get(type) ?? 0) + 1);
          }
        } else if (attempt.status === "failed") {
          failedHeals++;
        }
      }
    }

    const commonFixes = Array.from(fixTypeCounts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);

    return {
      totalAttempts,
      successfulHeals,
      failedHeals,
      successRate: totalAttempts > 0 ? successfulHeals / totalAttempts : 0,
      commonFixes,
    };
  }

  /**
   * Run a verification test with potential fixed code.
   */
  private async runVerification(
    test: TalosTest,
    fixedCode: string
  ): Promise<TalosTestRun> {
    // Create a temporary test with the fixed code
    const tempTest: TalosTest = {
      ...test,
      code: fixedCode,
    };

    // Create a test run
    const testRun = this.repository.createTestRun({
      applicationId: test.applicationId,
      testId: test.id,
      trigger: "healing",
      triggeredBy: "healing-verification",
      environment: "healing",
    });

    // Execute the test
    await this.playwrightRunner.executeTest(tempTest, testRun);

    // Return the updated run
    return this.repository.getTestRun(testRun.id)!;
  }

  /**
   * Create a healing attempt record.
   */
  private createHealingAttempt(
    testRunId: string,
    testId: string,
    errorMessage = ""
  ): HealingAttempt {
    return {
      id: `heal-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      testRunId,
      testId,
      timestamp: new Date(),
      status: "in-progress",
      originalError: errorMessage,
      analysis: null,
      proposedFix: null,
      confidence: null,
      autoApplied: false,
      humanApproved: null,
      healingResult: null,
      fixes: [],
      appliedFix: null,
      verificationRunId: null,
      error: null,
      createdAt: new Date(),
      completedAt: null,
    };
  }

  /**
   * Create a failed result without attempting healing.
   */
  private createFailedResult(testRunId: string, error: string): HealingResult {
    return {
      success: false,
      attempt: {
        id: `heal-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        testRunId,
        testId: "",
        timestamp: new Date(),
        status: "failed",
        originalError: error,
        analysis: null,
        proposedFix: null,
        confidence: null,
        autoApplied: false,
        humanApproved: null,
        healingResult: null,
        fixes: [],
        appliedFix: null,
        verificationRunId: null,
        error,
        createdAt: new Date(),
        completedAt: new Date(),
      },
      error,
    };
  }

  /**
   * Get recent healing attempts for a test.
   */
  private getRecentHealingAttempts(testId: string): HealingAttempt[] {
    const test = this.repository.getTest(testId);
    if (!test) return [];

    return this.getHealingAttemptsFromMetadata(test)
      .filter(attempt => {
        const hourAgo = Date.now() - 60 * 60 * 1000;
        return attempt.timestamp.getTime() > hourAgo;
      })
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Extract healing attempts from test metadata.
   */
  private getHealingAttemptsFromMetadata(test: TalosTest): HealingAttempt[] {
    const metadata = test.metadata as Record<string, unknown> | undefined;
    if (!metadata?.healingAttempts) return [];

    const attempts = metadata.healingAttempts as Array<Record<string, unknown>>;
    return attempts.map(a => ({
      id: String(a.id),
      testRunId: String(a.testRunId),
      testId: test.id,
      timestamp: new Date(String(a.timestamp)),
      status: a.status as HealingStatus,
      originalError: (a.originalError as string) ?? "",
      analysis: a.analysis,
      proposedFix: (a.proposedFix as string) ?? null,
      confidence: (a.confidence as number) ?? null,
      autoApplied: Boolean(a.autoApplied),
      humanApproved: a.humanApproved as boolean | null,
      healingResult: (a.healingResult as string) ?? null,
      fixes: (a.fixes as unknown[]) ?? [],
      appliedFix: a.appliedFix,
      verificationRunId: a.verificationRunId as string | null,
      error: a.error as string | null,
      createdAt: a.createdAt ? new Date(String(a.createdAt)) : new Date(String(a.timestamp)),
      completedAt: a.completedAt ? new Date(String(a.completedAt)) : null,
    }));
  }
}
