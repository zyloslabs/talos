/**
 * CriteriaGenerator unit tests.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { TalosRepository } from "../repository.js";
import { CriteriaGenerator } from "./criteria-generator.js";
import type { RagPipeline, RagContext } from "../rag/rag-pipeline.js";

function createMockRagPipeline(chunks: RagContext["chunks"] = []): RagPipeline {
  return {
    retrieveWithFilters: vi.fn().mockResolvedValue({
      chunks,
      totalTokens: 100,
      query: "test",
    }),
    retrieve: vi.fn().mockResolvedValue({ chunks: [], totalTokens: 0, query: "" }),
    initialize: vi.fn().mockResolvedValue(undefined),
    indexChunks: vi.fn().mockResolvedValue({ indexed: 0, skipped: 0, totalTokens: 0 }),
    findSimilar: vi.fn().mockResolvedValue([]),
    clearApplication: vi.fn().mockResolvedValue(0),
    getStats: vi.fn().mockResolvedValue({ totalChunks: 0 }),
  } as unknown as RagPipeline;
}

function createTestRepo() {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const fixedTime = new Date("2025-01-15T12:00:00Z");
  const repo = new TalosRepository(db, { clock: () => fixedTime });
  repo.migrate();
  return { db, repo };
}

describe("CriteriaGenerator", () => {
  let repo: TalosRepository;
  let appId: string;

  beforeEach(() => {
    ({ repo } = createTestRepo());
    const app = repo.createApplication({ name: "Test App" });
    appId = app.id;
  });

  describe("generateCriteria", () => {
    it("should return empty result when no chunks found", async () => {
      const rag = createMockRagPipeline([]);
      const generator = new CriteriaGenerator({
        ragPipeline: rag,
        repository: repo,
        generateWithLLM: vi.fn(),
      });

      const result = await generator.generateCriteria(appId);
      expect(result.criteriaCreated).toBe(0);
      expect(result.totalChunksAnalyzed).toBe(0);
      expect(result.averageConfidence).toBe(0);
    });

    it("should generate criteria from chunks via LLM", async () => {
      const chunks = [
        {
          id: "chunk-1",
          content: "Users must be able to log in with email and password",
          filePath: "requirements.md",
          startLine: 1,
          endLine: 5,
          type: "requirement" as const,
          score: 0.9,
          metadata: {},
        },
      ];
      const rag = createMockRagPipeline(chunks);

      const llmResponse = JSON.stringify({
        criteria: [
          {
            title: "Email login",
            description: "User can log in with email and password",
            scenarios: [{ given: "valid credentials", when: "user submits login form", then: "user is authenticated" }],
            preconditions: ["User account exists"],
            dataRequirements: ["email", "password"],
            nfrTags: ["security"],
            confidence: 0.88,
          },
        ],
      });

      const generator = new CriteriaGenerator({
        ragPipeline: rag,
        repository: repo,
        generateWithLLM: vi.fn().mockResolvedValue(llmResponse),
      });

      const result = await generator.generateCriteria(appId);
      expect(result.criteriaCreated).toBe(1);
      expect(result.totalChunksAnalyzed).toBe(1);
      expect(result.averageConfidence).toBeCloseTo(0.88, 2);

      // Verify it was saved to the repository
      const saved = repo.listAcceptanceCriteria(appId);
      expect(saved).toHaveLength(1);
      expect(saved[0].title).toBe("Email login");
      expect(saved[0].scenarios).toHaveLength(1);
      expect(saved[0].nfrTags).toEqual(["security"]);
    });

    it("should handle markdown-wrapped JSON response", async () => {
      const chunks = [
        { id: "c1", content: "Req text", filePath: "f.md", startLine: 1, endLine: 2, type: "requirement" as const, score: 0.8, metadata: {} },
      ];
      const rag = createMockRagPipeline(chunks);

      const llmResponse = "```json\n" + JSON.stringify({
        criteria: [{ title: "Wrapped", description: "desc", scenarios: [], preconditions: [], dataRequirements: [], nfrTags: [], confidence: 0.7 }],
      }) + "\n```";

      const generator = new CriteriaGenerator({
        ragPipeline: rag,
        repository: repo,
        generateWithLLM: vi.fn().mockResolvedValue(llmResponse),
      });

      const result = await generator.generateCriteria(appId);
      expect(result.criteriaCreated).toBe(1);
    });

    it("should handle invalid LLM response gracefully", async () => {
      const chunks = [
        { id: "c1", content: "Req text", filePath: "f.md", startLine: 1, endLine: 2, type: "requirement" as const, score: 0.8, metadata: {} },
      ];
      const rag = createMockRagPipeline(chunks);

      const generator = new CriteriaGenerator({
        ragPipeline: rag,
        repository: repo,
        generateWithLLM: vi.fn().mockResolvedValue("This is not valid JSON"),
      });

      const result = await generator.generateCriteria(appId);
      expect(result.criteriaCreated).toBe(0);
      expect(result.totalChunksAnalyzed).toBe(1);
    });

    it("should respect maxCriteria option", async () => {
      const chunks = [
        { id: "c1", content: "Req", filePath: "f.md", startLine: 1, endLine: 2, type: "requirement" as const, score: 0.8, metadata: {} },
      ];
      const rag = createMockRagPipeline(chunks);

      const criteria = Array.from({ length: 10 }, (_, i) => ({
        title: `Criterion ${i}`,
        description: `desc ${i}`,
        scenarios: [],
        preconditions: [],
        dataRequirements: [],
        nfrTags: [],
        confidence: 0.8,
      }));

      const generator = new CriteriaGenerator({
        ragPipeline: rag,
        repository: repo,
        generateWithLLM: vi.fn().mockResolvedValue(JSON.stringify({ criteria })),
      });

      const result = await generator.generateCriteria(appId, { maxCriteria: 3 });
      expect(result.criteriaCreated).toBe(3);
    });

    it("should clamp confidence to 0-1 range", async () => {
      const chunks = [
        { id: "c1", content: "Req", filePath: "f.md", startLine: 1, endLine: 2, type: "requirement" as const, score: 0.8, metadata: {} },
      ];
      const rag = createMockRagPipeline(chunks);

      const llmResponse = JSON.stringify({
        criteria: [
          { title: "High", description: "d", scenarios: [], preconditions: [], dataRequirements: [], nfrTags: [], confidence: 1.5 },
          { title: "Low", description: "d", scenarios: [], preconditions: [], dataRequirements: [], nfrTags: [], confidence: -0.3 },
        ],
      });

      const generator = new CriteriaGenerator({
        ragPipeline: rag,
        repository: repo,
        generateWithLLM: vi.fn().mockResolvedValue(llmResponse),
      });

      const result = await generator.generateCriteria(appId);
      expect(result.criteriaCreated).toBe(2);
      const saved = repo.listAcceptanceCriteria(appId);
      expect(saved.find((c) => c.title === "High")?.confidence).toBe(1);
      expect(saved.find((c) => c.title === "Low")?.confidence).toBe(0);
    });

    it("should pass requirementFilter to RAG query", async () => {
      const rag = createMockRagPipeline([]);
      const generator = new CriteriaGenerator({
        ragPipeline: rag,
        repository: repo,
        generateWithLLM: vi.fn(),
      });

      await generator.generateCriteria(appId, { requirementFilter: "authentication requirements" });

      expect(rag.retrieveWithFilters).toHaveBeenCalledWith(
        appId,
        "authentication requirements",
        expect.objectContaining({ types: ["requirement", "api_spec", "user_story"] })
      );
    });

    it("should filter out criteria without valid title", async () => {
      const chunks = [
        { id: "c1", content: "Req", filePath: "f.md", startLine: 1, endLine: 2, type: "requirement" as const, score: 0.8, metadata: {} },
      ];
      const rag = createMockRagPipeline(chunks);

      const llmResponse = JSON.stringify({
        criteria: [
          { title: "Valid", description: "d", scenarios: [], preconditions: [], dataRequirements: [], nfrTags: [], confidence: 0.8 },
          { title: "", description: "no title", scenarios: [], preconditions: [], dataRequirements: [], nfrTags: [], confidence: 0.5 },
        ],
      });

      const generator = new CriteriaGenerator({
        ragPipeline: rag,
        repository: repo,
        generateWithLLM: vi.fn().mockResolvedValue(llmResponse),
      });

      const result = await generator.generateCriteria(appId);
      expect(result.criteriaCreated).toBe(1);
    });
  });

  describe("suggestCriteria", () => {
    it("should generate a single criterion from description", async () => {
      const rag = createMockRagPipeline();
      const llmResponse = JSON.stringify({
        criteria: [{
          title: "Suggested criterion",
          description: "Based on user description",
          scenarios: [{ given: "state", when: "action", then: "result" }],
          preconditions: ["pre"],
          dataRequirements: ["data"],
          nfrTags: ["usability"],
          confidence: 0.75,
        }],
      });

      const generator = new CriteriaGenerator({
        ragPipeline: rag,
        repository: repo,
        generateWithLLM: vi.fn().mockResolvedValue(llmResponse),
      });

      const result = await generator.suggestCriteria("User should be able to search products", appId);
      expect(result.title).toBe("Suggested criterion");
      expect(result.applicationId).toBe(appId);
      expect(result.confidence).toBe(0.75);
      expect(result.status).toBe("draft");
    });

    it("should create minimal criterion on parse failure", async () => {
      const rag = createMockRagPipeline();
      const generator = new CriteriaGenerator({
        ragPipeline: rag,
        repository: repo,
        generateWithLLM: vi.fn().mockResolvedValue("garbage response"),
      });

      const result = await generator.suggestCriteria("Search feature", appId);
      expect(result.title).toBe("Search feature");
      expect(result.confidence).toBe(0);
      expect(result.applicationId).toBe(appId);
    });
  });
});
