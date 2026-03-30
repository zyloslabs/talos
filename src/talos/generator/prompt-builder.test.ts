/**
 * Tests for PromptBuilder
 */

import { describe, it, expect, vi } from "vitest";
import { PromptBuilder } from "./prompt-builder.js";
import type { TalosApplication, TalosTest, TalosChunk } from "../types.js";
import type { RagPipeline } from "../rag/rag-pipeline.js";

function makeApp(overrides: Partial<TalosApplication> = {}): TalosApplication {
  return {
    id: "app-1",
    name: "My App",
    repositoryUrl: "https://github.com/org/repo",
    branch: "main",
    baseUrl: "https://app.example.com",
    description: "",
    githubPatRef: null,
    status: "active",
    mtlsEnabled: false,
    mtlsConfig: null,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeTest(overrides: Partial<TalosTest> = {}): TalosTest {
  return {
    id: "test-1",
    applicationId: "app-1",
    name: "Login test",
    code: `test('login', async ({page}) => { await page.goto('/login'); });`,
    type: "e2e",
    version: "1.0.0",
    status: "active",
    description: "",
    codeHash: "",
    embeddingId: null,
    pomDependencies: [],
    selectors: [],
    generationConfidence: null,
    tags: [],
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeChunk(overrides: Partial<TalosChunk> = {}): TalosChunk {
  return {
    id: "chunk-1",
    applicationId: "app-1",
    type: "code",
    content: "export function Button() { return <button>Click</button>; }",
    filePath: "src/components/Button.tsx",
    startLine: 1,
    endLine: 3,
    contentHash: "abc123",
    metadata: {},
    createdAt: new Date(),
    ...overrides,
  };
}

function makeRagPipeline(): RagPipeline {
  return {
    retrieve: vi.fn().mockResolvedValue({ chunks: [] }),
  } as unknown as RagPipeline;
}

describe("PromptBuilder", () => {
  it("buildPrompt returns system and user prompts with defaults", async () => {
    const builder = new PromptBuilder(makeRagPipeline());
    const prompt = await builder.buildPrompt({
      application: makeApp(),
      existingTests: [],
      relevantCode: [],
      userRequest: "Generate a login test",
    });
    expect(prompt.systemPrompt).toContain("playwright");
    expect(prompt.systemPrompt).toContain("pom");
    expect(prompt.userPrompt).toContain("Generate a login test");
    expect(prompt.context.applicationInfo).toContain("My App");
  });

  it("buildPrompt uses provided framework and style", async () => {
    const builder = new PromptBuilder(makeRagPipeline());
    const prompt = await builder.buildPrompt({
      application: makeApp(),
      existingTests: [],
      relevantCode: [],
      userRequest: "Test dashboard",
      framework: "cypress",
      style: "bdd",
    });
    expect(prompt.systemPrompt).toContain("cypress");
    expect(prompt.systemPrompt).toContain("bdd");
  });

  it("buildApplicationInfo uses N/A when repositoryUrl/baseUrl are null", async () => {
    const builder = new PromptBuilder(makeRagPipeline());
    const prompt = await builder.buildPrompt({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      application: makeApp({ repositoryUrl: null as unknown as string, baseUrl: null as unknown as string }),
      existingTests: [],
      relevantCode: [],
      userRequest: "test",
    });
    expect(prompt.context.applicationInfo).toContain("N/A");
  });

  it("buildCodeSnippets includes line range when startLine is set", async () => {
    const builder = new PromptBuilder(makeRagPipeline());
    const prompt = await builder.buildPrompt({
      application: makeApp(),
      existingTests: [],
      relevantCode: [makeChunk({ startLine: 10, endLine: 20 })],
      userRequest: "test",
    });
    expect(prompt.context.codeSnippets[0]).toContain("Lines 10-20");
  });

  it("buildCodeSnippets omits line range when startLine is null", async () => {
    const builder = new PromptBuilder(makeRagPipeline());
    const prompt = await builder.buildPrompt({
      application: makeApp(),
      existingTests: [],
      relevantCode: [makeChunk({ startLine: null as unknown as number, endLine: null as unknown as number })],
      userRequest: "test",
    });
    expect(prompt.context.codeSnippets[0]).not.toContain("Lines");
  });

  it("buildExistingTestExamples caps at 3 examples", async () => {
    const builder = new PromptBuilder(makeRagPipeline());
    const tests = Array.from({ length: 5 }, (_, i) => makeTest({ id: `test-${i}`, name: `Test ${i}` }));
    const prompt = await builder.buildPrompt({
      application: makeApp(),
      existingTests: tests,
      relevantCode: [],
      userRequest: "test",
    });
    // Only 3 examples should be included
    expect(prompt.context.existingTestExamples).toHaveLength(3);
  });

  it("getLanguageFromPath resolves common extensions", async () => {
    const builder = new PromptBuilder(makeRagPipeline());
    const extensions = [
      { file: "a.ts", expected: "typescript" },
      { file: "b.tsx", expected: "typescript" },
      { file: "c.js", expected: "javascript" },
      { file: "d.jsx", expected: "javascript" },
      { file: "e.py", expected: "python" },
      { file: "f.rb", expected: "ruby" },
      { file: "g.java", expected: "java" },
      { file: "h.cs", expected: "csharp" },
      { file: "i.go", expected: "go" },
      { file: "j.rs", expected: "rust" },
      { file: "k.vue", expected: "vue" },
      { file: "l.svelte", expected: "svelte" },
    ];
    for (const { file, expected } of extensions) {
      const prompt = await builder.buildPrompt({
        application: makeApp(),
        existingTests: [],
        relevantCode: [makeChunk({ filePath: file })],
        userRequest: "test",
      });
      expect(prompt.context.codeSnippets[0]).toContain(`\`\`\`${expected}`);
    }
  });

  it("getLanguageFromPath falls back to ext for unknown types", async () => {
    const builder = new PromptBuilder(makeRagPipeline());
    const prompt = await builder.buildPrompt({
      application: makeApp(),
      existingTests: [],
      relevantCode: [makeChunk({ filePath: "schema.graphql" })],
      userRequest: "test",
    });
    expect(prompt.context.codeSnippets[0]).toContain("```graphql");
  });

  it("getLanguageFromPath uses unknown-ext filename when no dot-extension match", async () => {
    const builder = new PromptBuilder(makeRagPipeline());
    const prompt = await builder.buildPrompt({
      application: makeApp(),
      existingTests: [],
      relevantCode: [makeChunk({ filePath: "schema.proto" })],
      userRequest: "test",
    });
    // "proto" is not in langMap, so falls back to the extension itself "proto"
    expect(prompt.context.codeSnippets[0]).toContain("```proto");
  });

  it("buildEnhancementPrompt returns valid prompts", async () => {
    const builder = new PromptBuilder(makeRagPipeline());
    const prompt = await builder.buildEnhancementPrompt(makeTest(), "Add assertion for error message", [makeChunk()]);
    expect(prompt.systemPrompt).toContain("enhance");
    expect(prompt.userPrompt).toContain("Add assertion for error message");
    expect(prompt.userPrompt).toContain("login");
  });

  it("buildPageObjectPrompt returns valid prompts", () => {
    const builder = new PromptBuilder(makeRagPipeline());
    const prompt = builder.buildPageObjectPrompt("Login", "https://app.com/login", [makeChunk()]);
    expect(prompt.systemPrompt).toContain("Page Object");
    expect(prompt.userPrompt).toContain("Login");
    expect(prompt.userPrompt).toContain("https://app.com/login");
    expect(prompt.context.applicationInfo).toContain("Login");
  });

  it("getRelevantCode maps RAG results to TalosChunk format", async () => {
    const mockRag = {
      retrieve: vi.fn().mockResolvedValue({
        chunks: [
          {
            id: "c1",
            type: "component",
            content: "export const Btn = () => <button />;",
            filePath: "src/Btn.tsx",
            startLine: 1,
            endLine: 1,
            metadata: {},
          },
        ],
      }),
    } as unknown as RagPipeline;
    const builder = new PromptBuilder(mockRag);

    const chunks = await builder.getRelevantCode("app-1", "button component");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].id).toBe("c1");
    expect(chunks[0].applicationId).toBe("app-1");
    expect(mockRag.retrieve).toHaveBeenCalledWith("app-1", "button component", { limit: 5 });
  });
});
