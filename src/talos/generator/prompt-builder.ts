/**
 * Prompt Builder
 *
 * Builds context-aware prompts for test generation.
 */

import type { TalosApplication, TalosTest, TalosChunk, AppIntelligenceReport } from "../types.js";
import type { RagPipeline } from "../rag/rag-pipeline.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PromptContext = {
  application: TalosApplication;
  existingTests: TalosTest[];
  relevantCode: TalosChunk[];
  intelligence?: AppIntelligenceReport;
  userRequest: string;
  framework?: "playwright" | "cypress" | "puppeteer";
  style?: "bdd" | "tdd" | "pom";
};

export type GeneratedPrompt = {
  systemPrompt: string;
  userPrompt: string;
  context: {
    codeSnippets: string[];
    existingTestExamples: string[];
    applicationInfo: string;
  };
};

// ── Template Constants ────────────────────────────────────────────────────────

const SYSTEM_PROMPT_TEMPLATE = `You are an expert test automation engineer specializing in end-to-end testing.
Your task is to generate high-quality Playwright test code based on the provided context.

## Guidelines:
- Write clean, maintainable TypeScript code
- Use modern Playwright API (locators, getByRole, getByTestId)
- Include proper error handling and assertions
- Add descriptive comments for complex logic
- Follow the Page Object Model pattern when appropriate
- Ensure tests are idempotent and can run independently

## Code Style:
- Use async/await consistently
- Prefer getByRole and getByTestId over CSS selectors
- Add meaningful test step names
- Include appropriate timeouts and waits

## Framework: {{FRAMEWORK}}
## Style: {{STYLE}}`;

const USER_PROMPT_TEMPLATE = `## Application Context
{{APPLICATION_INFO}}

## Relevant Code
{{CODE_SNIPPETS}}

## Existing Test Examples
{{EXISTING_TESTS}}

## Request
{{USER_REQUEST}}

Generate a complete Playwright test that satisfies the request above. The test should:
1. Be self-contained and runnable
2. Include all necessary imports and setup
3. Handle common edge cases
4. Use appropriate assertions`;

// ── Prompt Builder ────────────────────────────────────────────────────────────

export class PromptBuilder {
  private ragPipeline: RagPipeline;

  constructor(ragPipeline: RagPipeline) {
    this.ragPipeline = ragPipeline;
  }

  /**
   * Build a prompt for test generation.
   */
  async buildPrompt(context: PromptContext): Promise<GeneratedPrompt> {
    const framework = context.framework ?? "playwright";
    const style = context.style ?? "pom";

    // Build system prompt
    const systemPrompt = SYSTEM_PROMPT_TEMPLATE.replace("{{FRAMEWORK}}", framework).replace("{{STYLE}}", style);

    // Build context sections
    const applicationInfo = this.buildApplicationInfo(context.application, context.intelligence);
    const codeSnippets = this.buildCodeSnippets(context.relevantCode);
    const existingTestExamples = this.buildExistingTestExamples(context.existingTests);

    // Build user prompt
    const userPrompt = USER_PROMPT_TEMPLATE.replace("{{APPLICATION_INFO}}", applicationInfo)
      .replace("{{CODE_SNIPPETS}}", codeSnippets.join("\n\n"))
      .replace("{{EXISTING_TESTS}}", existingTestExamples.join("\n\n"))
      .replace("{{USER_REQUEST}}", context.userRequest);

    return {
      systemPrompt,
      userPrompt,
      context: {
        codeSnippets,
        existingTestExamples,
        applicationInfo,
      },
    };
  }

  /**
   * Build a prompt for test enhancement/modification.
   */
  async buildEnhancementPrompt(
    existingTest: TalosTest,
    request: string,
    relevantCode: TalosChunk[]
  ): Promise<GeneratedPrompt> {
    const systemPrompt = `You are an expert test automation engineer.
Your task is to enhance or modify an existing Playwright test based on the provided request.

Guidelines:
- Preserve the existing test structure where possible
- Add requested functionality cleanly
- Maintain code style consistency
- Update comments and assertions as needed`;

    const userPrompt = `## Existing Test
\`\`\`typescript
${existingTest.code}
\`\`\`

## Relevant Context
${this.buildCodeSnippets(relevantCode).join("\n\n")}

## Enhancement Request
${request}

Provide the modified test code that incorporates the requested changes.`;

    return {
      systemPrompt,
      userPrompt,
      context: {
        codeSnippets: this.buildCodeSnippets(relevantCode),
        existingTestExamples: [existingTest.code],
        applicationInfo: "",
      },
    };
  }

  /**
   * Build a prompt for Page Object generation.
   */
  buildPageObjectPrompt(pageName: string, pageUrl: string, relevantCode: TalosChunk[]): GeneratedPrompt {
    const systemPrompt = `You are an expert test automation engineer.
Your task is to create a Page Object Model class for Playwright.

Guidelines:
- Create a clean TypeScript class
- Include all relevant page elements as locators
- Add common interactions as methods
- Include JSDoc comments
- Follow the naming convention: [PageName]Page`;

    const userPrompt = `## Page Details
- Name: ${pageName}
- URL: ${pageUrl}

## Relevant UI Code
${this.buildCodeSnippets(relevantCode).join("\n\n")}

Generate a complete Page Object class for this page.`;

    return {
      systemPrompt,
      userPrompt,
      context: {
        codeSnippets: this.buildCodeSnippets(relevantCode),
        existingTestExamples: [],
        applicationInfo: `Page: ${pageName} at ${pageUrl}`,
      },
    };
  }

  /**
   * Retrieve relevant code chunks for a request.
   */
  async getRelevantCode(applicationId: string, request: string, limit = 5): Promise<TalosChunk[]> {
    const results = await this.ragPipeline.retrieve(applicationId, request, { limit });
    // Map VectorSearchResult to TalosChunk format
    return results.chunks.map((chunk) => ({
      id: chunk.id,
      applicationId,
      type: chunk.type,
      content: chunk.content,
      filePath: chunk.filePath,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      contentHash: "",
      metadata: chunk.metadata,
      createdAt: new Date(),
    }));
  }

  private buildApplicationInfo(app: TalosApplication, intelligence?: AppIntelligenceReport): string {
    let info = `
Application: ${app.name}
Repository: ${app.repositoryUrl ?? "N/A"}
Base URL: ${app.baseUrl ?? "N/A"}`.trim();

    if (intelligence) {
      const techStack = intelligence.techStack
        .map((t) => `${t.name}${t.version ? ` v${t.version}` : ""} (${t.category})`)
        .join(", ");
      const databases = intelligence.databases.map((d) => `${d.type} (${d.source})`).join(", ");
      const testUsers = intelligence.testUsers
        .map((u) => `${u.variableName}${u.roleHint ? ` [${u.roleHint}]` : ""}`)
        .join(", ");
      const docs = intelligence.documentation.map((d) => `${d.filePath} (${d.type})`).join(", ");

      if (techStack) info += `\nTech Stack: ${techStack}`;
      if (databases) info += `\nDatabases: ${databases}`;
      if (testUsers) info += `\nTest Users: ${testUsers}`;
      if (docs) info += `\nDocumentation: ${docs}`;
    }

    return info;
  }

  private buildCodeSnippets(chunks: TalosChunk[]): string[] {
    return chunks.map((chunk, i) => {
      const header = `### Code Snippet ${i + 1}: ${chunk.filePath}`;
      const lines = chunk.startLine ? `Lines ${chunk.startLine}-${chunk.endLine}` : "";
      const code = `\`\`\`${this.getLanguageFromPath(chunk.filePath)}\n${chunk.content}\n\`\`\``;

      return `${header}${lines ? ` (${lines})` : ""}\n${code}`;
    });
  }

  private buildExistingTestExamples(tests: TalosTest[]): string[] {
    // Only include a few examples to avoid context overflow
    const examples = tests.slice(0, 3);
    return examples.map((test, i) => {
      return `### Example Test ${i + 1}: ${test.name}
\`\`\`typescript
${test.code}
\`\`\``;
    });
  }

  private getLanguageFromPath(filePath: string): string {
    const ext = filePath.split(".").pop()?.toLowerCase();
    const langMap: Record<string, string> = {
      ts: "typescript",
      tsx: "typescript",
      js: "javascript",
      jsx: "javascript",
      py: "python",
      rb: "ruby",
      java: "java",
      cs: "csharp",
      go: "go",
      rs: "rust",
      vue: "vue",
      svelte: "svelte",
    };
    return langMap[ext ?? ""] ?? ext ?? "text";
  }
}
