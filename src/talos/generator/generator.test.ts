/**
 * Tests for PromptBuilder, TestGenerator
 * Covers prompt template filling, code extraction, test name generation, retry logic
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { PromptBuilder } from "./prompt-builder.js";
import { TestGenerator } from "./test-generator.js";
import type { TalosApplication, TalosTest, TalosChunk } from "../types.js";
import Database from "better-sqlite3";
import { TalosRepository } from "../repository.js";

// Mock CodeValidator — patch import statements that break new Function() but keep syntax checking + assertion requirement
vi.mock("./code-validator.js", () => ({
  CodeValidator: class MockCodeValidator {
    validate(code: string) {
      const patched = code.replace(/^import\s+.*$/gm, "// import");
      try { new Function(patched); } catch {
        return { isValid: false, errors: [{ message: "Syntax error", code: "syntax" }], warnings: [], suggestions: [] };
      }
      // Check for assertions (mirrors real REQUIRED_PATTERNS behavior, promoted to error for test fidelity)
      if (!/expect\s*\(|toBe|toEqual|toContain|toMatch/.test(code) && !/test\(/.test(code)) {
        return { isValid: false, errors: [{ message: "Validation failed: no test or assertions", code: "no-test" }], warnings: [], suggestions: [] };
      }
      return { isValid: true, errors: [], warnings: [], suggestions: [] };
    }
    autoFix(code: string) { return { code, fixes: [] }; }
  },
}));

// ── Mock RagPipeline ──────────────────────────────────────────────────────────

function createMockRagPipeline() {
  return {
    retrieve: vi.fn().mockResolvedValue({
      chunks: [
        { id: "c1", content: "function login() {}", filePath: "/src/login.ts", startLine: 1, endLine: 5, type: "source", score: 0.9, metadata: {} },
      ],
      totalTokens: 10,
      query: "test",
    }),
    initialize: vi.fn(),
    indexChunks: vi.fn(),
    findSimilar: vi.fn(),
    clearApplication: vi.fn(),
    getStats: vi.fn(),
  };
}

// ── PromptBuilder Tests ───────────────────────────────────────────────────────

describe("PromptBuilder", () => {
  let builder: PromptBuilder;
  let mockRag: ReturnType<typeof createMockRagPipeline>;

  beforeEach(() => {
    mockRag = createMockRagPipeline();
    builder = new PromptBuilder(mockRag as never);
  });

  it("buildPrompt fills template with application info and code snippets", async () => {
    const app: TalosApplication = {
      id: "app-1", name: "TestApp", description: "", repositoryUrl: "https://github.com/o/r",
      githubPatRef: null, baseUrl: "https://example.com", status: "active", metadata: {},
      createdAt: new Date(), updatedAt: new Date(),
    };
    const existingTests: TalosTest[] = [{
      id: "t1", applicationId: "app-1", name: "Login Test", description: "",
      code: "test('login', async () => {})",
      type: "e2e", status: "active", version: "1.0.0",
      pomDependencies: [], selectors: [], embeddingId: null,
      generationConfidence: null, codeHash: "", tags: [], metadata: {},
      createdAt: new Date(), updatedAt: new Date(),
    }];
    const relevantCode: TalosChunk[] = [{
      id: "c1", applicationId: "app-1", type: "code", content: "function login() {}",
      filePath: "/src/login.ts", startLine: 1, endLine: 5, contentHash: "h", metadata: {}, createdAt: new Date(),
    }];

    const result = await builder.buildPrompt({
      application: app,
      existingTests,
      relevantCode,
      userRequest: "test the login page",
      framework: "playwright",
      style: "pom",
    });

    expect(result.systemPrompt).toContain("playwright");
    expect(result.systemPrompt).toContain("pom");
    expect(result.userPrompt).toContain("TestApp");
    expect(result.userPrompt).toContain("test the login page");
    expect(result.context.codeSnippets.length).toBeGreaterThan(0);
    expect(result.context.existingTestExamples.length).toBeGreaterThan(0);
    expect(result.context.applicationInfo).toContain("TestApp");
  });

  it("buildPrompt uses default framework/style", async () => {
    const app: TalosApplication = {
      id: "a", name: "A", description: "", repositoryUrl: "r",
      githubPatRef: null, baseUrl: "b", status: "active", metadata: {},
      createdAt: new Date(), updatedAt: new Date(),
    };

    const result = await builder.buildPrompt({
      application: app, existingTests: [], relevantCode: [],
      userRequest: "test", // no framework/style
    });

    expect(result.systemPrompt).toContain("playwright");
    expect(result.systemPrompt).toContain("pom");
  });

  it("buildEnhancementPrompt includes existing test code", async () => {
    const test: TalosTest = {
      id: "t1", applicationId: "a1", name: "T1", description: "",
      code: "test('x', async () => { await page.goto('/'); })",
      type: "e2e", status: "active", version: "1.0.0",
      pomDependencies: [], selectors: [], embeddingId: null,
      generationConfidence: null, codeHash: "", tags: [], metadata: {},
      createdAt: new Date(), updatedAt: new Date(),
    };

    const result = await builder.buildEnhancementPrompt(test, "add login assertion", []);
    expect(result.userPrompt).toContain("test('x'");
    expect(result.userPrompt).toContain("add login assertion");
    expect(result.systemPrompt).toContain("enhance");
  });

  it("buildPageObjectPrompt fills page name and URL", () => {
    const result = builder.buildPageObjectPrompt("Login", "https://example.com/login", []);
    expect(result.userPrompt).toContain("Login");
    expect(result.userPrompt).toContain("https://example.com/login");
    expect(result.systemPrompt).toContain("Page Object");
  });

  it("getRelevantCode calls ragPipeline.retrieve and maps results", async () => {
    const chunks = await builder.getRelevantCode("app-1", "login flow", 3);
    expect(mockRag.retrieve).toHaveBeenCalledWith("app-1", "login flow", { limit: 3 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe("function login() {}");
    expect(chunks[0].applicationId).toBe("app-1");
  });
});

// ── TestGenerator Tests ───────────────────────────────────────────────────────

describe("TestGenerator", () => {
  let repo: TalosRepository;
  let mockRag: ReturnType<typeof createMockRagPipeline>;
  let generator: TestGenerator;
  let mockLLM: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const db = new Database(":memory:");
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    repo = new TalosRepository(db);
    repo.migrate();
    mockRag = createMockRagPipeline();
    mockLLM = vi.fn();

    generator = new TestGenerator({
      config: { confidenceThreshold: 0.8, requireReview: true, maxContextChunks: 5, usePom: true },
      repository: repo,
      ragPipeline: mockRag as never,
      generateWithLLM: mockLLM as (systemPrompt: string, userPrompt: string) => Promise<string>,
    });
  });

  it("generate returns error for non-existent application", async () => {
    const result = await generator.generate({
      applicationId: "nonexistent",
      request: "test login",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
    expect(result.attempts).toBe(0);
  });

  it("generate creates test on valid LLM response", async () => {
    const app = repo.createApplication({ name: "MyApp", repositoryUrl: "https://github.com/a/b", baseUrl: "https://example.com" });

    mockLLM.mockResolvedValue(`\`\`\`typescript
import { test, expect } from '@playwright/test';

test('login flow', async ({ page }) => {
  await page.goto('https://example.com');
  await expect(page).toHaveTitle(/Example/);
});
\`\`\``);

    const result = await generator.generate({
      applicationId: app.id,
      request: "test the login page",
      name: "Login Test",
      tags: ["login"],
    });

    expect(result.success).toBe(true);
    expect(result.test).toBeDefined();
    expect(result.test!.name).toBe("Login Test");
    expect(result.code).toContain("@playwright/test");
    expect(result.attempts).toBe(1);
  });

  it("generate extracts code from markdown blocks", async () => {
    const app = repo.createApplication({ name: "MyApp", repositoryUrl: "https://github.com/a/b", baseUrl: "https://example.com" });

    mockLLM.mockResolvedValue(`Here's the test:
\`\`\`typescript
import { test, expect } from '@playwright/test';
test('x', async ({ page }) => { await page.goto('/'); });
\`\`\`
That should work!`);

    const result = await generator.generate({ applicationId: app.id, request: "test x" });
    expect(result.success).toBe(true);
    expect(result.code).toContain("import { test, expect }");
    expect(result.code).not.toContain("Here's");
  });

  it("generate retries on invalid code", async () => {
    const app = repo.createApplication({ name: "MyApp", repositoryUrl: "https://github.com/a/b", baseUrl: "https://example.com" });

    // First attempt: invalid (no playwright import), second: valid
    mockLLM
      .mockResolvedValueOnce("console.log('no test here')")
      .mockResolvedValueOnce(`import { test, expect } from '@playwright/test';
test('retry', async ({ page }) => { await page.goto('/'); });`);

    const result = await generator.generate({
      applicationId: app.id,
      request: "test retry",
      maxRetries: 3,
    });

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);
    expect(mockLLM).toHaveBeenCalledTimes(2);
  });

  it("generate fails after exhausting retries", async () => {
    const app = repo.createApplication({ name: "MyApp", repositoryUrl: "https://github.com/a/b", baseUrl: "https://example.com" });

    mockLLM.mockResolvedValue("not valid code");

    const result = await generator.generate({
      applicationId: app.id,
      request: "test x",
      maxRetries: 1,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Validation failed");
    expect(result.attempts).toBeGreaterThan(1);
  });

  it("generate handles LLM errors", async () => {
    const app = repo.createApplication({ name: "MyApp", repositoryUrl: "https://github.com/a/b", baseUrl: "https://example.com" });

    mockLLM.mockRejectedValue(new Error("LLM unavailable"));

    const result = await generator.generate({
      applicationId: app.id,
      request: "test x",
      maxRetries: 0,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("LLM unavailable");
  });

  it("generate auto-generates test name from request", async () => {
    const app = repo.createApplication({ name: "MyApp", repositoryUrl: "https://github.com/a/b", baseUrl: "https://example.com" });
    mockLLM.mockResolvedValue(`import { test, expect } from '@playwright/test';
test('generated', async ({ page }) => { await page.goto('/'); });`);

    const result = await generator.generate({ applicationId: app.id, request: "verify login form" });
    expect(result.success).toBe(true);
    expect(result.test!.name).toContain("verify-login-form");
  });

  it("enhance returns error for non-existent test", async () => {
    const result = await generator.enhance("nonexistent", "add assertion");
    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("enhance updates existing test", async () => {
    const app = repo.createApplication({ name: "MyApp", repositoryUrl: "https://github.com/a/b", baseUrl: "https://example.com" });
    const test = repo.createTest({ applicationId: app.id, name: "t1", code: "test('x', async () => {})", type: "e2e" });

    mockLLM.mockResolvedValue(`import { test, expect } from '@playwright/test';
test('x enhanced', async ({ page }) => { await page.goto('/'); await expect(page).toHaveTitle('X'); });`);

    const result = await generator.enhance(test.id, "add title assertion");
    expect(result.success).toBe(true);
    expect(result.code).toContain("enhanced");
  });

  it("enhance fails on invalid generated code", async () => {
    const app = repo.createApplication({ name: "MyApp", repositoryUrl: "https://github.com/a/b", baseUrl: "https://example.com" });
    const test = repo.createTest({ applicationId: app.id, name: "t1", code: "test('x', async () => {})", type: "e2e" });

    mockLLM.mockResolvedValue("not valid code at all");
    const result = await generator.enhance(test.id, "add stuff");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Validation failed");
  });

  it("enhance handles LLM exceptions", async () => {
    const app = repo.createApplication({ name: "MyApp", repositoryUrl: "https://github.com/a/b", baseUrl: "https://example.com" });
    const test = repo.createTest({ applicationId: app.id, name: "t1", code: "test('x', async () => {})", type: "e2e" });

    mockLLM.mockRejectedValue(new Error("boom"));
    const result = await generator.enhance(test.id, "add stuff");
    expect(result.success).toBe(false);
    expect(result.error).toContain("boom");
  });

  it("generatePageObject creates POM code", async () => {
    mockLLM.mockResolvedValue(`import { test, expect } from '@playwright/test';
export class LoginPage {
  constructor(private page: Page) {}
  async navigate() { await this.page.goto('/login'); }
}`);

    const app = repo.createApplication({ name: "MyApp", repositoryUrl: "https://github.com/a/b", baseUrl: "https://example.com" });
    const result = await generator.generatePageObject(app.id, "Login", "https://example.com/login");
    // Code validity depends on whether validator considers POM valid
    expect(result.code).toBeDefined();
    expect(result.attempts).toBe(1);
  });

  it("generatePageObject handles LLM errors", async () => {
    mockLLM.mockRejectedValue(new Error("fail"));
    const app = repo.createApplication({ name: "MyApp", repositoryUrl: "https://github.com/a/b", baseUrl: "https://example.com" });
    const result = await generator.generatePageObject(app.id, "Login", "/login");
    expect(result.success).toBe(false);
    expect(result.error).toContain("fail");
  });
});
