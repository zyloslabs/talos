/**
 * GitHub MCP Client
 *
 * Interfaces with GitHub's MCP server for repository content discovery.
 * Handles rate limiting, caching, and exponential backoff.
 */

import type { GitHubMcpConfig } from "../config.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type GitHubFile = {
  path: string;
  type: "file" | "dir" | "symlink" | "submodule";
  size: number;
  sha: string;
  url: string;
};

export type GitHubTree = {
  sha: string;
  url: string;
  tree: GitHubFile[];
  truncated: boolean;
};

export type GitHubContent = {
  path: string;
  content: string;
  encoding: "base64" | "utf-8";
  sha: string;
  size: number;
};

export type RateLimitState = {
  remaining: number;
  reset: Date;
  limit: number;
};

export type GitHubMcpClientOptions = {
  /** GitHub Personal Access Token */
  pat: string;
  /** Repository owner */
  owner: string;
  /** Repository name */
  repo: string;
  /** Configuration */
  config?: GitHubMcpConfig;
  /** Clock for testing */
  clock?: () => Date;
};

// ── Client Implementation ─────────────────────────────────────────────────────

export class GitHubMcpClient {
  private pat: string;
  private owner: string;
  private repo: string;
  private config: GitHubMcpConfig;
  private clock: () => Date;

  private rateLimit: RateLimitState | null = null;
  private cache = new Map<string, { value: unknown; expiresAt: Date }>();
  private backoffAttempts = 0;

  constructor(options: GitHubMcpClientOptions) {
    this.pat = options.pat;
    this.owner = options.owner;
    this.repo = options.repo;
    this.config = options.config ?? {
      rateLimitPerHour: 5000,
      backoffBaseMs: 1000,
      backoffMaxMs: 60000,
      cacheTtlSeconds: 300,
    };
    this.clock = options.clock ?? (() => new Date());
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Get the repository tree (all files/directories).
   * @param ref - Git ref (branch, tag, or commit SHA). Defaults to HEAD.
   * @param recursive - Whether to recursively list all files.
   */
  async getTree(ref = "HEAD", recursive = true): Promise<GitHubTree> {
    const cacheKey = `tree:${this.owner}/${this.repo}:${ref}:${recursive}`;
    const cached = this.getFromCache<GitHubTree>(cacheKey);
    if (cached) return cached;

    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/git/trees/${ref}${recursive ? "?recursive=1" : ""}`;
    const result = await this.fetchWithRetry<GitHubTree>(url);

    this.setCache(cacheKey, result);
    return result;
  }

  /**
   * Get content of a specific file.
   * @param path - File path relative to repo root.
   * @param ref - Git ref. Defaults to HEAD.
   */
  async getFileContent(path: string, ref = "HEAD"): Promise<GitHubContent> {
    const cacheKey = `content:${this.owner}/${this.repo}:${path}:${ref}`;
    const cached = this.getFromCache<GitHubContent>(cacheKey);
    if (cached) return cached;

    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${encodeURIComponent(path)}?ref=${ref}`;
    const result = await this.fetchWithRetry<GitHubContent>(url);

    this.setCache(cacheKey, result);
    return result;
  }

  /**
   * Get decoded file content as string.
   * @param path - File path relative to repo root.
   * @param ref - Git ref. Defaults to HEAD.
   */
  async getFileText(path: string, ref = "HEAD"): Promise<string> {
    const content = await this.getFileContent(path, ref);
    if (content.encoding === "base64") {
      return Buffer.from(content.content, "base64").toString("utf-8");
    }
    return content.content;
  }

  /**
   * List files matching a glob pattern.
   * @param pattern - Glob pattern (e.g., "**\/*.ts").
   * @param ref - Git ref. Defaults to HEAD.
   */
  async listFiles(extensions: string[], ref = "HEAD"): Promise<GitHubFile[]> {
    const tree = await this.getTree(ref, true);
    return tree.tree.filter((f) => f.type === "file" && extensions.some((ext) => f.path.endsWith(ext)));
  }

  /**
   * Get current rate limit status.
   */
  getRateLimit(): RateLimitState | null {
    return this.rateLimit;
  }

  /**
   * Check if we should wait before making requests due to rate limiting.
   */
  shouldThrottle(): boolean {
    if (!this.rateLimit) return false;
    const now = this.clock();
    return this.rateLimit.remaining <= 10 && this.rateLimit.reset > now;
  }

  /**
   * Get time until rate limit resets (in seconds).
   */
  getTimeToReset(): number {
    if (!this.rateLimit) return 0;
    const now = this.clock();
    return Math.max(0, Math.floor((this.rateLimit.reset.getTime() - now.getTime()) / 1000));
  }

  // ── Private Methods ─────────────────────────────────────────────────────────

  private async fetchWithRetry<T>(url: string): Promise<T> {
    const maxRetries = 5;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Check rate limit before request
        if (this.shouldThrottle()) {
          const waitTime = this.getTimeToReset() * 1000;
          await this.sleep(Math.min(waitTime, this.config.backoffMaxMs));
        }

        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${this.pat}`,
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "Talos-E2E-Testing",
          },
        });

        // Update rate limit from headers
        this.updateRateLimit(response.headers);

        if (response.status === 403 && this.rateLimit && this.rateLimit.remaining === 0) {
          // Rate limited - wait and retry
          const waitTime = this.getTimeToReset() * 1000;
          await this.sleep(Math.min(waitTime, this.config.backoffMaxMs));
          continue;
        }

        if (response.status === 404) {
          throw new GitHubNotFoundError(`Resource not found: ${url}`);
        }

        if (!response.ok) {
          throw new GitHubApiError(`GitHub API error: ${response.status} ${response.statusText}`, response.status);
        }

        this.backoffAttempts = 0;
        return (await response.json()) as T;
      } catch (error) {
        if (error instanceof GitHubNotFoundError) {
          throw error;
        }

        if (attempt === maxRetries) {
          throw error;
        }

        // Exponential backoff
        const delay = Math.min(this.config.backoffBaseMs * Math.pow(2, this.backoffAttempts), this.config.backoffMaxMs);
        this.backoffAttempts++;
        await this.sleep(delay);
      }
    }

    throw new GitHubApiError("Max retries exceeded", 500);
  }

  private updateRateLimit(headers: Headers) {
    const remaining = headers.get("x-ratelimit-remaining");
    const reset = headers.get("x-ratelimit-reset");
    const limit = headers.get("x-ratelimit-limit");

    if (remaining && reset && limit) {
      this.rateLimit = {
        remaining: parseInt(remaining, 10),
        reset: new Date(parseInt(reset, 10) * 1000),
        limit: parseInt(limit, 10),
      };
    }
  }

  private getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = this.clock();
    if (entry.expiresAt < now) {
      this.cache.delete(key);
      return null;
    }

    return entry.value as T;
  }

  private setCache(key: string, value: unknown) {
    const now = this.clock();
    const expiresAt = new Date(now.getTime() + this.config.cacheTtlSeconds * 1000);
    this.cache.set(key, { value, expiresAt });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ── Error Classes ─────────────────────────────────────────────────────────────

export class GitHubApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

export class GitHubNotFoundError extends GitHubApiError {
  constructor(message: string) {
    super(message, 404);
    this.name = "GitHubNotFoundError";
  }
}

export class GitHubRateLimitError extends GitHubApiError {
  constructor(
    message: string,
    public readonly resetAt: Date
  ) {
    super(message, 403);
    this.name = "GitHubRateLimitError";
  }
}
