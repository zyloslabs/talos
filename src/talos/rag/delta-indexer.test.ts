/**
 * Tests for DeltaIndexer (#484)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { DeltaIndexer, computeFileHash, type FileHashEntry, type FileHashStore } from "./delta-indexer.js";

// ── Mock Dependencies ─────────────────────────────────────────────────────────

const mockIndexChunks = vi.fn().mockResolvedValue({ indexed: 2, skipped: 0, totalTokens: 20 });
const mockDeleteByFilePath = vi.fn().mockResolvedValue(3);

const mockRagPipeline = {
  indexChunks: mockIndexChunks,
  initialize: vi.fn(),
  retrieve: vi.fn(),
  findSimilar: vi.fn(),
  clearApplication: vi.fn(),
  getStats: vi.fn(),
  retrieveWithFilters: vi.fn(),
} as unknown as ConstructorParameters<typeof DeltaIndexer>[0]["ragPipeline"];

const mockVectorStore = {
  deleteByFilePath: mockDeleteByFilePath,
  add: vi.fn(),
  search: vi.fn(),
  deleteByApplication: vi.fn(),
  count: vi.fn(),
  exists: vi.fn(),
  initialize: vi.fn(),
  hybridSearch: vi.fn(),
  updateVerifiedAt: vi.fn(),
} as unknown as ConstructorParameters<typeof DeltaIndexer>[0]["vectorStore"];

function createMockHashStore(): FileHashStore & { store: Map<string, FileHashEntry> } {
  const store = new Map<string, FileHashEntry>();
  return {
    store,
    getHash(applicationId: string, filePath: string) {
      return store.get(`${applicationId}:${filePath}`) ?? null;
    },
    getAllHashes(applicationId: string) {
      const entries: FileHashEntry[] = [];
      for (const [key, value] of store) {
        if (key.startsWith(`${applicationId}:`)) {
          entries.push(value);
        }
      }
      return entries;
    },
    upsertHash(applicationId: string, entry: FileHashEntry) {
      store.set(`${applicationId}:${entry.filePath}`, entry);
    },
    deleteHash(applicationId: string, filePath: string) {
      store.delete(`${applicationId}:${filePath}`);
    },
  };
}

describe("computeFileHash", () => {
  it("produces consistent SHA-256 hex digest", () => {
    const hash1 = computeFileHash("hello world");
    const hash2 = computeFileHash("hello world");
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it("produces different hashes for different content", () => {
    const hash1 = computeFileHash("hello");
    const hash2 = computeFileHash("world");
    expect(hash1).not.toBe(hash2);
  });
});

describe("DeltaIndexer", () => {
  let indexer: DeltaIndexer;
  let hashStore: ReturnType<typeof createMockHashStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    hashStore = createMockHashStore();
    indexer = new DeltaIndexer({
      ragPipeline: mockRagPipeline,
      vectorStore: mockVectorStore,
      fileHashStore: hashStore,
    });
  });

  describe("detectDelta", () => {
    it("detects new files", () => {
      const delta = indexer.detectDelta("app-1", [
        { filePath: "src/new.ts", content: "export const x = 1;" },
      ]);
      expect(delta.newFiles).toEqual(["src/new.ts"]);
      expect(delta.changedFiles).toEqual([]);
      expect(delta.unchangedFiles).toEqual([]);
      expect(delta.deletedFiles).toEqual([]);
    });

    it("detects unchanged files", () => {
      const content = "export const x = 1;";
      hashStore.upsertHash("app-1", {
        filePath: "src/existing.ts",
        contentHash: computeFileHash(content),
        lastIndexedAt: Date.now(),
        lastVerifiedAt: Date.now(),
      });

      const delta = indexer.detectDelta("app-1", [
        { filePath: "src/existing.ts", content },
      ]);
      expect(delta.unchangedFiles).toEqual(["src/existing.ts"]);
      expect(delta.changedFiles).toEqual([]);
      expect(delta.newFiles).toEqual([]);
    });

    it("detects changed files", () => {
      hashStore.upsertHash("app-1", {
        filePath: "src/changed.ts",
        contentHash: computeFileHash("old content"),
        lastIndexedAt: Date.now(),
        lastVerifiedAt: Date.now(),
      });

      const delta = indexer.detectDelta("app-1", [
        { filePath: "src/changed.ts", content: "new content" },
      ]);
      expect(delta.changedFiles).toEqual(["src/changed.ts"]);
      expect(delta.unchangedFiles).toEqual([]);
    });

    it("detects deleted files", () => {
      hashStore.upsertHash("app-1", {
        filePath: "src/deleted.ts",
        contentHash: computeFileHash("old"),
        lastIndexedAt: Date.now(),
        lastVerifiedAt: Date.now(),
      });

      const delta = indexer.detectDelta("app-1", []);
      expect(delta.deletedFiles).toEqual(["src/deleted.ts"]);
    });

    it("handles mixed delta with all types", () => {
      const existingContent = "existing";
      hashStore.upsertHash("app-1", {
        filePath: "src/unchanged.ts",
        contentHash: computeFileHash(existingContent),
        lastIndexedAt: Date.now(),
        lastVerifiedAt: Date.now(),
      });
      hashStore.upsertHash("app-1", {
        filePath: "src/changed.ts",
        contentHash: computeFileHash("old-version"),
        lastIndexedAt: Date.now(),
        lastVerifiedAt: Date.now(),
      });
      hashStore.upsertHash("app-1", {
        filePath: "src/deleted.ts",
        contentHash: computeFileHash("gone"),
        lastIndexedAt: Date.now(),
        lastVerifiedAt: Date.now(),
      });

      const delta = indexer.detectDelta("app-1", [
        { filePath: "src/unchanged.ts", content: existingContent },
        { filePath: "src/changed.ts", content: "new-version" },
        { filePath: "src/new.ts", content: "brand new" },
      ]);

      expect(delta.newFiles).toEqual(["src/new.ts"]);
      expect(delta.changedFiles).toEqual(["src/changed.ts"]);
      expect(delta.unchangedFiles).toEqual(["src/unchanged.ts"]);
      expect(delta.deletedFiles).toEqual(["src/deleted.ts"]);
    });
  });

  describe("indexDelta", () => {
    const mockChunkFn = vi.fn().mockResolvedValue([
      {
        content: "chunk content",
        filePath: "src/file.ts",
        startLine: 1,
        endLine: 10,
        type: "code" as const,
        contentHash: "abc123",
        metadata: {},
      },
    ]);
    const mockContentFn = vi.fn().mockReturnValue("file content");

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("indexes new files", async () => {
      const delta = {
        newFiles: ["src/new.ts"],
        changedFiles: [],
        unchangedFiles: [],
        deletedFiles: [],
      };

      const result = await indexer.indexDelta("app-1", delta, mockChunkFn, mockContentFn);

      expect(mockChunkFn).toHaveBeenCalledWith("src/new.ts");
      expect(mockIndexChunks).toHaveBeenCalledOnce();
      expect(result.indexed).toBe(2);
      expect(result.totalTokens).toBe(20);
      expect(hashStore.getHash("app-1", "src/new.ts")).not.toBeNull();
    });

    it("re-indexes changed files after deleting old chunks", async () => {
      const delta = {
        newFiles: [],
        changedFiles: ["src/changed.ts"],
        unchangedFiles: [],
        deletedFiles: [],
      };

      const result = await indexer.indexDelta("app-1", delta, mockChunkFn, mockContentFn);

      expect(mockDeleteByFilePath).toHaveBeenCalledWith("app-1", "src/changed.ts");
      expect(mockIndexChunks).toHaveBeenCalledOnce();
      expect(result.indexed).toBe(2);
      expect(hashStore.getHash("app-1", "src/changed.ts")).not.toBeNull();
    });

    it("verifies unchanged files by updating lastVerifiedAt", async () => {
      hashStore.upsertHash("app-1", {
        filePath: "src/unchanged.ts",
        contentHash: "hash123",
        lastIndexedAt: 1000,
        lastVerifiedAt: 1000,
      });

      const delta = {
        newFiles: [],
        changedFiles: [],
        unchangedFiles: ["src/unchanged.ts"],
        deletedFiles: [],
      };

      const result = await indexer.indexDelta("app-1", delta, mockChunkFn, mockContentFn);

      expect(result.verified).toBe(1);
      expect(result.indexed).toBe(0);
      const entry = hashStore.getHash("app-1", "src/unchanged.ts");
      expect(entry).not.toBeNull();
      expect(entry!.lastVerifiedAt).toBeGreaterThan(1000);
    });

    it("removes deleted files from vector store and hash store", async () => {
      hashStore.upsertHash("app-1", {
        filePath: "src/deleted.ts",
        contentHash: "hash123",
        lastIndexedAt: 1000,
        lastVerifiedAt: 1000,
      });

      const delta = {
        newFiles: [],
        changedFiles: [],
        unchangedFiles: [],
        deletedFiles: ["src/deleted.ts"],
      };

      const result = await indexer.indexDelta("app-1", delta, mockChunkFn, mockContentFn);

      expect(mockDeleteByFilePath).toHaveBeenCalledWith("app-1", "src/deleted.ts");
      expect(result.deleted).toBe(3);
      expect(hashStore.getHash("app-1", "src/deleted.ts")).toBeNull();
    });

    it("handles empty delta gracefully", async () => {
      const delta = {
        newFiles: [],
        changedFiles: [],
        unchangedFiles: [],
        deletedFiles: [],
      };

      const result = await indexer.indexDelta("app-1", delta, mockChunkFn, mockContentFn);

      expect(result.indexed).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.deleted).toBe(0);
      expect(result.verified).toBe(0);
      expect(result.totalTokens).toBe(0);
    });

    it("handles files with no chunks", async () => {
      const emptyChunkFn = vi.fn().mockResolvedValue([]);
      const delta = {
        newFiles: ["src/empty.ts"],
        changedFiles: [],
        unchangedFiles: [],
        deletedFiles: [],
      };

      const result = await indexer.indexDelta("app-1", delta, emptyChunkFn, mockContentFn);

      expect(mockIndexChunks).not.toHaveBeenCalled();
      expect(result.indexed).toBe(0);
      // Hash should still be stored to track the file
      expect(hashStore.getHash("app-1", "src/empty.ts")).not.toBeNull();
    });
  });
});
