/**
 * File Chunker
 *
 * Splits source files into chunks for RAG indexing.
 * Supports structural chunking (by function/class) and sliding window.
 */

import type { TalosChunk, TalosChunkType } from "../types.js";
import { randomUUID } from "crypto";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ChunkResult = {
  content: string;
  filePath: string;
  startLine: number;
  endLine: number;
  type: TalosChunkType;
  contentHash: string;
  metadata: {
    language?: string;
    symbolName?: string;
    symbolType?: "function" | "class" | "interface" | "type" | "const" | "module";
    [key: string]: unknown;
  };
};

export type ChunkerOptions = {
  /** Maximum chunk size in characters */
  chunkSize?: number;
  /** Overlap between chunks */
  chunkOverlap?: number;
  /** Whether to use structural chunking (by function/class) when possible */
  useStructuralChunking?: boolean;
};

// ── Language Matchers ─────────────────────────────────────────────────────────

const FUNCTION_PATTERNS: Record<string, RegExp> = {
  typescript: /^(export\s+)?(async\s+)?function\s+(\w+)/,
  javascript: /^(export\s+)?(async\s+)?function\s+(\w+)/,
  python: /^(async\s+)?def\s+(\w+)/,
};

const CLASS_PATTERNS: Record<string, RegExp> = {
  typescript: /^(export\s+)?(abstract\s+)?class\s+(\w+)/,
  javascript: /^(export\s+)?class\s+(\w+)/,
  python: /^class\s+(\w+)/,
};

const ARROW_FUNCTION_PATTERNS: Record<string, RegExp> = {
  typescript: /^(export\s+)?(const|let|var)\s+(\w+)\s*=\s*(async\s+)?\(/,
  javascript: /^(export\s+)?(const|let|var)\s+(\w+)\s*=\s*(async\s+)?\(/,
};

// ── Chunker Implementation ────────────────────────────────────────────────────

export class FileChunker {
  private chunkSize: number;
  private chunkOverlap: number;
  private useStructuralChunking: boolean;

  constructor(options: ChunkerOptions = {}) {
    this.chunkSize = options.chunkSize ?? 1000;
    this.chunkOverlap = options.chunkOverlap ?? 200;
    this.useStructuralChunking = options.useStructuralChunking ?? true;
  }

  /**
   * Chunk a file into RAG-ready segments.
   */
  chunk(filePath: string, content: string, applicationId: string): TalosChunk[] {
    // Return empty array for empty content
    if (!content || content.trim() === "") {
      return [];
    }

    const language = this.detectLanguage(filePath);
    const type = this.detectChunkType(filePath);

    let chunkResults: ChunkResult[];

    if (this.useStructuralChunking && this.canStructuralChunk(language)) {
      const structuralChunks = this.structuralChunk(content, filePath, language, type);
      chunkResults = structuralChunks.length > 0 ? structuralChunks : this.slidingWindowChunk(content, filePath, type);
    } else {
      chunkResults = this.slidingWindowChunk(content, filePath, type);
    }

    // Convert ChunkResult to TalosChunk
    return chunkResults.map((result) => ({
      id: randomUUID(),
      applicationId,
      type: result.type,
      content: result.content,
      filePath: result.filePath,
      startLine: result.startLine,
      endLine: result.endLine,
      contentHash: result.contentHash,
      metadata: result.metadata,
      createdAt: new Date(),
    }));
  }

  /**
   * Structural chunking - split by functions/classes.
   */
  private structuralChunk(
    content: string,
    filePath: string,
    language: string,
    type: TalosChunkType
  ): ChunkResult[] {
    const lines = content.split("\n");
    const chunks: ChunkResult[] = [];
    let currentSymbol: {
      name: string;
      symbolType: ChunkResult["metadata"]["symbolType"];
      startLine: number;
      indentLevel: number;
    } | null = null;
    let currentContent: string[] = [];

    const functionPattern = FUNCTION_PATTERNS[language];
    const classPattern = CLASS_PATTERNS[language];
    const arrowPattern = ARROW_FUNCTION_PATTERNS[language];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trimStart();
      const indentLevel = line.length - trimmedLine.length;

      // Check for new symbol definition
      let match: RegExpMatchArray | null = null;
      let symbolType: ChunkResult["metadata"]["symbolType"] = undefined;
      let symbolName: string | undefined;

      if (functionPattern && (match = trimmedLine.match(functionPattern))) {
        symbolType = "function";
        symbolName = match[3] || match[2];
      } else if (classPattern && (match = trimmedLine.match(classPattern))) {
        symbolType = "class";
        symbolName = match[3] || match[2] || match[1];
      } else if (arrowPattern && (match = trimmedLine.match(arrowPattern))) {
        symbolType = "function";
        symbolName = match[3];
      }

      // Start new symbol
      if (symbolName && symbolType && (!currentSymbol || indentLevel <= currentSymbol.indentLevel)) {
        // Save previous symbol if exists
        if (currentSymbol && currentContent.length > 0) {
          chunks.push(this.createChunk(
            currentContent.join("\n"),
            filePath,
            currentSymbol.startLine,
            i,
            type,
            { language, symbolName: currentSymbol.name, symbolType: currentSymbol.symbolType }
          ));
        }

        currentSymbol = {
          name: symbolName,
          symbolType,
          startLine: i + 1,
          indentLevel,
        };
        currentContent = [line];
      } else if (currentSymbol) {
        currentContent.push(line);

        // Check if we've exited the symbol (back to same or lower indent after content)
        if (trimmedLine.length > 0 && indentLevel <= currentSymbol.indentLevel && i > currentSymbol.startLine) {
          // Check next non-empty line to confirm exit
          let nextNonEmpty = i + 1;
          while (nextNonEmpty < lines.length && lines[nextNonEmpty].trim() === "") {
            nextNonEmpty++;
          }

          if (nextNonEmpty < lines.length) {
            const nextIndent = lines[nextNonEmpty].length - lines[nextNonEmpty].trimStart().length;
            if (nextIndent <= currentSymbol.indentLevel) {
              chunks.push(this.createChunk(
                currentContent.join("\n"),
                filePath,
                currentSymbol.startLine,
                i + 1,
                type,
                { language, symbolName: currentSymbol.name, symbolType: currentSymbol.symbolType }
              ));
              currentSymbol = null;
              currentContent = [];
            }
          }
        }
      }
    }

    // Handle remaining content
    if (currentSymbol && currentContent.length > 0) {
      chunks.push(this.createChunk(
        currentContent.join("\n"),
        filePath,
        currentSymbol.startLine,
        lines.length,
        type,
        { language, symbolName: currentSymbol.name, symbolType: currentSymbol.symbolType }
      ));
    }

    // If no structural chunks found, return the whole file as one chunk if small enough
    if (chunks.length === 0 && content.length <= this.chunkSize * 2) {
      chunks.push(this.createChunk(content, filePath, 1, lines.length, type, { language }));
    }

    return chunks;
  }

  /**
   * Sliding window chunking - fallback method.
   */
  private slidingWindowChunk(content: string, filePath: string, type: TalosChunkType): ChunkResult[] {
    const lines = content.split("\n");
    const chunks: ChunkResult[] = [];

    let currentChunk: string[] = [];
    let currentLength = 0;
    let startLine = 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      currentChunk.push(line);
      currentLength += line.length + 1; // +1 for newline

      if (currentLength >= this.chunkSize) {
        chunks.push(this.createChunk(
          currentChunk.join("\n"),
          filePath,
          startLine,
          i + 1,
          type,
          { language: this.detectLanguage(filePath) }
        ));

        // Calculate overlap in lines
        const overlapLines = Math.ceil(this.chunkOverlap / (currentLength / currentChunk.length));
        const keepLines = Math.min(overlapLines, currentChunk.length - 1);

        currentChunk = currentChunk.slice(-keepLines);
        currentLength = currentChunk.reduce((sum, l) => sum + l.length + 1, 0);
        startLine = i - keepLines + 2;
      }
    }

    // Add remaining content
    if (currentChunk.length > 0) {
      chunks.push(this.createChunk(
        currentChunk.join("\n"),
        filePath,
        startLine,
        lines.length,
        type,
        { language: this.detectLanguage(filePath) }
      ));
    }

    return chunks;
  }

  private createChunk(
    content: string,
    filePath: string,
    startLine: number,
    endLine: number,
    type: TalosChunkType,
    metadata: ChunkResult["metadata"]
  ): ChunkResult {
    return {
      content,
      filePath,
      startLine,
      endLine,
      type,
      contentHash: this.hashContent(content),
      metadata,
    };
  }

  private hashContent(content: string): string {
    // Simple hash for deduplication
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, "0");
  }

  private detectLanguage(filePath: string): string {
    const ext = filePath.split(".").pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      ts: "typescript",
      tsx: "typescript",
      js: "javascript",
      jsx: "javascript",
      py: "python",
      vue: "vue",
      svelte: "svelte",
      html: "html",
      css: "css",
      scss: "scss",
      json: "json",
      yaml: "yaml",
      yml: "yaml",
      md: "markdown",
    };
    return languageMap[ext ?? ""] ?? "unknown";
  }

  private detectChunkType(filePath: string): TalosChunkType {
    const lowerPath = filePath.toLowerCase();

    if (lowerPath.includes(".test.") || lowerPath.includes(".spec.") || lowerPath.includes("__tests__")) {
      return "test";
    }
    if (lowerPath.includes("readme") || lowerPath.includes("doc") || lowerPath.endsWith(".md")) {
      return "documentation";
    }
    if (lowerPath.includes("config") || lowerPath.includes("settings") || lowerPath.endsWith(".json") || lowerPath.endsWith(".yaml")) {
      return "config";
    }
    if (lowerPath.includes("schema") || lowerPath.includes("types") || lowerPath.includes("interface")) {
      return "schema";
    }
    return "code";
  }

  private canStructuralChunk(language: string): boolean {
    return ["typescript", "javascript", "python"].includes(language);
  }
}

// ── Exported Helper Functions ─────────────────────────────────────────────────

export type SlidingWindowOptions = {
  filePath: string;
  applicationId: string;
  chunkSize?: number;
  chunkOverlap?: number;
};

/**
 * Create sliding window chunks from content.
 */
export function createSlidingWindowChunks(
  content: string,
  options: SlidingWindowOptions
): TalosChunk[] {
  const { filePath, applicationId, chunkSize = 1000, chunkOverlap = 200 } = options;

  if (!content || content.trim() === "") {
    return [];
  }

  const lines = content.split("\n");
  const chunks: TalosChunk[] = [];

  let currentChunk: string[] = [];
  let currentLength = 0;
  let startLine = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    currentChunk.push(line);
    currentLength += line.length + 1;

    if (currentLength >= chunkSize) {
      const chunkContent = currentChunk.join("\n");
      chunks.push({
        id: randomUUID(),
        applicationId,
        type: "code",
        content: chunkContent,
        filePath,
        startLine,
        endLine: i + 1,
        contentHash: hashContent(chunkContent),
        metadata: {},
        createdAt: new Date(),
      });

      const overlapLines = Math.ceil(chunkOverlap / (currentLength / currentChunk.length));
      const keepLines = Math.min(overlapLines, currentChunk.length - 1);

      currentChunk = currentChunk.slice(-keepLines);
      currentLength = currentChunk.reduce((sum, l) => sum + l.length + 1, 0);
      startLine = i - keepLines + 2;
    }
  }

  if (currentChunk.length > 0) {
    const chunkContent = currentChunk.join("\n");
    chunks.push({
      id: randomUUID(),
      applicationId,
      type: "code",
      content: chunkContent,
      filePath,
      startLine,
      endLine: lines.length,
      contentHash: hashContent(chunkContent),
      metadata: {},
      createdAt: new Date(),
    });
  }

  return chunks;
}

export type StructuralChunkOptions = {
  filePath: string;
  applicationId: string;
  chunkSize?: number;
};

/**
 * Create structural chunks (by function/class) from content.
 */
export function createStructuralChunks(
  content: string,
  options: StructuralChunkOptions
): TalosChunk[] {
  const { filePath, applicationId, chunkSize = 2000 } = options;

  if (!content || content.trim() === "") {
    return [];
  }

  const chunker = new FileChunker({
    chunkSize,
    useStructuralChunking: true,
  });

  return chunker.chunk(filePath, content, applicationId);
}

function hashContent(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}
