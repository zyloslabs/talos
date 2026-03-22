/**
 * Fix Generator
 *
 * Generates code fixes for failed tests using AI.
 */

import type { TalosTest, TalosTestRun } from "../types.js";
import type { TalosRepository } from "../repository.js";
import type { FailureAnalysis, SuggestedFix } from "./failure-analyzer.js";
import type { CodeValidator } from "../generator/code-validator.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type FixGeneratorOptions = {
  repository: TalosRepository;
  codeValidator: CodeValidator;
  /** Function to call the LLM for fix generation */
  generateWithLLM: (systemPrompt: string, userPrompt: string) => Promise<string>;
};

export type GeneratedFix = {
  originalCode: string;
  fixedCode: string;
  changeDescription: string;
  diff: string;
  confidence: number;
  suggestedFix: SuggestedFix;
};

export type FixGenerationResult = {
  success: boolean;
  fixes: GeneratedFix[];
  selectedFix?: GeneratedFix;
  error?: string;
};

// ── System Prompts ────────────────────────────────────────────────────────────

const FIX_SYSTEM_PROMPT = `You are an expert Playwright test automation engineer specializing in fixing flaky and broken tests.

Your task is to analyze the failing test code and the error, then provide a minimal fix that:
1. Addresses the root cause identified in the analysis
2. Maintains the original test intent
3. Follows Playwright best practices
4. Is backwards compatible when possible

Guidelines:
- Prefer getByRole, getByTestId over CSS selectors
- Add appropriate waits for dynamic content
- Use more specific selectors when ambiguous
- Keep changes minimal and focused

Output format: Return ONLY the fixed code wrapped in a typescript code block.`;

const SELECTOR_FIX_PROMPT = `The following test is failing because a selector no longer matches.

## Original Test Code:
\`\`\`typescript
{{CODE}}
\`\`\`

## Error:
{{ERROR}}

## Affected Selector:
{{SELECTOR}}

## Analysis:
{{ANALYSIS}}

Suggest a fix for the selector. Consider:
1. The element may have changed class/id
2. The element may need a data-testid
3. A more robust locator strategy might be needed

Return the fixed code.`;

const TIMEOUT_FIX_PROMPT = `The following test is failing due to a timeout.

## Original Test Code:
\`\`\`typescript
{{CODE}}
\`\`\`

## Error:
{{ERROR}}

## Analysis:
{{ANALYSIS}}

Suggest a fix that:
1. Adds appropriate waits
2. Increases timeout if needed
3. Uses waitForSelector or expect conditions instead of hard waits

Return the fixed code.`;

const ASSERTION_FIX_PROMPT = `The following test assertion is failing.

## Original Test Code:
\`\`\`typescript
{{CODE}}
\`\`\`

## Error:
{{ERROR}}

## Expected vs Received:
Expected: {{EXPECTED}}
Received: {{RECEIVED}}

## Analysis:
{{ANALYSIS}}

If this appears to be an intentional application change, update the assertion.
If this appears to be a bug, note it but still provide a fix suggestion.

Return the fixed code.`;

// ── Fix Generator ─────────────────────────────────────────────────────────────

export class FixGenerator {
  private repository: TalosRepository;
  private codeValidator: CodeValidator;
  private generateWithLLM: (systemPrompt: string, userPrompt: string) => Promise<string>;

  constructor(options: FixGeneratorOptions) {
    this.repository = options.repository;
    this.codeValidator = options.codeValidator;
    this.generateWithLLM = options.generateWithLLM;
  }

  /**
   * Generate fixes for a failed test based on analysis.
   */
  async generateFixes(
    test: TalosTest,
    testRun: TalosTestRun,
    analysis: FailureAnalysis
  ): Promise<FixGenerationResult> {
    const fixes: GeneratedFix[] = [];

    // Try each suggested fix
    for (const suggestedFix of analysis.suggestedFixes) {
      if (suggestedFix.type === "manual-review") {
        // Skip manual review suggestions
        continue;
      }

      try {
        const fix = await this.generateSingleFix(test, testRun, analysis, suggestedFix);
        if (fix) {
          // Validate the fix
          const validation = this.codeValidator.validate(fix.fixedCode);
          if (validation.isValid) {
            fixes.push(fix);
          }
        }
      } catch (error) {
        // Continue with other fixes
        console.error(`Failed to generate fix for ${suggestedFix.type}:`, error);
      }
    }

    if (fixes.length === 0) {
      return {
        success: false,
        fixes: [],
        error: "No valid fixes could be generated",
      };
    }

    // Select the best fix based on confidence
    const selectedFix = fixes.reduce((best, current) =>
      current.confidence > best.confidence ? current : best
    );

    return {
      success: true,
      fixes,
      selectedFix,
    };
  }

  /**
   * Generate a single fix for a suggested fix type.
   */
  private async generateSingleFix(
    test: TalosTest,
    testRun: TalosTestRun,
    analysis: FailureAnalysis,
    suggestedFix: SuggestedFix
  ): Promise<GeneratedFix | null> {
    let userPrompt: string;

    switch (suggestedFix.type) {
      case "update-selector":
        userPrompt = SELECTOR_FIX_PROMPT
          .replace("{{CODE}}", test.code)
          .replace("{{ERROR}}", testRun.errorMessage ?? "")
          .replace("{{SELECTOR}}", analysis.affectedElements[0]?.selector ?? "unknown")
          .replace("{{ANALYSIS}}", analysis.rootCause);
        break;

      case "add-wait":
        userPrompt = TIMEOUT_FIX_PROMPT
          .replace("{{CODE}}", test.code)
          .replace("{{ERROR}}", testRun.errorMessage ?? "")
          .replace("{{ANALYSIS}}", analysis.rootCause);
        break;

      case "update-assertion":
        userPrompt = ASSERTION_FIX_PROMPT
          .replace("{{CODE}}", test.code)
          .replace("{{ERROR}}", testRun.errorMessage ?? "")
          .replace("{{EXPECTED}}", String(analysis.metadata?.expected ?? "unknown"))
          .replace("{{RECEIVED}}", String(analysis.metadata?.received ?? "unknown"))
          .replace("{{ANALYSIS}}", analysis.rootCause);
        break;

      case "add-retry":
        userPrompt = `The following test is failing intermittently.

## Original Test Code:
\`\`\`typescript
${test.code}
\`\`\`

## Error:
${testRun.errorMessage ?? ""}

Add retry logic to handle transient failures. Use test.step with retry or add explicit retry loops.

Return the fixed code.`;
        break;

      case "update-logic":
        userPrompt = `The following test needs logic updates.

## Original Test Code:
\`\`\`typescript
${test.code}
\`\`\`

## Error:
${testRun.errorMessage ?? ""}

## Analysis:
${analysis.rootCause}

Update the test logic to handle the current application behavior.

Return the fixed code.`;
        break;

      default:
        return null;
    }

    const response = await this.generateWithLLM(FIX_SYSTEM_PROMPT, userPrompt);
    const fixedCode = this.extractCode(response);

    if (!fixedCode || fixedCode === test.code) {
      return null;
    }

    const diff = this.generateDiff(test.code, fixedCode);

    return {
      originalCode: test.code,
      fixedCode,
      changeDescription: suggestedFix.description,
      diff,
      confidence: suggestedFix.confidence,
      suggestedFix,
    };
  }

  /**
   * Apply a fix to a test.
   */
  async applyFix(testId: string, fix: GeneratedFix): Promise<TalosTest | null> {
    const test = this.repository.getTest(testId);
    if (!test) return null;

    // Update test with fixed code
    const updatedTest = this.repository.updateTest(testId, {
      code: fix.fixedCode,
      updatedAt: new Date(),
      metadata: {
        ...test.metadata,
        healedAt: new Date().toISOString(),
        healingFix: fix.changeDescription,
        originalCode: fix.originalCode,
      },
    });

    return updatedTest;
  }

  /**
   * Extract code from LLM response.
   */
  private extractCode(response: string): string {
    const codeBlockMatch = response.match(/```(?:typescript|javascript|ts|js)?\n([\s\S]*?)```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }
    return response.trim();
  }

  /**
   * Generate a simple diff between two code strings.
   */
  private generateDiff(original: string, modified: string): string {
    const originalLines = original.split("\n");
    const modifiedLines = modified.split("\n");

    const diff: string[] = [];
    const maxLines = Math.max(originalLines.length, modifiedLines.length);

    for (let i = 0; i < maxLines; i++) {
      const origLine = originalLines[i];
      const modLine = modifiedLines[i];

      if (origLine === undefined) {
        diff.push(`+ ${modLine}`);
      } else if (modLine === undefined) {
        diff.push(`- ${origLine}`);
      } else if (origLine !== modLine) {
        diff.push(`- ${origLine}`);
        diff.push(`+ ${modLine}`);
      } else {
        diff.push(`  ${origLine}`);
      }
    }

    return diff.join("\n");
  }
}
