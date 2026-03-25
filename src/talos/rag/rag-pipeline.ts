/**
 * RAG Pipeline
 *
 * Orchestrates the retrieval-augmented generation pipeline:
 * Discovery → Chunking → Embedding → Storage → Retrieval
 */

import type { TalosChunkType } from "../types.js";
import type { VectorDbConfig, EmbeddingConfig } from "../config.js";
import { VectorStore, type VectorRecord, type VectorSearchResult, type HybridSearchOptions } from "./vector-store.js";
import { EmbeddingService } from "./embedding-service.js";
import type { ChunkResult } from "../discovery/file-chunker.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type RagPipelineOptions = {
  vectorDbConfig: VectorDbConfig;
  embeddingConfig: EmbeddingConfig;
  /** OpenAI API key for embeddings */
  openaiApiKey?: string;
};

export type RagContext = {
  chunks: VectorSearchResult[];
  totalTokens: number;
  query: string;
};

// ── RAG Pipeline ──────────────────────────────────────────────────────────────

export class RagPipeline {
  private vectorStore: VectorStore;
  private embeddingService: EmbeddingService;

  constructor(options: RagPipelineOptions) {
    this.vectorStore = new VectorStore({
      config: options.vectorDbConfig,
    });

    this.embeddingService = new EmbeddingService({
      config: options.embeddingConfig,
      apiKey: options.openaiApiKey,
    });
  }

  /**
   * Initialize the pipeline (connect to vector store).
   */
  async initialize(): Promise<void> {
    await this.vectorStore.initialize();
  }

  /**
   * Index chunks from discovery into the vector store.
   */
  async indexChunks(applicationId: string, chunks: ChunkResult[]): Promise<{
    indexed: number;
    skipped: number;
    totalTokens: number;
  }> {
    // Deduplicate chunks by content hash
    const uniqueChunks: ChunkResult[] = [];
    for (const chunk of chunks) {
      const exists = await this.vectorStore.exists(applicationId, chunk.contentHash);
      if (!exists) {
        uniqueChunks.push(chunk);
      }
    }

    if (uniqueChunks.length === 0) {
      return { indexed: 0, skipped: chunks.length, totalTokens: 0 };
    }

    // Generate embeddings
    const contents = uniqueChunks.map((c) => c.content);
    const embeddingResult = await this.embeddingService.embedBatch(contents);

    // Create vector records
    const records: VectorRecord[] = uniqueChunks.map((chunk, i) => ({
      id: crypto.randomUUID(),
      applicationId,
      content: chunk.content,
      filePath: chunk.filePath,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      type: chunk.type,
      contentHash: chunk.contentHash,
      metadata: chunk.metadata,
      vector: embeddingResult.embeddings[i],
    }));

    // Store in vector database
    await this.vectorStore.add(records);

    return {
      indexed: uniqueChunks.length,
      skipped: chunks.length - uniqueChunks.length,
      totalTokens: embeddingResult.totalTokens,
    };
  }

  /**
   * Retrieve relevant context for a query.
   */
  async retrieve(
    applicationId: string,
    query: string,
    options: {
      limit?: number;
      minScore?: number;
      type?: TalosChunkType;
    } = {}
  ): Promise<RagContext> {
    // Generate query embedding
    const queryEmbedding = await this.embeddingService.embed(query);

    // Search vector store
    const chunks = await this.vectorStore.search(
      queryEmbedding.embedding,
      applicationId,
      {
        limit: options.limit ?? 10,
        minScore: options.minScore ?? 0.5,
        type: options.type,
      }
    );

    return {
      chunks,
      totalTokens: queryEmbedding.tokenCount,
      query,
    };
  }

  /**
   * Semantic deduplication - find chunks similar to given content.
   */
  async findSimilar(
    applicationId: string,
    content: string,
    threshold = 0.95
  ): Promise<VectorSearchResult[]> {
    const embedding = await this.embeddingService.embed(content);

    return this.vectorStore.search(embedding.embedding, applicationId, {
      limit: 5,
      minScore: threshold,
    });
  }

  /**
   * Clear all indexed data for an application.
   */
  async clearApplication(applicationId: string): Promise<number> {
    return this.vectorStore.deleteByApplication(applicationId);
  }

  /**
   * Get statistics for an application's indexed data.
   */
  async getStats(applicationId: string): Promise<{
    totalChunks: number;
  }> {
    const totalChunks = await this.vectorStore.count(applicationId);
    return { totalChunks };
  }

  /**
   * Retrieve context using hybrid search with metadata filtering.
   */
  async retrieveWithFilters(
    applicationId: string,
    query: string,
    filters: HybridSearchOptions = {}
  ): Promise<RagContext> {
    const queryEmbedding = await this.embeddingService.embed(query);

    const chunks = await this.vectorStore.hybridSearch(
      applicationId,
      queryEmbedding.embedding,
      query,
      filters
    );

    return {
      chunks,
      totalTokens: queryEmbedding.tokenCount,
      query,
    };
  }
}
