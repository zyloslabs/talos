/**
 * Tests for EmbeddingService
 * Covers: cosine similarity (pure math), constructor, error paths
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { EmbeddingService } from "./embedding-service.js";

const mockConfig = { provider: "openai" as const, model: "text-embedding-3-small", dimensions: 256, batchSize: 10 };

describe("EmbeddingService", () => {
  afterEach(() => { vi.restoreAllMocks(); });
  describe("cosineSimilarity", () => {
    it("returns 1 for identical vectors", () => {
      const svc = new EmbeddingService({ config: mockConfig });
      expect(svc.cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
    });

    it("returns 0 for orthogonal vectors", () => {
      const svc = new EmbeddingService({ config: mockConfig });
      expect(svc.cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    });

    it("returns -1 for opposite vectors", () => {
      const svc = new EmbeddingService({ config: mockConfig });
      expect(svc.cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
    });

    it("handles zero vectors gracefully", () => {
      const svc = new EmbeddingService({ config: mockConfig });
      expect(svc.cosineSimilarity([0, 0], [0, 0])).toBe(0);
    });

    it("throws on dimension mismatch", () => {
      const svc = new EmbeddingService({ config: mockConfig });
      expect(() => svc.cosineSimilarity([1], [1, 2])).toThrow("dimensions must match");
    });
  });

  describe("embed", () => {
    it("throws without API key", async () => {
      const svc = new EmbeddingService({ config: mockConfig });
      await expect(svc.embed("hello")).rejects.toThrow("API key not configured");
    });

    it("calls OpenAI and returns embedding", async () => {
      const svc = new EmbeddingService({ config: mockConfig, apiKey: "sk-test" });
      const mockResponse = {
        ok: true,
        json: async () => ({
          data: [{ embedding: [0.1, 0.2, 0.3] }],
          model: "text-embedding-3-small",
          usage: { total_tokens: 5 },
        }),
      };
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse as Response);

      const result = await svc.embed("hello");
      expect(result.embedding).toEqual([0.1, 0.2, 0.3]);
      expect(result.model).toBe("text-embedding-3-small");
      expect(result.tokenCount).toBe(5);
    });

    it("throws on non-ok response", async () => {
      const svc = new EmbeddingService({ config: mockConfig, apiKey: "sk-test" });
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: false, status: 401, text: async () => "Unauthorized",
      } as Response);

      await expect(svc.embed("hello")).rejects.toThrow("401");
    });

    it("throws for unsupported provider", async () => {
      const svc = new EmbeddingService({ config: { ...mockConfig, provider: "local" as "openai" } });
      await expect(svc.embed("hello")).rejects.toThrow("Unsupported embedding provider");
    });
  });

  describe("embedBatch", () => {
    it("throws without API key", async () => {
      const svc = new EmbeddingService({ config: mockConfig });
      await expect(svc.embedBatch(["a"])).rejects.toThrow("API key not configured");
    });

    it("batches texts and returns embeddings", async () => {
      const svc = new EmbeddingService({ config: { ...mockConfig, batchSize: 2 }, apiKey: "sk-test" });
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      // Two batches needed for 3 texts with batchSize 2
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ embedding: [0.1], index: 0 }, { embedding: [0.2], index: 1 }],
          model: "m", usage: { total_tokens: 10 },
        }),
      } as Response);
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ embedding: [0.3], index: 0 }],
          model: "m", usage: { total_tokens: 5 },
        }),
      } as Response);

      const result = await svc.embedBatch(["a", "b", "c"]);
      expect(result.embeddings).toEqual([[0.1], [0.2], [0.3]]);
      expect(result.totalTokens).toBe(15);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("throws on non-ok batch response", async () => {
      const svc = new EmbeddingService({ config: mockConfig, apiKey: "sk-test" });
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: false, status: 500, text: async () => "Server Error",
      } as Response);
      await expect(svc.embedBatch(["a"])).rejects.toThrow("500");
    });

    it("throws for unsupported provider on batch", async () => {
      const svc = new EmbeddingService({ config: { ...mockConfig, provider: "local" as "openai" } });
      await expect(svc.embedBatch(["a"])).rejects.toThrow("Unsupported embedding provider");
    });

    it("sorts batch results by index", async () => {
      const svc = new EmbeddingService({ config: mockConfig, apiKey: "sk-test" });
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ embedding: [0.2], index: 1 }, { embedding: [0.1], index: 0 }],
          model: "m", usage: { total_tokens: 5 },
        }),
      } as Response);

      const result = await svc.embedBatch(["a", "b"]);
      expect(result.embeddings).toEqual([[0.1], [0.2]]);
    });
  });
});
