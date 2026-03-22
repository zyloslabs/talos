/**
 * Artifact Manager
 *
 * Manages test artifacts: screenshots, videos, traces, logs.
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { TalosTestArtifact, TalosArtifactType } from "../types.js";
import type { ArtifactsConfig } from "../config.js";
import type { TalosRepository } from "../repository.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ArtifactManagerOptions = {
  config: ArtifactsConfig;
  repository: TalosRepository;
};

export type SaveArtifactInput = {
  testRunId: string;
  type: TalosArtifactType;
  content: Buffer;
  fileName: string;
  stepName?: string;
  metadata?: Record<string, unknown>;
};

// ── MIME Type Mapping ─────────────────────────────────────────────────────────

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".zip": "application/zip",
  ".json": "application/json",
  ".html": "text/html",
  ".txt": "text/plain",
  ".log": "text/plain",
};

// ── Artifact Manager ──────────────────────────────────────────────────────────

export class ArtifactManager {
  private config: ArtifactsConfig;
  private repository: TalosRepository;
  private basePath: string;

  constructor(options: ArtifactManagerOptions) {
    this.config = options.config;
    this.repository = options.repository;
    this.basePath = this.config.path.replace("~", process.env.HOME ?? "");
  }

  /**
   * Initialize artifact storage directory.
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true });
  }

  /**
   * Save an artifact to storage and database.
   */
  async save(input: SaveArtifactInput): Promise<TalosTestArtifact> {
    // Create directory structure: basePath/runId/type/
    const runDir = path.join(this.basePath, input.testRunId);
    const typeDir = path.join(runDir, input.type);
    await fs.mkdir(typeDir, { recursive: true });

    // Write file
    const filePath = path.join(typeDir, input.fileName);
    await fs.writeFile(filePath, input.content);

    // Get MIME type
    const ext = path.extname(input.fileName).toLowerCase();
    const mimeType = MIME_TYPES[ext] ?? "application/octet-stream";

    // Create database record
    const relativePath = path.relative(this.basePath, filePath);
    const artifact = this.repository.createArtifact({
      testRunId: input.testRunId,
      type: input.type,
      filePath: relativePath,
      mimeType,
      sizeBytes: input.content.length,
      stepName: input.stepName,
      metadata: input.metadata,
    });

    return artifact;
  }

  /**
   * Save a screenshot artifact.
   */
  async saveScreenshot(
    testRunId: string,
    screenshot: Buffer,
    name: string,
    stepName?: string
  ): Promise<TalosTestArtifact> {
    const fileName = name.endsWith(".png") ? name : `${name}.png`;
    return this.save({
      testRunId,
      type: "screenshot",
      content: screenshot,
      fileName,
      stepName,
    });
  }

  /**
   * Save a video artifact.
   */
  async saveVideo(testRunId: string, videoPath: string): Promise<TalosTestArtifact> {
    const content = await fs.readFile(videoPath);
    const fileName = path.basename(videoPath);
    return this.save({
      testRunId,
      type: "video",
      content,
      fileName,
    });
  }

  /**
   * Save a trace artifact.
   */
  async saveTrace(testRunId: string, tracePath: string): Promise<TalosTestArtifact> {
    const content = await fs.readFile(tracePath);
    return this.save({
      testRunId,
      type: "trace",
      content,
      fileName: "trace.zip",
    });
  }

  /**
   * Save a log artifact.
   */
  async saveLog(testRunId: string, log: string, name = "test.log"): Promise<TalosTestArtifact> {
    return this.save({
      testRunId,
      type: "log",
      content: Buffer.from(log, "utf-8"),
      fileName: name,
    });
  }

  /**
   * Get artifact content by ID.
   */
  async getContent(artifactId: string): Promise<Buffer | null> {
    const artifact = this.repository.getArtifact(artifactId);
    if (!artifact) return null;

    const fullPath = path.join(this.basePath, artifact.filePath);
    try {
      return await fs.readFile(fullPath);
    } catch {
      return null;
    }
  }

  /**
   * Get full path to an artifact.
   */
  getFullPath(artifact: TalosTestArtifact): string {
    return path.join(this.basePath, artifact.filePath);
  }

  /**
   * Delete artifacts for a test run.
   */
  async deleteByRun(testRunId: string): Promise<void> {
    const runDir = path.join(this.basePath, testRunId);
    try {
      await fs.rm(runDir, { recursive: true, force: true });
    } catch {
      // Directory may not exist
    }
  }

  /**
   * Clean up old artifacts beyond retention period.
   */
  async cleanup(): Promise<{ deleted: number; freedBytes: number }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

    let deleted = 0;
    let freedBytes = 0;

    try {
      const entries = await fs.readdir(this.basePath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const runDir = path.join(this.basePath, entry.name);
        const stats = await fs.stat(runDir);

        if (stats.mtime < cutoffDate) {
          // Count size before deletion
          const size = await this.getDirSize(runDir);
          freedBytes += size;

          await fs.rm(runDir, { recursive: true, force: true });
          deleted++;
        }
      }
    } catch {
      // Handle errors gracefully
    }

    return { deleted, freedBytes };
  }

  /**
   * Get total storage usage.
   */
  async getStorageUsage(): Promise<{ totalBytes: number; runCount: number }> {
    let totalBytes = 0;
    let runCount = 0;

    try {
      const entries = await fs.readdir(this.basePath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        
        const runDir = path.join(this.basePath, entry.name);
        totalBytes += await this.getDirSize(runDir);
        runCount++;
      }
    } catch {
      // Handle errors gracefully
    }

    return { totalBytes, runCount };
  }

  private async getDirSize(dirPath: string): Promise<number> {
    let size = 0;

    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        size += await this.getDirSize(fullPath);
      } else {
        const stats = await fs.stat(fullPath);
        size += stats.size;
      }
    }

    return size;
  }
}
