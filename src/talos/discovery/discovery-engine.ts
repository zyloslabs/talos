/**
 * Discovery Engine
 *
 * Orchestrates repository discovery: GitHub MCP → File chunking → RAG indexing.
 */

import type { TalosApplication, DiscoveryJob, DiscoveryStatus, TalosChunk } from "../types.js";
import type { TalosRepository } from "../repository.js";
import type { DiscoveryConfig } from "../config.js";
import { GitHubMcpClient, type GitHubFile } from "./github-mcp-client.js";
import { FileChunker } from "./file-chunker.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DiscoveryEngineOptions = {
  repository: TalosRepository;
  config: DiscoveryConfig;
  /** Function to resolve vault secrets */
  resolveSecret?: (ref: string) => Promise<string>;
  /** Function to store chunks in vector DB */
  storeChunks?: (applicationId: string, chunks: TalosChunk[]) => Promise<void>;
  /** Clock for testing */
  clock?: () => Date;
};

export type DiscoveryProgress = {
  jobId: string;
  status: DiscoveryStatus;
  filesDiscovered: number;
  filesIndexed: number;
  chunksCreated: number;
  currentFile?: string;
  errorMessage?: string;
};

// ── Discovery Engine ──────────────────────────────────────────────────────────

export class DiscoveryEngine {
  private config: DiscoveryConfig;
  private resolveSecret: (ref: string) => Promise<string>;
  private storeChunks: (applicationId: string, chunks: TalosChunk[]) => Promise<void>;
  private clock: () => Date;

  private chunker: FileChunker;
  private jobs = new Map<string, DiscoveryProgress>();

  constructor(options: DiscoveryEngineOptions) {
    void options.repository; // Placeholder for future use
    this.config = options.config;
    this.resolveSecret = options.resolveSecret ?? (async () => { throw new Error("resolveSecret not configured"); });
    this.storeChunks = options.storeChunks ?? (async () => {});
    this.clock = options.clock ?? (() => new Date());

    this.chunker = new FileChunker({
      chunkSize: this.config.chunkSize,
      chunkOverlap: this.config.chunkOverlap,
      useStructuralChunking: true,
    });
  }

  /**
   * Start discovery for an application.
   */
  async startDiscovery(application: TalosApplication, force = false): Promise<DiscoveryJob> {
    const jobId = crypto.randomUUID();

    // Initialize progress tracking
    const progress: DiscoveryProgress = {
      jobId,
      status: "pending",
      filesDiscovered: 0,
      filesIndexed: 0,
      chunksCreated: 0,
    };
    this.jobs.set(jobId, progress);

    // Start discovery in background
    this.runDiscovery(jobId, application, force).catch((error) => {
      const job = this.jobs.get(jobId);
      if (job) {
        job.status = "failed";
        job.errorMessage = error instanceof Error ? error.message : String(error);
      }
    });

    return {
      id: jobId,
      applicationId: application.id,
      status: "pending",
      filesDiscovered: 0,
      filesIndexed: 0,
      chunksCreated: 0,
      errorMessage: null,
      createdAt: this.clock(),
      completedAt: null,
    };
  }

  /**
   * Get discovery job progress.
   */
  getProgress(jobId: string): DiscoveryProgress | null {
    return this.jobs.get(jobId) ?? null;
  }

  // ── Private Methods ─────────────────────────────────────────────────────────

  private async runDiscovery(jobId: string, application: TalosApplication, _force: boolean): Promise<void> {
    const progress = this.jobs.get(jobId)!;
    progress.status = "running";

    try {
      // Resolve GitHub PAT from vault
      let pat: string;
      if (application.githubPatRef) {
        pat = await this.resolveSecret(application.githubPatRef);
      } else {
        throw new Error("No GitHub PAT configured for application");
      }

      // Parse repository URL
      const { owner, repo } = this.parseRepoUrl(application.repositoryUrl);

      // Create GitHub client
      const client = new GitHubMcpClient({
        pat,
        owner,
        repo,
        clock: this.clock,
      });

      // Get repository tree
      const tree = await client.getTree("HEAD", true);
      progress.filesDiscovered = tree.tree.filter((f) => f.type === "file").length;

      // Filter files by extension and exclude patterns
      const filesToIndex = this.filterFiles(tree.tree);
      const allChunks: TalosChunk[] = [];

      // Process each file
      for (const file of filesToIndex) {
        progress.currentFile = file.path;

        // Skip files over size limit
        if (file.size > this.config.maxFileSizeBytes) {
          continue;
        }

        try {
          const content = await client.getFileText(file.path);
          const chunks = this.chunker.chunk(file.path, content, application.id);
          allChunks.push(...chunks);
          progress.filesIndexed++;
          progress.chunksCreated = allChunks.length;
        } catch (error) {
          // Log and continue on individual file errors
          console.warn(`Failed to process ${file.path}:`, error);
        }
      }

      // Store chunks in vector DB
      await this.storeChunks(application.id, allChunks);

      progress.status = "completed";
      progress.currentFile = undefined;
    } catch (error) {
      progress.status = "failed";
      progress.errorMessage = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  private parseRepoUrl(url: string): { owner: string; repo: string } {
    // Handle various GitHub URL formats
    const patterns = [
      /github\.com[/:]([^/]+)\/([^/.]+)/,
      /^([^/]+)\/([^/]+)$/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
      }
    }

    throw new Error(`Invalid repository URL: ${url}`);
  }

  private filterFiles(files: GitHubFile[]): GitHubFile[] {
    return files.filter((file) => {
      if (file.type !== "file") return false;

      // Check extension
      const hasValidExtension = this.config.includeExtensions.some((ext) =>
        file.path.endsWith(ext)
      );
      if (!hasValidExtension) return false;

      // Check exclude patterns
      const isExcluded = this.config.excludePatterns.some((pattern) =>
        file.path.includes(pattern)
      );
      if (isExcluded) return false;

      return true;
    });
  }
}
