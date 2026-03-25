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
  /** Source document ID */
  docId?: string;
  /** Document version */
  sourceVersion?: string;
  /** Confidence score (0-1) */
  confidence?: number;
  /** Tags for filtering */
  tags?: string[];
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
  docId?: string;
  sourceVersion?: string;
  confidence?: number;
  tags?: string[];
};

export type VectorStoreOptions = {
  config: VectorDbConfig;
};

export type HybridSearchOptions = {
  /** Filter by chunk types */
  types?: string[];
  /** Filter by tags */
  tags?: string[];
  /** Filter by document type (stored in metadata.docType) */
  docType?: string;
  /** Filter by persona tag */
  persona?: string;
  /** Minimum confidence score */
  minConfidence?: number;
  /** Maximum results */
  limit?: number;
};

// ── Vector Store ──────────────────────────────────────────────────────────────

/** Validates that a string is safe for use in LanceDB filter expressions (alphanumeric, hyphens, underscores). */
function validateFilterValue(value: string, name: string): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
    throw new Error(`Invalid ${name}: must be alphanumeric with hyphens/underscores only`);
  }
}

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

  /**
   * Hybrid search combining vector similarity with keyword matching and metadata filtering.
   */
  async hybridSearch(
    applicationId: string,
    queryVector: number[],
    queryText: string,
    options: HybridSearchOptions = {}
  ): Promise<VectorSearchResult[]> {
    await this.ensureInitialized();

    // Step 1: Vector search with generous limit for re-ranking
    const vectorLimit = (options.limit ?? 10) * 3;
    const vectorResults = await this.search(queryVector, applicationId, {
      limit: vectorLimit,
      minScore: 0.3,
    });

    // Step 2: Keyword boosting
    const keywords = queryText.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const scored = vectorResults.map((r) => {
      const contentLower = r.content.toLowerCase();
      let keywordHits = 0;
      for (const kw of keywords) {
        if (contentLower.includes(kw)) keywordHits++;
      }
      const keywordBoost = keywords.length > 0 ? (keywordHits / keywords.length) * 0.2 : 0;
      return { ...r, score: r.score + keywordBoost };
    });

    // Step 3: Metadata filtering
    const filtered = scored.filter((r) => {
      if (options.types && options.types.length > 0 && !options.types.includes(r.type)) return false;
      if (options.minConfidence !== undefined && (r.confidence === undefined || r.confidence < options.minConfidence)) return false;
      if (options.tags && options.tags.length > 0) {
        const itemTags = r.tags ?? [];
        if (!options.tags.some((t) => itemTags.includes(t))) return false;
      }
      if (options.docType) {
        const docType = r.metadata?.docType as string | undefined;
        if (docType !== options.docType) return false;
      }
      if (options.persona) {
        const itemTags = r.tags ?? [];
        if (!itemTags.includes(options.persona)) return false;
      }
      return true;
    });

    // Step 4: Sort by score descending and limit
    filtered.sort((a, b) => b.score - a.score);
    return filtered.slice(0, options.limit ?? 10);
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
      doc_id: r.docId ?? "",
      source_version: r.sourceVersion ?? "",
      confidence: r.confidence ?? -1,
      tags: JSON.stringify(r.tags ?? []),
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

    validateFilterValue(applicationId, "applicationId");
    if (options.type) validateFilterValue(options.type, "type");

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
      doc_id?: string;
      source_version?: string;
      confidence?: number;
      tags?: string;
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
        docId: r.doc_id && r.doc_id !== "" ? r.doc_id : undefined,
        sourceVersion: r.source_version && r.source_version !== "" ? r.source_version : undefined,
        confidence: r.confidence !== undefined && r.confidence >= 0 ? r.confidence : undefined,
        tags: r.tags ? (JSON.parse(r.tags) as string[]) : undefined,
      }))
      .filter((r) => !options.minScore || r.score >= options.minScore);
  }

  private async deleteByApplicationLanceDB(applicationId: string): Promise<number> {
    if (!this.table) return 0;

    validateFilterValue(applicationId, "applicationId");
    const countBefore = await this.countLanceDB(applicationId);
    await (this.table as { delete: (condition: string) => Promise<void> })
      .delete(`application_id = '${applicationId}'`);
    return countBefore;
  }

  private async countLanceDB(applicationId: string): Promise<number> {
    if (!this.table) return 0;

    validateFilterValue(applicationId, "applicationId");
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

    validateFilterValue(applicationId, "applicationId");
    validateFilterValue(contentHash, "contentHash");
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
