/**
 * Tests for HealingEngine and FixGenerator
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { TalosRepository } from "../repository.js";

import { FixGenerator } from "./fix-generator.js";
import { CodeValidator } from "../generator/code-validator.js";

function createRepo() {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const repo = new TalosRepository(db);
  repo.migrate();
  return repo;
}

// ── FixGenerator Tests ────────────────────────────────────────────────────────

describe("FixGenerator", () => {
  let repo: TalosRepository;
  let mockLLM: ReturnType<typeof vi.fn>;
  let generator: FixGenerator;

  beforeEach(() => {
    repo = createRepo();
    mockLLM = vi.fn();
    // Use a mock validator — real CodeValidator uses new Function() which rejects import statements
    const mockValidator = { validate: () => ({ isValid: true, errors: [], warnings: [], suggestions: [] }) } as unknown as CodeValidator;
    generator = new FixGenerator({
      repository: repo,
      codeValidator: mockValidator,
      generateWithLLM: mockLLM as (systemPrompt: string, userPrompt: string) => Promise<string>,
    });
  });

  it("generateFixes produces fixes for selector failure", async () => {
    const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://example.com" });
    const test = repo.createTest({ applicationId: app.id, name: "t1", code: `import { test, expect } from '@playwright/test';\ntest('x', async ({page}) => { await page.click('.old-selector'); });`, type: "e2e" });
    const run = repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });

    // Mock LLM to return valid fixed code
    mockLLM.mockResolvedValue(`\`\`\`typescript
import { test, expect } from '@playwright/test';
test('x', async ({page}) => { await page.click('[data-testid="btn"]'); });
\`\`\``);

    const result = await generator.generateFixes(test, run, {
      runId: "r1", category: "selector-changed",
      relatedFailures: [],
      rootCause: "Selector .old-selector no longer exists",
      affectedElements: [{ selector: ".old-selector", type: "action" }],
      suggestedFixes: [{ type: "update-selector", description: "Update selector", confidence: 0.8,  }],
      confidence: 0.8,
      metadata: {},
    });

    expect(result.success).toBe(true);
    expect(result.fixes.length).toBeGreaterThanOrEqual(1);
    expect(result.selectedFix).toBeDefined();
    expect(result.selectedFix!.confidence).toBe(0.8);
  });

  it("generateFixes handles add-wait fix type", async () => {
    const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://example.com" });
    const test = repo.createTest({ applicationId: app.id, name: "t1", code: `import { test, expect } from '@playwright/test';\ntest('x', async ({page}) => { await page.goto('/'); });`, type: "e2e" });
    const run = repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });

    mockLLM.mockResolvedValue(`import { test, expect } from '@playwright/test';
test('x', async ({page}) => { await page.goto('/'); await page.waitForTimeout(1000); });`);

    const result = await generator.generateFixes(test, run, {
      runId: "r1", category: "timeout",
      relatedFailures: [],
      rootCause: "Element took too long to appear",
      affectedElements: [],
      suggestedFixes: [{ type: "add-wait", description: "Add wait", confidence: 0.7,  }],
      confidence: 0.7,
      metadata: {},
    });

    expect(result.success).toBe(true);
  });

  it("generateFixes handles update-assertion fix type", async () => {
    const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://example.com" });
    const test = repo.createTest({ applicationId: app.id, name: "t1", code: `import { test, expect } from '@playwright/test';\ntest('x', async ({page}) => { await expect(page).toHaveTitle('Old'); });`, type: "e2e" });
    const run = repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });

    mockLLM.mockResolvedValue(`import { test, expect } from '@playwright/test';
test('x', async ({page}) => { await expect(page).toHaveTitle('New'); });`);

    const result = await generator.generateFixes(test, run, {
      runId: "r1", category: "assertion-failed",
      relatedFailures: [],
      rootCause: "Title changed",
      affectedElements: [],
      suggestedFixes: [{ type: "update-assertion", description: "Update assertion", confidence: 0.6,  }],
      confidence: 0.6,
      metadata: { expected: "Old", received: "New" },
    });

    expect(result.success).toBe(true);
  });

  it("generateFixes handles add-retry fix type", async () => {
    const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://example.com" });
    const test = repo.createTest({ applicationId: app.id, name: "t1", code: `import { test, expect } from '@playwright/test';\ntest('x', async ({page}) => { await page.goto('/'); });`, type: "e2e" });
    const run = repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });

    mockLLM.mockResolvedValue(`import { test, expect } from '@playwright/test';
test('x', async ({page}) => { test.setTimeout(30000); await page.goto('/'); });`);

    const result = await generator.generateFixes(test, run, {
      runId: "r1", category: "timeout",
      relatedFailures: [],
      rootCause: "Intermittent failure",
      affectedElements: [],
      suggestedFixes: [{ type: "add-retry", description: "Add retry", confidence: 0.5,  }],
      confidence: 0.5,
      metadata: {},
    });

    expect(result.success).toBe(true);
  });

  it("generateFixes handles update-logic fix type", async () => {
    const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://example.com" });
    const test = repo.createTest({ applicationId: app.id, name: "t1", code: `import { test, expect } from '@playwright/test';\ntest('x', async ({page}) => { await page.goto('/old-page'); });`, type: "e2e" });
    const run = repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });

    mockLLM.mockResolvedValue(`import { test, expect } from '@playwright/test';
test('x', async ({page}) => { await page.goto('/new-page'); });`);

    const result = await generator.generateFixes(test, run, {
      runId: "r1", category: "navigation-error",
      relatedFailures: [],
      rootCause: "Page URL changed",
      affectedElements: [],
      suggestedFixes: [{ type: "update-logic", description: "Update logic", confidence: 0.6,  }],
      confidence: 0.6,
      metadata: {},
    });

    expect(result.success).toBe(true);
  });

  it("generateFixes skips manual-review suggestions", async () => {
    const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://example.com" });
    const test = repo.createTest({ applicationId: app.id, name: "t1", code: "test('x')", type: "e2e" });
    const run = repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });

    const result = await generator.generateFixes(test, run, {
      runId: "r1", category: "unknown",
      relatedFailures: [],
      rootCause: "Unknown",
      affectedElements: [],
      suggestedFixes: [{ type: "manual-review", description: "Needs review", confidence: 0,  }],
      confidence: 0,
      metadata: {},
    });

    expect(result.success).toBe(false);
    expect(result.fixes).toHaveLength(0);
  });

  it("generateFixes handles LLM returning same code (no change)", async () => {
    const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://example.com" });
    const code = `import { test, expect } from '@playwright/test';\ntest('x', async ({page}) => { await page.goto('/'); });`;
    const test = repo.createTest({ applicationId: app.id, name: "t1", code, type: "e2e" });
    const run = repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });

    mockLLM.mockResolvedValue(code); // Returns identical code

    const result = await generator.generateFixes(test, run, {
      runId: "r1", category: "selector-changed",
      relatedFailures: [],
      rootCause: "x",
      affectedElements: [],
      suggestedFixes: [{ type: "update-selector", description: "Update", confidence: 0.5,  }],
      confidence: 0.5,
      metadata: {},
    });

    expect(result.success).toBe(false);
  });

  it("applyFix updates test code in repository", async () => {
    const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://example.com" });
    const test = repo.createTest({ applicationId: app.id, name: "t1", code: "old code", type: "e2e" });

    const result = await generator.applyFix(test.id, {
      originalCode: "old code",
      fixedCode: "new code",
      changeDescription: "Updated selector",
      diff: "- old\n+ new",
      confidence: 0.9,
      suggestedFix: { type: "update-selector", description: "Update", confidence: 0.9,  },
    });

    expect(result).toBeTruthy();
    expect(result!.code).toBe("new code");
  });

  it("applyFix returns null for non-existent test", async () => {
    const result = await generator.applyFix("nonexistent", {
      originalCode: "", fixedCode: "", changeDescription: "",
      diff: "", confidence: 0, suggestedFix: { type: "update-selector", description: "", confidence: 0,  },
    });
    expect(result).toBeNull();
  });

  it("generateFixes handles LLM errors gracefully", async () => {
    const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://example.com" });
    const test = repo.createTest({ applicationId: app.id, name: "t1", code: "test('x')", type: "e2e" });
    const run = repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });

    mockLLM.mockRejectedValue(new Error("LLM down"));

    const result = await generator.generateFixes(test, run, {
      runId: "r1", category: "selector-changed",
      relatedFailures: [],
      rootCause: "x",
      affectedElements: [{ selector: ".x", type: "action" }],
      suggestedFixes: [{ type: "update-selector", description: "Fix", confidence: 0.5,  }],
      confidence: 0.5,
      metadata: {},
    });

    expect(result.success).toBe(false);
  });

  it("generateFixes selects highest confidence fix", async () => {
    const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://example.com" });
    const test = repo.createTest({ applicationId: app.id, name: "t1", code: `import { test, expect } from '@playwright/test';\ntest('x', async ({page}) => { await page.goto('/'); });`, type: "e2e" });
    const run = repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });

    mockLLM.mockResolvedValue(`import { test, expect } from '@playwright/test';
test('x', async ({page}) => { await page.goto('/fixed'); });`);

    const result = await generator.generateFixes(test, run, {
      runId: "r1", category: "selector-changed",
      relatedFailures: [],
      rootCause: "x",
      affectedElements: [],
      suggestedFixes: [
        { type: "update-selector", description: "Fix 1", confidence: 0.3,  },
        { type: "add-wait", description: "Fix 2", confidence: 0.9,  },
      ],
      confidence: 0.9,
      metadata: {},
    });

    expect(result.success).toBe(true);
    expect(result.selectedFix!.confidence).toBe(0.9);
  });
});

// ── diff generation ──────────────────────────────────────────────────────────

describe("FixGenerator diff", () => {
  let generator: FixGenerator;

  beforeEach(() => {
    const repo = createRepo();
    generator = new FixGenerator({
      repository: repo,
      codeValidator: { validate: () => ({ isValid: true, errors: [], warnings: [], suggestions: [] }) } as unknown as CodeValidator,
      generateWithLLM: vi.fn(),
    });
  });

  it("generates line-by-line diff", () => {
    // Access private generateDiff via any
    const diff = (generator as unknown as { generateDiff: (a: string, b: string) => string }).generateDiff(
      "line1\nline2\nline3",
      "line1\nmodified\nline3\nline4"
    );
    expect(diff).toContain("- line2");
    expect(diff).toContain("+ modified");
    expect(diff).toContain("+ line4");
  });
});
