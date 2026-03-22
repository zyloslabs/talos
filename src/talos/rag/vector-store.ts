/**
 * Vector Store
 *
 * LanceDB-based vector storage for RAG retrieval.
 */

import type { VectorDbConfig } from "../config.js";
import type { TalosChunkType } from "../types.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type VectorRecord = {
  id: string;
  applicationId: string;
  content: string;
  filePath: string;
  startLine: number;
  endLine: number;
  type: TalosChunkType;
  contentHash: string;
  metadata: Record<string, unknown>;
  vector: number[];
};

export type VectorSearchResult = {
  id: string;
  content: string;
  filePath: string;
  startLine: number;
  endLine: number;
  type: TalosChunkType;
  score: number;
  metadata: Record<string, unknown>;
};

export type VectorStoreOptions = {
  config: VectorDbConfig;
};

// ── Vector Store ──────────────────────────────────────────────────────────────

export class VectorStore {
  private config: VectorDbConfig;
  private db: unknown = null;
  private table: unknown = null;
  private initialized = false;

  constructor(options: VectorStoreOptions) {
    this.config = options.config;
  }

  /**
   * Initialize the vector store connection.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.config.type === "lancedb") {
      await this.initLanceDB();
    } else {
      throw new Error(`Unsupported vector database type: ${this.config.type}`);
    }

    this.initialized = true;
  }

  /**
   * Add vectors to the store.
   */
  async add(records: VectorRecord[]): Promise<void> {
    await this.ensureInitialized();

    if (this.config.type === "lancedb") {
      await this.addLanceDB(records);
    }
  }

  /**
   * Search for similar vectors.
   */
  async search(
    queryVector: number[],
    applicationId: string,
    options: {
      limit?: number;
      minScore?: number;
      type?: TalosChunkType;
    } = {}
  ): Promise<VectorSearchResult[]> {
    await this.ensureInitialized();

    if (this.config.type === "lancedb") {
      return this.searchLanceDB(queryVector, applicationId, options);
    }

    return [];
  }

  /**
   * Delete all vectors for an application.
   */
  async deleteByApplication(applicationId: string): Promise<number> {
    await this.ensureInitialized();

    if (this.config.type === "lancedb") {
      return this.deleteByApplicationLanceDB(applicationId);
    }

    return 0;
  }

  /**
   * Get count of vectors for an application.
   */
  async count(applicationId: string): Promise<number> {
    await this.ensureInitialized();

    if (this.config.type === "lancedb") {
      return this.countLanceDB(applicationId);
    }

    return 0;
  }

  /**
   * Check if a content hash already exists (for deduplication).
   */
  async exists(applicationId: string, contentHash: string): Promise<boolean> {
    await this.ensureInitialized();

    if (this.config.type === "lancedb") {
      return this.existsLanceDB(applicationId, contentHash);
    }

    return false;
  }

  // ── LanceDB Implementation ──────────────────────────────────────────────────

  private async initLanceDB(): Promise<void> {
    // Dynamic import for LanceDB
    const lancedb = await import("@lancedb/lancedb");
    
    // Expand path
    const dbPath = this.config.path.replace("~", process.env.HOME ?? "");
    
    // Connect to database
    this.db = await lancedb.connect(dbPath);

    // Create or open table
    try {
      this.table = await (this.db as { openTable: (name: string) => Promise<unknown> }).openTable(this.config.collectionName);
    } catch {
      // Table doesn't exist, will be created on first add
      this.table = null;
    }
  }

  private async addLanceDB(records: VectorRecord[]): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    const data = records.map((r) => ({
      id: r.id,
      application_id: r.applicationId,
      content: r.content,
      file_path: r.filePath,
      start_line: r.startLine,
      end_line: r.endLine,
      type: r.type,
      content_hash: r.contentHash,
      metadata: JSON.stringify(r.metadata),
      vector: r.vector,
    }));

    if (!this.table) {
      // Create table with first batch
      this.table = await (this.db as { createTable: (name: string, data: unknown[]) => Promise<unknown> })
        .createTable(this.config.collectionName, data);
    } else {
      // Add to existing table
      await (this.table as { add: (data: unknown[]) => Promise<void> }).add(data);
    }
  }

  private async searchLanceDB(
    queryVector: number[],
    applicationId: string,
    options: { limit?: number; minScore?: number; type?: TalosChunkType }
  ): Promise<VectorSearchResult[]> {
    if (!this.table) return [];

    const limit = options.limit ?? 10;

    // Build query
    const query = (this.table as { 
      search: (vector: number[]) => { 
        limit: (n: number) => { 
          where: (condition: string) => {
            toArray: () => Promise<unknown[]>;
          };
          toArray: () => Promise<unknown[]>;
        };
      };
    }).search(queryVector).limit(limit);

    // Add filter for application
    let filterCondition = `application_id = '${applicationId}'`;
    if (options.type) {
      filterCondition += ` AND type = '${options.type}'`;
    }

    const results = await query.where(filterCondition).toArray() as Array<{
      id: string;
      content: string;
      file_path: string;
      start_line: number;
      end_line: number;
      type: TalosChunkType;
      metadata: string;
      _distance: number;
    }>;

    return results
      .map((r) => ({
        id: r.id,
        content: r.content,
        filePath: r.file_path,
        startLine: r.start_line,
        endLine: r.end_line,
        type: r.type,
        score: 1 - r._distance, // Convert distance to similarity
        metadata: JSON.parse(r.metadata) as Record<string, unknown>,
      }))
      .filter((r) => !options.minScore || r.score >= options.minScore);
  }

  private async deleteByApplicationLanceDB(applicationId: string): Promise<number> {
    if (!this.table) return 0;

    const countBefore = await this.countLanceDB(applicationId);
    await (this.table as { delete: (condition: string) => Promise<void> })
      .delete(`application_id = '${applicationId}'`);
    return countBefore;
  }

  private async countLanceDB(applicationId: string): Promise<number> {
    if (!this.table) return 0;

    const results = await (this.table as { 
      filter: (condition: string) => { 
        select: (columns: string[]) => {
          toArray: () => Promise<unknown[]>;
        };
      };
    }).filter(`application_id = '${applicationId}'`).select(["id"]).toArray();

    return results.length;
  }

  private async existsLanceDB(applicationId: string, contentHash: string): Promise<boolean> {
    if (!this.table) return false;

    const results = await (this.table as {
      filter: (condition: string) => {
        select: (columns: string[]) => {
          limit: (n: number) => {
            toArray: () => Promise<unknown[]>;
          };
        };
      };
    }).filter(`application_id = '${applicationId}' AND content_hash = '${contentHash}'`)
      .select(["id"])
      .limit(1)
      .toArray();

    return results.length > 0;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}
