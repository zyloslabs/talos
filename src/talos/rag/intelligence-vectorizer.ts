/**
 * Intelligence Vectorizer (#481)
 *
 * Chunks and indexes App Intelligence report data into the RAG pipeline
 * so that semantic search can find tech stack, databases, test users, etc.
 */

import { createHash } from "crypto";
import type { AppIntelligenceReport, TalosChunkType } from "../types.js";
import type { RagPipeline } from "./rag-pipeline.js";
import type { ChunkResult } from "../discovery/file-chunker.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type IntelligenceVectorizerOptions = {
  ragPipeline: RagPipeline;
};

export type VectorizeIntelligenceResult = {
  chunksIndexed: number;
  chunksSkipped: number;
  totalTokens: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function contentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function formatTechStack(items: AppIntelligenceReport["techStack"]): string {
  if (items.length === 0) return "";
  const lines = items.map(
    (item) =>
      `- ${item.name} (${item.category}): ${item.version ?? "unknown version"}, source: ${item.source}`
  );
  return `# Technology Stack\n\n${lines.join("\n")}`;
}

function formatDatabases(items: AppIntelligenceReport["databases"]): string {
  if (items.length === 0) return "";
  const lines = items.map(
    (item) => `- ${item.type}: pattern=${item.connectionPattern}, source: ${item.source}`
  );
  return `# Databases\n\n${lines.join("\n")}`;
}

function formatTestUsers(items: AppIntelligenceReport["testUsers"]): string {
  if (items.length === 0) return "";
  const lines = items.map(
    (item) => `- ${item.variableName} (${item.roleHint ?? "default"}): ${item.source}`
  );
  return `# Test Users\n\n${lines.join("\n")}`;
}

function formatDocumentation(items: AppIntelligenceReport["documentation"]): string {
  if (items.length === 0) return "";
  const lines = items.map(
    (item) => `- ${item.title ?? item.filePath} (${item.type}): ${item.filePath}`
  );
  return `# Documentation\n\n${lines.join("\n")}`;
}

function formatConfigFiles(items: AppIntelligenceReport["configFiles"]): string {
  if (items.length === 0) return "";
  const lines = items.map((item) => `- ${item.filePath} (${item.type})`);
  return `# Configuration Files\n\n${lines.join("\n")}`;
}

// ── Intelligence Vectorizer ───────────────────────────────────────────────────

export class IntelligenceVectorizer {
  private ragPipeline: RagPipeline;

  constructor(options: IntelligenceVectorizerOptions) {
    this.ragPipeline = options.ragPipeline;
  }

  /**
   * Vectorize an intelligence report into the RAG store.
   * Each report section becomes a separate chunk with type `app_intelligence`.
   */
  async vectorizeIntelligence(
    appId: string,
    report: AppIntelligenceReport
  ): Promise<VectorizeIntelligenceResult> {
    const chunkType: TalosChunkType = "app_intelligence";
    const timestamp = report.scannedAt.toISOString();
    const chunks: ChunkResult[] = [];

    const sections: Array<{ field: string; content: string }> = [
      { field: "techStack", content: formatTechStack(report.techStack) },
      { field: "databases", content: formatDatabases(report.databases) },
      { field: "testUsers", content: formatTestUsers(report.testUsers) },
      { field: "documentation", content: formatDocumentation(report.documentation) },
      { field: "configFiles", content: formatConfigFiles(report.configFiles) },
    ];

    for (const section of sections) {
      if (!section.content) continue;

      chunks.push({
        content: section.content,
        filePath: `intelligence/${appId}/${section.field}`,
        startLine: 0,
        endLine: 0,
        type: chunkType,
        contentHash: contentHash(section.content),
        metadata: {
          fieldName: section.field,
          scanTimestamp: timestamp,
          applicationId: appId,
          reportId: report.id,
        },
      });
    }

    if (chunks.length === 0) {
      return { chunksIndexed: 0, chunksSkipped: 0, totalTokens: 0 };
    }

    const result = await this.ragPipeline.indexChunks(appId, chunks);

    return {
      chunksIndexed: result.indexed,
      chunksSkipped: result.skipped,
      totalTokens: result.totalTokens,
    };
  }
}
