/**
 * Tests for RagPipeline
 * Covers: initialize, indexChunks, retrieve, findSimilar, clearApplication, getStats
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { RagPipeline } from "./rag-pipeline.js";

// Mock the dependencies
vi.mock("./vector-store.js", () => ({
  VectorStore: class MockVectorStore {
    initialize = vi.fn().mockResolvedValue(undefined);
    add = vi.fn().mockResolvedValue(undefined);
    search = vi.fn().mockResolvedValue([]);
    deleteByApplication = vi.fn().mockResolvedValue(5);
    count = vi.fn().mockResolvedValue(10);
    exists = vi.fn().mockResolvedValue(false);
  },
}));

vi.mock("./embedding-service.js", () => ({
  EmbeddingService: class MockEmbeddingService {
    embed = vi.fn().mockResolvedValue({ embedding: [0.1, 0.2, 0.3], model: "m", tokenCount: 5 });
    embedBatch = vi.fn().mockResolvedValue({ embeddings: [[0.1], [0.2]], model: "m", totalTokens: 10 });
  },
}));

const pipelineOpts = {
  vectorDbConfig: { type: "lancedb" as const, path: "/tmp/db", collectionName: "v", topK: 10 },
  embeddingConfig: { provider: "openai" as const, model: "text-embedding-3-small", dimensions: 256, batchSize: 10 },
  openaiApiKey: "sk-test",
};

describe("RagPipeline", () => {
  let pipeline: RagPipeline;

  beforeEach(() => {
    vi.clearAllMocks();
    pipeline = new RagPipeline(pipelineOpts);
  });

  it("initialize calls vector store initialize", async () => {
    await pipeline.initialize();
    // Access the mocked vector store
    const vs = (pipeline as unknown as { vectorStore: { initialize: ReturnType<typeof vi.fn> } }).vectorStore;
    expect(vs.initialize).toHaveBeenCalled();
  });

  it("indexChunks embeds and stores unique chunks", async () => {
    const vs = (pipeline as unknown as { vectorStore: { exists: ReturnType<typeof vi.fn>; add: ReturnType<typeof vi.fn> } }).vectorStore;
    vs.exists.mockResolvedValue(false);

    const result = await pipeline.indexChunks("app-1", [
      { content: "fn a() {}", filePath: "/a.ts", startLine: 1, endLine: 5, type: "code" as const, contentHash: "h1", metadata: {} },
      { content: "fn b() {}", filePath: "/b.ts", startLine: 1, endLine: 5, type: "code" as const, contentHash: "h2", metadata: {} },
    ]);

    expect(result.indexed).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.totalTokens).toBe(10);
    expect(vs.add).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ applicationId: "app-1", content: "fn a() {}" }),
    ]));
  });

  it("indexChunks skips already-existing chunks", async () => {
    const vs = (pipeline as unknown as { vectorStore: { exists: ReturnType<typeof vi.fn>; add: ReturnType<typeof vi.fn> } }).vectorStore;
    vs.exists.mockResolvedValue(true);

    const result = await pipeline.indexChunks("app-1", [
      { content: "fn a() {}", filePath: "/a.ts", startLine: 1, endLine: 5, type: "code" as const, contentHash: "h1", metadata: {} },
    ]);

    expect(result.indexed).toBe(0);
    expect(result.skipped).toBe(1);
    expect(vs.add).not.toHaveBeenCalled();
  });

  it("retrieve embeds query and searches vector store", async () => {
    const vs = (pipeline as unknown as { vectorStore: { search: ReturnType<typeof vi.fn> } }).vectorStore;
    vs.search.mockResolvedValue([
      { id: "1", content: "found", filePath: "/x.ts", startLine: 1, endLine: 5, type: "source", score: 0.9, metadata: {} },
    ]);

    const result = await pipeline.retrieve("app-1", "how does login work?", { limit: 5, minScore: 0.7 });
    expect(result.chunks).toHaveLength(1);
    expect(result.query).toBe("how does login work?");
    expect(result.totalTokens).toBe(5);
    expect(vs.search).toHaveBeenCalledWith([0.1, 0.2, 0.3], "app-1", { limit: 5, minScore: 0.7, type: undefined });
  });

  it("retrieve uses defaults", async () => {
    const vs = (pipeline as unknown as { vectorStore: { search: ReturnType<typeof vi.fn> } }).vectorStore;
    vs.search.mockResolvedValue([]);

    const result = await pipeline.retrieve("app-1", "query");
    expect(result.chunks).toEqual([]);
    expect(vs.search).toHaveBeenCalledWith(expect.any(Array), "app-1", { limit: 10, minScore: 0.5, type: undefined });
  });

  it("findSimilar embeds content and searches with threshold", async () => {
    const vs = (pipeline as unknown as { vectorStore: { search: ReturnType<typeof vi.fn> } }).vectorStore;
    vs.search.mockResolvedValue([]);

    await pipeline.findSimilar("app-1", "some code", 0.95);
    expect(vs.search).toHaveBeenCalledWith([0.1, 0.2, 0.3], "app-1", { limit: 5, minScore: 0.95 });
  });

  it("clearApplication delegates to vector store", async () => {
    const result = await pipeline.clearApplication("app-1");
    expect(result).toBe(5);
  });

  it("getStats returns chunk count", async () => {
    const stats = await pipeline.getStats("app-1");
    expect(stats.totalChunks).toBe(10);
  });

  // ── retrieveWithFilters (#284) ──────────────────────────────────────────────

  describe("retrieveWithFilters", () => {
    it("calls vectorStore.hybridSearch and returns RagContext", async () => {
      const vs = (pipeline as unknown as { vectorStore: { hybridSearch: ReturnType<typeof vi.fn> } }).vectorStore;
      vs.hybridSearch = vi.fn().mockResolvedValue([
        { id: "1", content: "req", filePath: "/r.md", startLine: 1, endLine: 5, type: "requirement", score: 0.9, metadata: {} },
      ]);

      const result = await pipeline.retrieveWithFilters("app-1", "search query", {
        types: ["requirement"],
        tags: ["security"],
      });

      expect(result.chunks).toHaveLength(1);
      expect(result.query).toBe("search query");
      expect(result.totalTokens).toBe(5);
      expect(vs.hybridSearch).toHaveBeenCalledWith(
        "app-1",
        [0.1, 0.2, 0.3],
        "search query",
        { types: ["requirement"], tags: ["security"] }
      );
    });

    it("passes empty filters as default", async () => {
      const vs = (pipeline as unknown as { vectorStore: { hybridSearch: ReturnType<typeof vi.fn> } }).vectorStore;
      vs.hybridSearch = vi.fn().mockResolvedValue([]);

      const result = await pipeline.retrieveWithFilters("app-1", "query");
      expect(result.chunks).toEqual([]);
      expect(vs.hybridSearch).toHaveBeenCalledWith("app-1", expect.any(Array), "query", {});
    });
  });
});
