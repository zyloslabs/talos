/**
 * Embedding Service
 *
 * Generates embeddings using OpenAI or local models.
 */

import type { EmbeddingConfig } from "../config.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type EmbeddingResult = {
  embedding: number[];
  model: string;
  tokenCount: number;
};

export type BatchEmbeddingResult = {
  embeddings: number[][];
  model: string;
  totalTokens: number;
};

export type EmbeddingServiceOptions = {
  config: EmbeddingConfig;
  /** OpenAI API key */
  apiKey?: string;
};

// ── Embedding Service ─────────────────────────────────────────────────────────

export class EmbeddingService {
  private config: EmbeddingConfig;
  private apiKey: string | undefined;

  constructor(options: EmbeddingServiceOptions) {
    this.config = options.config;
    this.apiKey = options.apiKey;
  }

  /**
   * Generate embedding for a single text.
   */
  async embed(text: string): Promise<EmbeddingResult> {
    if (this.config.provider === "openai") {
      return this.embedOpenAI(text);
    }
    if (this.config.provider === "github-models") {
      return this.embedGitHubModels(text);
    }
    throw new Error(`Unsupported embedding provider: ${this.config.provider}`);
  }

  /**
   * Generate embeddings for multiple texts.
   */
  async embedBatch(texts: string[]): Promise<BatchEmbeddingResult> {
    if (this.config.provider === "openai") {
      return this.embedBatchOpenAI(texts);
    }
    if (this.config.provider === "github-models") {
      return this.embedBatchGitHubModels(texts);
    }
    throw new Error(`Unsupported embedding provider: ${this.config.provider}`);
  }

  /**
   * Compute cosine similarity between two embeddings.
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error("Embedding dimensions must match");
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  // ── GitHub Models Implementation ──────────────────────────────────────────

  private async embedGitHubModels(text: string): Promise<EmbeddingResult> {
    if (!this.apiKey) {
      throw new Error("GitHub token (API key) not configured");
    }

    const response = await fetch("https://models.github.ai/inference/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "X-GitHub-Api-Version": "2026-03-10",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/text-embedding-3-small",
        input: [text],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GitHub Models embeddings API error: ${response.status} ${error}`);
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[] }>;
      model: string;
      usage: { total_tokens: number };
    };

    return {
      embedding: data.data[0].embedding,
      model: data.model,
      tokenCount: data.usage.total_tokens,
    };
  }

  private async embedBatchGitHubModels(texts: string[]): Promise<BatchEmbeddingResult> {
    if (!this.apiKey) {
      throw new Error("GitHub token (API key) not configured");
    }

    // Split into batches
    const batches: string[][] = [];
    for (let i = 0; i < texts.length; i += this.config.batchSize) {
      batches.push(texts.slice(i, i + this.config.batchSize));
    }

    const allEmbeddings: number[][] = [];
    let totalTokens = 0;
    let model = "";

    for (const batch of batches) {
      const response = await fetch("https://models.github.ai/inference/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "X-GitHub-Api-Version": "2026-03-10",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/text-embedding-3-small",
          input: batch,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`GitHub Models embeddings API error: ${response.status} ${error}`);
      }

      const data = (await response.json()) as {
        data: Array<{ embedding: number[]; index: number }>;
        model: string;
        usage: { total_tokens: number };
      };

      // Sort by index to maintain order
      const sortedData = data.data.sort((a, b) => a.index - b.index);
      allEmbeddings.push(...sortedData.map((d) => d.embedding));
      totalTokens += data.usage.total_tokens;
      model = data.model;
    }

    return {
      embeddings: allEmbeddings,
      model,
      totalTokens,
    };
  }

  // ── OpenAI Implementation ───────────────────────────────────────────────────

  private async embedOpenAI(text: string): Promise<EmbeddingResult> {
    if (!this.apiKey) {
      throw new Error("OpenAI API key not configured");
    }

    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        input: text,
        dimensions: this.config.dimensions,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI embedding error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[] }>;
      model: string;
      usage: { total_tokens: number };
    };

    return {
      embedding: data.data[0].embedding,
      model: data.model,
      tokenCount: data.usage.total_tokens,
    };
  }

  private async embedBatchOpenAI(texts: string[]): Promise<BatchEmbeddingResult> {
    if (!this.apiKey) {
      throw new Error("OpenAI API key not configured");
    }

    // Split into batches
    const batches: string[][] = [];
    for (let i = 0; i < texts.length; i += this.config.batchSize) {
      batches.push(texts.slice(i, i + this.config.batchSize));
    }

    const allEmbeddings: number[][] = [];
    let totalTokens = 0;
    let model = "";

    for (const batch of batches) {
      const response = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          input: batch,
          dimensions: this.config.dimensions,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI embedding error: ${response.status} - ${error}`);
      }

      const data = (await response.json()) as {
        data: Array<{ embedding: number[]; index: number }>;
        model: string;
        usage: { total_tokens: number };
      };

      // Sort by index to maintain order
      const sortedData = data.data.sort((a, b) => a.index - b.index);
      allEmbeddings.push(...sortedData.map((d) => d.embedding));
      totalTokens += data.usage.total_tokens;
      model = data.model;
    }

    return {
      embeddings: allEmbeddings,
      model,
      totalTokens,
    };
  }
}
