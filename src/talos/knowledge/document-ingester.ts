/**
 * Document Ingester
 *
 * Ingests Markdown and OpenAPI documents into the RAG knowledge base.
 * Provides semantic chunking, stable IDs, and auto-tagging.
 */

import { createHash } from "crypto";
import type { TalosChunkType } from "../types.js";
import type { RagPipeline } from "../rag/rag-pipeline.js";
import type { ChunkResult } from "../discovery/file-chunker.js";
import { AutoTagger } from "./auto-tagger.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DocFormat = "markdown" | "openapi_yaml" | "openapi_json";

export type DocMetadata = {
  fileName: string;
  docType: "prd" | "user_story" | "api_spec" | "functional_spec";
  version?: string;
  tags?: string[];
};

export type IngestResult = {
  chunksCreated: number;
  chunksSkipped: number;
  totalTokens: number;
  docId: string;
};

export type DocumentIngesterOptions = {
  ragPipeline: RagPipeline;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function contentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function chunkTypeForDocType(docType: DocMetadata["docType"]): TalosChunkType {
  switch (docType) {
    case "api_spec":
      return "api_spec";
    case "user_story":
      return "user_story";
    default:
      return "requirement";
  }
}

// ── Document Ingester ─────────────────────────────────────────────────────────

export class DocumentIngester {
  private ragPipeline: RagPipeline;
  private autoTagger: AutoTagger;

  constructor(options: DocumentIngesterOptions) {
    this.ragPipeline = options.ragPipeline;
    this.autoTagger = new AutoTagger();
  }

  /**
   * Dispatch to the appropriate parser based on format.
   */
  async ingestDocument(
    appId: string,
    content: string,
    format: DocFormat,
    metadata: DocMetadata
  ): Promise<IngestResult> {
    switch (format) {
      case "markdown":
        return this.ingestMarkdown(appId, content, metadata);
      case "openapi_yaml":
      case "openapi_json":
        return this.ingestOpenAPI(appId, content, metadata);
      default:
        throw new Error(`Unsupported document format: ${format as string}`);
    }
  }

  /**
   * Ingest a Markdown document.
   * Splits by sections (## headings) and paragraphs with 10-15% overlap.
   */
  async ingestMarkdown(appId: string, content: string, metadata: DocMetadata): Promise<IngestResult> {
    const docId = `doc:${appId}:${metadata.fileName}:${metadata.version ?? "latest"}`;
    const chunkType = chunkTypeForDocType(metadata.docType);
    const sections = this.splitMarkdownSections(content);
    const overlapSize = Math.max(1, Math.round(sections.length * 0.12));

    const chunks: ChunkResult[] = [];
    for (let i = 0; i < sections.length; i++) {
      // Build chunk content with overlap from adjacent sections
      let chunkContent = sections[i].content;
      if (i > 0 && overlapSize > 0) {
        const prevLines = sections[i - 1].content.split("\n");
        const overlapLines = prevLines.slice(-Math.ceil(prevLines.length * 0.12));
        chunkContent = overlapLines.join("\n") + "\n" + chunkContent;
      }

      const stableId = `req:${appId}:${metadata.fileName}:${i}:${metadata.version ?? "latest"}`;
      const tags = this.autoTagger.autoTag(chunkContent, metadata);

      chunks.push({
        content: chunkContent,
        filePath: metadata.fileName,
        startLine: sections[i].startLine,
        endLine: sections[i].endLine,
        type: chunkType,
        contentHash: contentHash(chunkContent),
        metadata: {
          docId,
          stableId,
          sectionHeading: sections[i].heading,
          docType: metadata.docType,
          sourceVersion: metadata.version,
          tags,
        },
      });
    }

    if (chunks.length === 0) {
      return { chunksCreated: 0, chunksSkipped: 0, totalTokens: 0, docId };
    }

    const result = await this.ragPipeline.indexChunks(appId, chunks);
    return {
      chunksCreated: result.indexed,
      chunksSkipped: result.skipped,
      totalTokens: result.totalTokens,
      docId,
    };
  }

  /**
   * Ingest an OpenAPI spec.
   * Creates one chunk per operation (path + method).
   */
  async ingestOpenAPI(appId: string, content: string, metadata: DocMetadata): Promise<IngestResult> {
    const docId = `doc:${appId}:${metadata.fileName}:${metadata.version ?? "latest"}`;
    const operations = this.extractOpenAPIOperations(content, metadata);

    const chunks: ChunkResult[] = operations.map((op, i) => {
      const stableId = `req:${appId}:${metadata.fileName}:${i}:${metadata.version ?? "latest"}`;
      const tags = this.autoTagger.autoTag(op.content, metadata);

      return {
        content: op.content,
        filePath: metadata.fileName,
        startLine: op.startLine,
        endLine: op.endLine,
        type: "api_spec" as TalosChunkType,
        contentHash: contentHash(op.content),
        metadata: {
          docId,
          stableId,
          operationId: op.operationId,
          method: op.method,
          path: op.path,
          docType: metadata.docType,
          sourceVersion: metadata.version,
          tags,
        },
      };
    });

    if (chunks.length === 0) {
      return { chunksCreated: 0, chunksSkipped: 0, totalTokens: 0, docId };
    }

    const result = await this.ragPipeline.indexChunks(appId, chunks);
    return {
      chunksCreated: result.indexed,
      chunksSkipped: result.skipped,
      totalTokens: result.totalTokens,
      docId,
    };
  }

  // ── Markdown Parsing ────────────────────────────────────────────────────────

  private splitMarkdownSections(content: string): Array<{
    heading: string;
    content: string;
    startLine: number;
    endLine: number;
  }> {
    const lines = content.split("\n");
    const sections: Array<{
      heading: string;
      content: string;
      startLine: number;
      endLine: number;
    }> = [];

    let currentHeading = "";
    let currentLines: string[] = [];
    let sectionStart = 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const headingMatch = line.match(/^(#{1,6})\s+([^\r\n]+)$/);

      if (headingMatch && currentLines.length > 0) {
        // Flush the previous section
        const trimmed = currentLines.join("\n").trim();
        if (trimmed.length > 0) {
          sections.push({
            heading: currentHeading,
            content: trimmed,
            startLine: sectionStart,
            endLine: i, // 0-based → exclusive end
          });
        }
        currentHeading = headingMatch[2];
        currentLines = [line];
        sectionStart = i + 1;
      } else if (headingMatch && currentLines.length === 0) {
        currentHeading = headingMatch[2];
        currentLines = [line];
        sectionStart = i + 1;
      } else {
        currentLines.push(line);
      }
    }

    // Flush last section
    if (currentLines.length > 0) {
      const trimmed = currentLines.join("\n").trim();
      if (trimmed.length > 0) {
        sections.push({
          heading: currentHeading,
          content: trimmed,
          startLine: sectionStart,
          endLine: lines.length,
        });
      }
    }

    return sections;
  }

  // ── OpenAPI Parsing ─────────────────────────────────────────────────────────

  private extractOpenAPIOperations(
    content: string,
    metadata: DocMetadata
  ): Array<{
    content: string;
    path: string;
    method: string;
    operationId: string;
    startLine: number;
    endLine: number;
  }> {
    const isJson = metadata.fileName.endsWith(".json") || content.trim().startsWith("{");
    let spec: Record<string, unknown>;

    try {
      if (isJson) {
        spec = JSON.parse(content) as Record<string, unknown>;
      } else {
        // Basic YAML-like parsing for OpenAPI path extraction
        spec = this.parseSimpleYaml(content);
      }
    } catch {
      // If parsing fails, treat the whole document as a single chunk
      return [
        {
          content,
          path: "/",
          method: "unknown",
          operationId: "full-spec",
          startLine: 1,
          endLine: content.split("\n").length,
        },
      ];
    }

    const paths = spec.paths as Record<string, Record<string, unknown>> | undefined;
    if (!paths) {
      return [
        {
          content,
          path: "/",
          method: "unknown",
          operationId: "full-spec",
          startLine: 1,
          endLine: content.split("\n").length,
        },
      ];
    }

    const operations: Array<{
      content: string;
      path: string;
      method: string;
      operationId: string;
      startLine: number;
      endLine: number;
    }> = [];

    const httpMethods = ["get", "post", "put", "patch", "delete", "head", "options"];
    let lineCounter = 1;

    for (const [pathKey, pathItem] of Object.entries(paths)) {
      for (const method of httpMethods) {
        const operation = pathItem[method] as Record<string, unknown> | undefined;
        if (!operation) continue;

        const operationId = (operation.operationId as string) ?? `${method}_${pathKey.replace(/\//g, "_")}`;
        const summary = (operation.summary as string) ?? "";
        const description = (operation.description as string) ?? "";

        const opContent = [
          `${method.toUpperCase()} ${pathKey}`,
          summary ? `Summary: ${summary}` : "",
          description ? `Description: ${description}` : "",
          `Operation: ${JSON.stringify(operation, null, 2)}`,
        ]
          .filter(Boolean)
          .join("\n");

        operations.push({
          content: opContent,
          path: pathKey,
          method: method.toUpperCase(),
          operationId,
          startLine: lineCounter,
          endLine: lineCounter + opContent.split("\n").length - 1,
        });

        lineCounter += opContent.split("\n").length;
      }
    }

    return operations;
  }

  /**
   * Minimal YAML parser — just enough to extract paths/methods from OpenAPI specs.
   * Falls back to treating the whole document as a single chunk when structure cannot be parsed.
   */
  private parseSimpleYaml(content: string): Record<string, unknown> {
    // Attempt JSON first in case the YAML is actually JSON
    try {
      return JSON.parse(content) as Record<string, unknown>;
    } catch {
      // continue with YAML heuristic
    }

    const lines = content.split("\n");
    const result: Record<string, unknown> = {};
    const paths: Record<string, Record<string, Record<string, string>>> = {};
    let inPaths = false;
    let currentPath = "";
    let currentMethod = "";
    const httpMethods = new Set(["get", "post", "put", "patch", "delete", "head", "options"]);

    for (const line of lines) {
      const trimmed = line.trimEnd();

      // Top-level "paths:" key
      if (/^paths:\s*$/.test(trimmed)) {
        inPaths = true;
        continue;
      }

      // Exit paths section on next top-level key
      if (inPaths && /^\S/.test(trimmed) && !trimmed.startsWith(" ") && trimmed !== "") {
        inPaths = false;
        continue;
      }

      if (!inPaths) continue;

      // Path key (e.g., "  /users:")
      const pathMatch = trimmed.match(/^  (\/\S+):\s*$/);
      if (pathMatch) {
        currentPath = pathMatch[1];
        paths[currentPath] = paths[currentPath] ?? {};
        continue;
      }

      // Method key (e.g., "    get:")
      const methodMatch = trimmed.match(/^    (\w+):\s*$/);
      if (methodMatch && httpMethods.has(methodMatch[1])) {
        currentMethod = methodMatch[1];
        paths[currentPath] = paths[currentPath] ?? {};
        paths[currentPath][currentMethod] = paths[currentPath][currentMethod] ?? {};
        continue;
      }

      // Capture summary/description/operationId
      if (currentPath && currentMethod) {
        const kvMatch = trimmed.match(/^\s{6}(summary|description|operationId):\s*(.+)$/);
        if (kvMatch) {
          paths[currentPath][currentMethod][kvMatch[1]] = kvMatch[2].replace(/^['"]|['"]$/g, "");
        }
      }
    }

    result.paths = paths;
    return result;
  }

  /**
   * Ingest JDBC schema information (table descriptions, column lists)
   * as 'schema' chunks for data-driven test generation.
   */
  async ingestSchemaData(
    appId: string,
    tableName: string,
    schemaContent: string,
    dataSourceLabel: string
  ): Promise<IngestResult> {
    const docId = `schema:${appId}:${dataSourceLabel}:${tableName}`;
    const stableId = `schema:${appId}:${dataSourceLabel}:${tableName}`;
    const hash = contentHash(schemaContent);
    const tags = ["database", "schema", dataSourceLabel.toLowerCase().replace(/\s+/g, "-")];

    const chunks: ChunkResult[] = [
      {
        content: `## Table: ${tableName}\n\nData Source: ${dataSourceLabel}\n\n${schemaContent}`,
        filePath: `schema/${dataSourceLabel}/${tableName}`,
        startLine: 0,
        endLine: 0,
        type: "schema" as const,
        contentHash: hash,
        metadata: {
          stableId,
          docId,
          chunkType: "schema" as const,
          contentHash: hash,
          tags,
          sourceVersion: "live",
        },
      },
    ];

    const result = await this.ragPipeline.indexChunks(appId, chunks);
    return {
      chunksCreated: result.indexed,
      chunksSkipped: result.skipped,
      totalTokens: result.totalTokens,
      docId,
    };
  }

  /**
   * Ingest Atlassian content (Jira issues, Confluence pages)
   * as 'requirement' or 'user_story' chunks for RAG-powered test generation.
   */
  async ingestAtlassianContent(
    appId: string,
    content: string,
    source: "jira" | "confluence",
    itemKey: string,
    title: string
  ): Promise<IngestResult> {
    const docId = `${source}:${appId}:${itemKey}`;
    const chunkType = source === "jira" ? "user_story" : "requirement";
    const hash = contentHash(content);
    const tags = this.autoTagger.autoTag(content, {
      fileName: `${source}/${itemKey}`,
      docType: source === "jira" ? "user_story" : "prd",
    });

    const fullContent = `## ${title}\n\nSource: ${source.toUpperCase()} ${itemKey}\n\n${content}`;

    const chunks: ChunkResult[] = [
      {
        content: fullContent,
        filePath: `${source}/${itemKey}`,
        startLine: 0,
        endLine: 0,
        type: chunkType as TalosChunkType,
        contentHash: hash,
        metadata: {
          stableId: docId,
          docId,
          chunkType,
          contentHash: hash,
          tags,
          sourceVersion: "live",
        },
      },
    ];

    const result = await this.ragPipeline.indexChunks(appId, chunks);
    return {
      chunksCreated: result.indexed,
      chunksSkipped: result.skipped,
      totalTokens: result.totalTokens,
      docId,
    };
  }
}
