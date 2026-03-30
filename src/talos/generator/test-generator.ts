/**
 * Test Generator
 *
 * Generates Playwright tests using AI with RAG context.
 */

import type { TalosTest } from "../types.js";
import type { TalosRepository } from "../repository.js";
import type { GeneratorConfig } from "../config.js";
import { PromptBuilder, type GeneratedPrompt } from "./prompt-builder.js";
import { CodeValidator, type ValidationResult } from "./code-validator.js";
import type { RagPipeline } from "../rag/rag-pipeline.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type TestGeneratorOptions = {
  config: GeneratorConfig;
  repository: TalosRepository;
  ragPipeline: RagPipeline;
  /** Function to call the LLM for generation */
  generateWithLLM: (systemPrompt: string, userPrompt: string) => Promise<string>;
};

export type GenerateTestInput = {
  applicationId: string;
  request: string;
  name?: string;
  tags?: string[];
  framework?: "playwright" | "cypress" | "puppeteer";
  style?: "bdd" | "tdd" | "pom";
  maxRetries?: number;
};

export type GenerationResult = {
  success: boolean;
  test?: TalosTest;
  code?: string;
  validation?: ValidationResult;
  prompt?: GeneratedPrompt;
  error?: string;
  attempts: number;
};

// ── Test Generator ────────────────────────────────────────────────────────────

export class TestGenerator {
  private config: GeneratorConfig;
  private repository: TalosRepository;
  private promptBuilder: PromptBuilder;
  private codeValidator: CodeValidator;
  private generateWithLLM: (systemPrompt: string, userPrompt: string) => Promise<string>;

  constructor(options: TestGeneratorOptions) {
    this.config = options.config;
    this.repository = options.repository;
    this.promptBuilder = new PromptBuilder(options.ragPipeline);
    this.codeValidator = new CodeValidator();
    this.generateWithLLM = options.generateWithLLM;
  }

  /**
   * Generate a new test based on the request.
   */
  async generate(input: GenerateTestInput): Promise<GenerationResult> {
    const maxRetries = input.maxRetries ?? 3; // Default retries
    let attempts = 0;
    let lastError: string | undefined;
    let lastValidation: ValidationResult | undefined;
    let lastCode: string | undefined;
    let lastPrompt: GeneratedPrompt | undefined;

    // Get application
    const application = this.repository.getApplication(input.applicationId);
    if (!application) {
      return {
        success: false,
        error: `Application not found: ${input.applicationId}`,
        attempts: 0,
      };
    }

    // Get existing tests for context
    const existingTests = this.repository.getTestsByApplication(input.applicationId);

    // Get relevant code from RAG
    const relevantCode = await this.promptBuilder.getRelevantCode(
      input.applicationId,
      input.request,
      this.config.maxContextChunks
    );

    // Get intelligence report if available (#429)
    const intelligence = this.repository.getIntelligenceReport(input.applicationId) ?? undefined;

    while (attempts <= maxRetries) {
      attempts++;

      try {
        // Build prompt
        const prompt = await this.promptBuilder.buildPrompt({
          application,
          existingTests,
          relevantCode,
          intelligence,
          userRequest: input.request,
          framework: input.framework,
          style: input.style,
        });
        lastPrompt = prompt;

        // Add validation feedback if this is a retry
        let userPrompt = prompt.userPrompt;
        if (attempts > 1 && lastValidation) {
          userPrompt = this.addValidationFeedback(userPrompt, lastValidation);
        }

        // Generate code
        const generatedCode = await this.generateWithLLM(prompt.systemPrompt, userPrompt);
        lastCode = this.extractCode(generatedCode);

        // Validate code
        const validation = this.codeValidator.validate(lastCode);
        lastValidation = validation;

        if (validation.isValid) {
          // Auto-fix minor issues
          const { code: fixedCode } = this.codeValidator.autoFix(lastCode);

          // Create test record
          const test = this.repository.createTest({
            applicationId: input.applicationId,
            name: input.name ?? this.generateTestName(input.request),
            code: fixedCode,
            type: "e2e",
            tags: input.tags,
            metadata: {
              generatedAt: new Date().toISOString(),
              generatedFrom: input.request,
              framework: input.framework ?? "playwright",
              style: input.style ?? "pom",
              attempts,
            },
          });

          return {
            success: true,
            test,
            code: fixedCode,
            validation,
            prompt,
            attempts,
          };
        }

        // If errors but no retries left, fail
        if (attempts > maxRetries) {
          return {
            success: false,
            code: lastCode,
            validation,
            prompt,
            error: `Validation failed after ${attempts} attempts: ${validation.errors.map((e) => e.message).join(", ")}`,
            attempts,
          };
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);

        if (attempts > maxRetries) {
          return {
            success: false,
            code: lastCode,
            validation: lastValidation,
            prompt: lastPrompt,
            error: lastError,
            attempts,
          };
        }
      }
    }

    return {
      success: false,
      code: lastCode,
      validation: lastValidation,
      prompt: lastPrompt,
      error: lastError ?? "Unknown error",
      attempts,
    };
  }

  /**
   * Enhance an existing test.
   */
  async enhance(testId: string, request: string): Promise<GenerationResult> {
    const test = this.repository.getTest(testId);
    if (!test) {
      return {
        success: false,
        error: `Test not found: ${testId}`,
        attempts: 0,
      };
    }

    // Get relevant code
    const relevantCode = await this.promptBuilder.getRelevantCode(
      test.applicationId,
      request,
      this.config.maxContextChunks
    );

    // Build enhancement prompt
    const prompt = await this.promptBuilder.buildEnhancementPrompt(test, request, relevantCode);

    try {
      const generatedCode = await this.generateWithLLM(prompt.systemPrompt, prompt.userPrompt);
      const code = this.extractCode(generatedCode);

      const validation = this.codeValidator.validate(code);
      if (!validation.isValid) {
        return {
          success: false,
          code,
          validation,
          prompt,
          error: `Validation failed: ${validation.errors.map((e) => e.message).join(", ")}`,
          attempts: 1,
        };
      }

      // Update test
      const { code: fixedCode } = this.codeValidator.autoFix(code);
      const updatedTest = this.repository.updateTest(testId, {
        code: fixedCode,
        updatedAt: new Date(),
        metadata: {
          ...test.metadata,
          enhancedAt: new Date().toISOString(),
          enhancementRequest: request,
        },
      });

      return {
        success: true,
        test: updatedTest ?? undefined,
        code: fixedCode,
        validation,
        prompt,
        attempts: 1,
      };
    } catch (error) {
      return {
        success: false,
        prompt,
        error: error instanceof Error ? error.message : String(error),
        attempts: 1,
      };
    }
  }

  /**
   * Generate a Page Object Model class.
   */
  async generatePageObject(applicationId: string, pageName: string, pageUrl: string): Promise<GenerationResult> {
    // Get relevant code
    const relevantCode = await this.promptBuilder.getRelevantCode(
      applicationId,
      `UI components page elements ${pageName}`,
      this.config.maxContextChunks
    );

    const prompt = this.promptBuilder.buildPageObjectPrompt(pageName, pageUrl, relevantCode);

    try {
      const generatedCode = await this.generateWithLLM(prompt.systemPrompt, prompt.userPrompt);
      const code = this.extractCode(generatedCode);

      const validation = this.codeValidator.validate(code);

      return {
        success: validation.isValid,
        code,
        validation,
        prompt,
        attempts: 1,
        error: validation.isValid ? undefined : validation.errors.map((e) => e.message).join(", "),
      };
    } catch (error) {
      return {
        success: false,
        prompt,
        error: error instanceof Error ? error.message : String(error),
        attempts: 1,
      };
    }
  }

  /**
   * Extract code from LLM response (handles markdown code blocks).
   */
  private extractCode(response: string): string {
    // Look for typescript/javascript code blocks
    const codeBlockMatch = response.match(/```(?:typescript|javascript|ts|js)?\n([\s\S]*?)```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }

    // If no code block, return the whole response (might be just code)
    return response.trim();
  }

  /**
   * Generate a test name from the request.
   */
  private generateTestName(request: string): string {
    // Take first 50 chars, sanitize for use as test name
    const sanitized = request
      .slice(0, 50)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, "-");

    return `test-${sanitized}`;
  }

  /**
   * Add validation feedback to prompt for retry.
   */
  private addValidationFeedback(prompt: string, validation: ValidationResult): string {
    const feedback = [
      "\n\n## IMPORTANT: Previous Generation Had Issues\n",
      "The previous code generation had the following problems:\n",
    ];

    for (const error of validation.errors) {
      feedback.push(`- ERROR: ${error.message}${error.line ? ` (line ${error.line})` : ""}`);
    }

    for (const warning of validation.warnings) {
      feedback.push(`- WARNING: ${warning.message}${warning.line ? ` (line ${warning.line})` : ""}`);
    }

    feedback.push("\nPlease fix these issues in the new generation.");

    return prompt + feedback.join("\n");
  }
}
