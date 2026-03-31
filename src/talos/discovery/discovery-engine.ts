/**
 * Discovery Engine
 *
 * Orchestrates repository discovery: GitHub MCP → File chunking → RAG indexing.
 */

import type { TalosApplication, DiscoveryJob, DiscoveryStatus, TalosChunk } from "../types.js";
import type { TalosRepository } from "../repository.js";
import type { DiscoveryConfig } from "../config.js";
import { GitHubApiClient, type GitHubFile } from "./github-api-client.js";
import { FileChunker } from "./file-chunker.js";
import { resolveGitHubPat } from "./resolve-pat.js";

export type ParsedRepoUrl = { host: string; owner: string; repo: string };

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
    this.resolveSecret =
      options.resolveSecret ??
      (async () => {
        throw new Error("resolveSecret not configured");
      });
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
   * Awaits the full discovery run and returns the final job state with real counts.
   * An optional `onProgress` callback receives per-file progress updates during the scan.
   */
  async startDiscovery(
    application: TalosApplication,
    force = false,
    onProgress?: (progress: DiscoveryProgress) => void,
  ): Promise<DiscoveryJob> {
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

    try {
      await this.runDiscovery(jobId, application, force, onProgress);
    } catch (error) {
      const job = this.jobs.get(jobId);
      if (job) {
        job.status = "failed";
        job.errorMessage = error instanceof Error ? error.message : String(error);
      }
      throw error;
    }

    const finalProgress = this.jobs.get(jobId)!;
    return {
      id: jobId,
      applicationId: application.id,
      status: finalProgress.status,
      filesDiscovered: finalProgress.filesDiscovered,
      filesIndexed: finalProgress.filesIndexed,
      chunksCreated: finalProgress.chunksCreated,
      errorMessage: finalProgress.errorMessage ?? null,
      createdAt: this.clock(),
      completedAt: finalProgress.status === "completed" ? this.clock() : null,
    };
  }

  /**
   * Get discovery job progress.
   */
  getProgress(jobId: string): DiscoveryProgress | null {
    return this.jobs.get(jobId) ?? null;
  }

  // ── Private Methods ─────────────────────────────────────────────────────────

  private async runDiscovery(
    jobId: string,
    application: TalosApplication,
    _force: boolean,
    onProgress?: (progress: DiscoveryProgress) => void,
  ): Promise<void> {
    const progress = this.jobs.get(jobId)!;
    progress.status = "running";

    try {
      // Parse repository URL first so we know the host (github.com vs GHE).
      const { host, owner, repo } = this.parseRepoUrl(application.repositoryUrl);
      const isGhe = host.toLowerCase() !== "github.com";

      // Resolve GitHub PAT: per-app vault ref → host-appropriate env var → generic env var → error.
      let pat: string;
      if (application.githubPatRef) {
        pat = await this.resolveSecret(application.githubPatRef);
      } else {
        pat = resolveGitHubPat({ isGhe });
        if (!pat) {
          throw new Error(
            `No GitHub PAT configured for application (set githubPatRef on the application, ${isGhe ? "GHE_PERSONAL_ACCESS_TOKEN" : "GITHUB_PERSONAL_ACCESS_TOKEN"} in the environment)`
          );
        }
      }

      // Create GitHub client with appropriate API base URL
      const client = new GitHubApiClient({
        pat,
        owner,
        repo,
        baseUrl: GitHubApiClient.apiBaseFromHost(host),
        clock: this.clock,
      });

      // Get repository tree (use configured branch or default to HEAD)
      const ref = application.branch || "HEAD";
      const tree = await client.getTree(ref, true);
      progress.filesDiscovered = tree.tree.filter((f) => f.type === "file").length;
      onProgress?.(progress);

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
          onProgress?.(progress);
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

  private parseRepoUrl(url: string): ParsedRepoUrl {
    // HTTPS URLs: https://github.com/org/repo or https://git.nyiso.com/GOT/GFER-Cloud
    const httpsMatch = url.match(/^https?:\/\/([^/]+)\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
    if (httpsMatch) {
      return { host: httpsMatch[1], owner: httpsMatch[2], repo: httpsMatch[3] };
    }

    // SSH URLs: git@github.com:org/repo.git or git@git.nyiso.com:org/repo.git
    const sshMatch = url.match(/^git@([^:]+):([^/]+)\/([^/]+?)(?:\.git)?$/);
    if (sshMatch) {
      return { host: sshMatch[1], owner: sshMatch[2], repo: sshMatch[3] };
    }

    // Shorthand: org/repo (default to github.com)
    const shortMatch = url.match(/^([^/]+)\/([^/]+)$/);
    if (shortMatch) {
      return { host: "github.com", owner: shortMatch[1], repo: shortMatch[2] };
    }

    throw new Error(`Invalid repository URL: ${url}`);
  }

  private filterFiles(files: GitHubFile[]): GitHubFile[] {
    return files.filter((file) => {
      if (file.type !== "file") return false;

      // Check extension
      const hasValidExtension = this.config.includeExtensions.some((ext) => file.path.endsWith(ext));
      if (!hasValidExtension) return false;

      // Check exclude patterns
      const isExcluded = this.config.excludePatterns.some((pattern) => file.path.includes(pattern));
      if (isExcluded) return false;

      return true;
    });
  }
}
