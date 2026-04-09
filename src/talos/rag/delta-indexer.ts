/**
 * Delta Indexer (#484)
 *
 * Provides incremental re-indexing with content hash comparison.
 * Only re-indexes files whose content has changed since last indexing.
 */

import { createHash } from "crypto";
import type { RagPipeline } from "./rag-pipeline.js";
import type { VectorStore } from "./vector-store.js";
import type { ChunkResult } from "../discovery/file-chunker.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type FileHashEntry = {
  filePath: string;
  contentHash: string;
  lastIndexedAt: number;
  lastVerifiedAt: number;
};

export type DeltaResult = {
  newFiles: string[];
  changedFiles: string[];
  unchangedFiles: string[];
  deletedFiles: string[];
};

export type IndexDeltaResult = {
  indexed: number;
  skipped: number;
  deleted: number;
  verified: number;
  totalTokens: number;
};

export type FileHashStore = {
  getHash(applicationId: string, filePath: string): FileHashEntry | null;
  getAllHashes(applicationId: string): FileHashEntry[];
  upsertHash(applicationId: string, entry: FileHashEntry): void;
  deleteHash(applicationId: string, filePath: string): void;
};

export type DeltaIndexerOptions = {
  ragPipeline: RagPipeline;
  vectorStore: VectorStore;
  fileHashStore: FileHashStore;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

export function computeFileHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

// ── Delta Indexer ─────────────────────────────────────────────────────────────

export class DeltaIndexer {
  private ragPipeline: RagPipeline;
  private vectorStore: VectorStore;
  private fileHashStore: FileHashStore;

  constructor(options: DeltaIndexerOptions) {
    this.ragPipeline = options.ragPipeline;
    this.vectorStore = options.vectorStore;
    this.fileHashStore = options.fileHashStore;
  }

  /**
   * Compute the delta between current files and previously indexed files.
   */
  detectDelta(
    applicationId: string,
    currentFiles: Array<{ filePath: string; content: string }>
  ): DeltaResult {
    const existingHashes = this.fileHashStore.getAllHashes(applicationId);
    const existingMap = new Map(existingHashes.map((h) => [h.filePath, h]));
    const currentPaths = new Set(currentFiles.map((f) => f.filePath));

    const newFiles: string[] = [];
    const changedFiles: string[] = [];
    const unchangedFiles: string[] = [];

    for (const file of currentFiles) {
      const existing = existingMap.get(file.filePath);
      if (!existing) {
        newFiles.push(file.filePath);
      } else {
        const currentHash = computeFileHash(file.content);
        if (currentHash !== existing.contentHash) {
          changedFiles.push(file.filePath);
        } else {
          unchangedFiles.push(file.filePath);
        }
      }
    }

    const deletedFiles = existingHashes
      .filter((h) => !currentPaths.has(h.filePath))
      .map((h) => h.filePath);

    return { newFiles, changedFiles, unchangedFiles, deletedFiles };
  }

  /**
   * Apply delta: index new/changed files, verify unchanged, remove deleted.
   */
  async indexDelta(
    applicationId: string,
    delta: DeltaResult,
    chunkFn: (filePath: string) => Promise<ChunkResult[]>,
    contentFn: (filePath: string) => string
  ): Promise<IndexDeltaResult> {
    const now = Date.now();
    let totalIndexed = 0;
    let totalSkipped = 0;
    let totalDeleted = 0;
    let totalVerified = 0;
    let totalTokens = 0;

    // Index new files
    for (const filePath of delta.newFiles) {
      const chunks = await chunkFn(filePath);
      if (chunks.length > 0) {
        const result = await this.ragPipeline.indexChunks(applicationId, chunks);
        totalIndexed += result.indexed;
        totalSkipped += result.skipped;
        totalTokens += result.totalTokens;
      }
      this.fileHashStore.upsertHash(applicationId, {
        filePath,
        contentHash: computeFileHash(contentFn(filePath)),
        lastIndexedAt: now,
        lastVerifiedAt: now,
      });
    }

    // Re-index changed files (delete old, index new)
    for (const filePath of delta.changedFiles) {
      await this.vectorStore.deleteByFilePath(applicationId, filePath);
      const chunks = await chunkFn(filePath);
      if (chunks.length > 0) {
        const result = await this.ragPipeline.indexChunks(applicationId, chunks);
        totalIndexed += result.indexed;
        totalSkipped += result.skipped;
        totalTokens += result.totalTokens;
      }
      this.fileHashStore.upsertHash(applicationId, {
        filePath,
        contentHash: computeFileHash(contentFn(filePath)),
        lastIndexedAt: now,
        lastVerifiedAt: now,
      });
    }

    // Verify unchanged files (just update lastVerifiedAt)
    for (const filePath of delta.unchangedFiles) {
      const existing = this.fileHashStore.getHash(applicationId, filePath);
      if (existing) {
        this.fileHashStore.upsertHash(applicationId, {
          ...existing,
          lastVerifiedAt: now,
        });
        totalVerified++;
      }
    }

    // Remove deleted files
    for (const filePath of delta.deletedFiles) {
      const deleted = await this.vectorStore.deleteByFilePath(applicationId, filePath);
      totalDeleted += deleted;
      this.fileHashStore.deleteHash(applicationId, filePath);
    }

    return {
      indexed: totalIndexed,
      skipped: totalSkipped,
      deleted: totalDeleted,
      verified: totalVerified,
      totalTokens,
    };
  }
}
