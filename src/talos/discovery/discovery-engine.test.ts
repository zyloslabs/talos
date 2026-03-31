/**
 * Tests for DiscoveryEngine
 * Covers: constructor, startDiscovery, getProgress, URL parsing, file filtering, onProgress callback
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { TalosRepository } from "../repository.js";
import { DiscoveryEngine, type ParsedRepoUrl, type DiscoveryProgress } from "./discovery-engine.js";

// Mock GitHubApiClient so network calls don't hang
vi.mock("./github-api-client.js", () => ({
  GitHubApiClient: class MockGitHubApiClient {
    static apiBaseFromHost(host: string) {
      return host === "github.com" ? "https://api.github.com" : `https://${host}/api/v3`;
    }
    async getTree() {
      return {
        sha: "abc123",
        tree: [
          { path: "src/index.ts", type: "file", size: 200, sha: "a1" },
          { path: "src/utils.ts", type: "file", size: 150, sha: "a2" },
          { path: "README.md", type: "file", size: 100, sha: "a3" },
          { path: "node_modules/lib.js", type: "file", size: 50, sha: "a4" },
        ],
        truncated: false,
      };
    }
    async getFileText() {
      return "export function hello() { return 'world'; }";
    }
  },
}));

function createRepo() {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const repo = new TalosRepository(db);
  repo.migrate();
  return repo;
}

const discoveryConfig = {
  maxFileSizeBytes: 100000,
  chunkSize: 500,
  chunkOverlap: 50,
  includeExtensions: [".ts", ".tsx", ".js", ".jsx", ".py"],
  excludePatterns: ["node_modules", "dist", ".git"],
};

describe("DiscoveryEngine", () => {
  let repo: TalosRepository;

  beforeEach(() => {
    repo = createRepo();
  });

  it("constructs with minimal options", () => {
    const engine = new DiscoveryEngine({
      repository: repo,
      config: discoveryConfig,
    });
    expect(engine).toBeDefined();
  });

  it("constructs with full options", () => {
    const engine = new DiscoveryEngine({
      repository: repo,
      config: discoveryConfig,
      resolveSecret: async () => "secret",
      storeChunks: async () => {},
      clock: () => new Date("2025-01-01"),
    });
    expect(engine).toBeDefined();
  });

  it("startDiscovery returns job with resolved status and real counts", async () => {
    const storeChunks = vi.fn();
    const engine = new DiscoveryEngine({
      repository: repo,
      config: discoveryConfig,
      resolveSecret: async () => "ghp_test",
      storeChunks,
      clock: () => new Date("2025-01-01"),
    });

    const app = repo.createApplication({
      name: "TestApp",
      repositoryUrl: "https://github.com/owner/repo",
      baseUrl: "https://example.com",
      githubPatRef: "vault:github-pat",
    });

    const job = await engine.startDiscovery(app);
    expect(job.id).toBeTruthy();
    expect(job.status).toBe("completed");
    expect(job.applicationId).toBe(app.id);
    // Mock tree has 2 .ts files that match includeExtensions
    expect(job.filesDiscovered).toBe(4); // total files in tree
    expect(job.filesIndexed).toBe(2);    // only .ts files pass filter
    expect(job.chunksCreated).toBeGreaterThan(0);
    expect(storeChunks).toHaveBeenCalledOnce();
  });

  it("getProgress returns null for unknown job", () => {
    const engine = new DiscoveryEngine({
      repository: repo,
      config: discoveryConfig,
    });
    expect(engine.getProgress("nonexistent")).toBeNull();
  });

  it("getProgress returns progress for started job", async () => {
    const engine = new DiscoveryEngine({
      repository: repo,
      config: discoveryConfig,
      resolveSecret: async () => "ghp_test",
      storeChunks: async () => {},
    });

    const app = repo.createApplication({
      name: "TestApp",
      repositoryUrl: "https://github.com/owner/repo",
      baseUrl: "https://example.com",
      githubPatRef: "vault:github-pat",
    });

    const job = await engine.startDiscovery(app);
    const progress = engine.getProgress(job.id);
    expect(progress).toBeTruthy();
    expect(progress!.jobId).toBe(job.id);
    expect(progress!.status).toBe("completed");
  });

  it("startDiscovery fails when no PAT configured", async () => {
    const engine = new DiscoveryEngine({
      repository: repo,
      config: discoveryConfig,
      resolveSecret: async () => "ghp_test",
    });

    const app = repo.createApplication({
      name: "TestApp",
      repositoryUrl: "https://github.com/owner/repo",
      baseUrl: "https://example.com",
      // No githubPatRef
    });

    // startDiscovery now awaits and throws on failure
    await expect(engine.startDiscovery(app)).rejects.toThrow("PAT");
  });

  it("parseRepoUrl handles HTTPS URLs", () => {
    const engine = new DiscoveryEngine({
      repository: repo,
      config: discoveryConfig,
    });
    // Access private method
    const parse = (engine as unknown as { parseRepoUrl: (url: string) => ParsedRepoUrl })
      .parseRepoUrl;
    const result = parse.call(engine, "https://github.com/myorg/myrepo");
    expect(result).toEqual({ host: "github.com", owner: "myorg", repo: "myrepo" });
  });

  it("parseRepoUrl handles SSH URLs", () => {
    const engine = new DiscoveryEngine({
      repository: repo,
      config: discoveryConfig,
    });
    const parse = (engine as unknown as { parseRepoUrl: (url: string) => ParsedRepoUrl })
      .parseRepoUrl;
    const result = parse.call(engine, "git@github.com:myorg/myrepo.git");
    expect(result).toEqual({ host: "github.com", owner: "myorg", repo: "myrepo" });
  });

  it("parseRepoUrl handles owner/repo format", () => {
    const engine = new DiscoveryEngine({
      repository: repo,
      config: discoveryConfig,
    });
    const parse = (engine as unknown as { parseRepoUrl: (url: string) => ParsedRepoUrl })
      .parseRepoUrl;
    const result = parse.call(engine, "myorg/myrepo");
    expect(result).toEqual({ host: "github.com", owner: "myorg", repo: "myrepo" });
  });

  it("parseRepoUrl throws for invalid URL", () => {
    const engine = new DiscoveryEngine({
      repository: repo,
      config: discoveryConfig,
    });
    const parse = (engine as unknown as { parseRepoUrl: (url: string) => ParsedRepoUrl })
      .parseRepoUrl;
    expect(() => parse.call(engine, "")).toThrow("Invalid repository URL");
  });

  it("parseRepoUrl handles GitHub Enterprise HTTPS URLs", () => {
    const engine = new DiscoveryEngine({
      repository: repo,
      config: discoveryConfig,
    });
    const parse = (engine as unknown as { parseRepoUrl: (url: string) => ParsedRepoUrl })
      .parseRepoUrl;
    const result = parse.call(engine, "https://git.nyiso.com/GOT/GFER-Cloud");
    expect(result).toEqual({ host: "git.nyiso.com", owner: "GOT", repo: "GFER-Cloud" });
  });

  it("parseRepoUrl handles GHE SSH URLs", () => {
    const engine = new DiscoveryEngine({
      repository: repo,
      config: discoveryConfig,
    });
    const parse = (engine as unknown as { parseRepoUrl: (url: string) => ParsedRepoUrl })
      .parseRepoUrl;
    const result = parse.call(engine, "git@git.nyiso.com:GOT/GFER-Cloud.git");
    expect(result).toEqual({ host: "git.nyiso.com", owner: "GOT", repo: "GFER-Cloud" });
  });

  it("parseRepoUrl strips .git suffix from HTTPS URLs", () => {
    const engine = new DiscoveryEngine({
      repository: repo,
      config: discoveryConfig,
    });
    const parse = (engine as unknown as { parseRepoUrl: (url: string) => ParsedRepoUrl })
      .parseRepoUrl;
    const result = parse.call(engine, "https://github.com/org/repo.git");
    expect(result).toEqual({ host: "github.com", owner: "org", repo: "repo" });
  });

  it("parseRepoUrl handles trailing slash on HTTPS URLs", () => {
    const engine = new DiscoveryEngine({
      repository: repo,
      config: discoveryConfig,
    });
    const parse = (engine as unknown as { parseRepoUrl: (url: string) => ParsedRepoUrl })
      .parseRepoUrl;
    const result = parse.call(engine, "https://github.com/org/repo/");
    expect(result).toEqual({ host: "github.com", owner: "org", repo: "repo" });
  });

  it("parseRepoUrl handles repos with dots in the name", () => {
    const engine = new DiscoveryEngine({
      repository: repo,
      config: discoveryConfig,
    });
    const parse = (engine as unknown as { parseRepoUrl: (url: string) => ParsedRepoUrl })
      .parseRepoUrl;
    expect(parse.call(engine, "https://github.com/vercel/next.js")).toEqual({
      host: "github.com",
      owner: "vercel",
      repo: "next.js",
    });
    expect(parse.call(engine, "git@github.com:vercel/next.js.git")).toEqual({
      host: "github.com",
      owner: "vercel",
      repo: "next.js",
    });
  });

  it("parseRepoUrl throws for single-segment string", () => {
    const engine = new DiscoveryEngine({
      repository: repo,
      config: discoveryConfig,
    });
    const parse = (engine as unknown as { parseRepoUrl: (url: string) => ParsedRepoUrl })
      .parseRepoUrl;
    expect(() => parse.call(engine, "just-a-name")).toThrow("Invalid repository URL");
  });

  it("uses GITHUB_PERSONAL_ACCESS_TOKEN env var when app has no githubPatRef", async () => {
    const prev = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
    process.env.GITHUB_PERSONAL_ACCESS_TOKEN = "ghp_fake_env_token";
    try {
      const engine = new DiscoveryEngine({
        repository: repo,
        config: discoveryConfig,
      });

      const app = repo.createApplication({
        name: "EnvPAT App",
        repositoryUrl: "https://github.com/fake/repo",
        baseUrl: "https://example.com",
      });

      // Should succeed (mock doesn't make real network calls)
      const job = await engine.startDiscovery(app);
      expect(job.status).toBe("completed");
    } finally {
      if (prev === undefined) {
        delete process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
      } else {
        process.env.GITHUB_PERSONAL_ACCESS_TOKEN = prev;
      }
    }
  });

  it("uses GHE_PERSONAL_ACCESS_TOKEN env var for non-github.com repos", async () => {
    const prevGhe = process.env.GHE_PERSONAL_ACCESS_TOKEN;
    const prevGh = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
    process.env.GHE_PERSONAL_ACCESS_TOKEN = "ghp_fake_ghe_token";
    delete process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
    try {
      const engine = new DiscoveryEngine({
        repository: repo,
        config: discoveryConfig,
      });

      const app = repo.createApplication({
        name: "GHE App",
        repositoryUrl: "https://git.nyiso.com/GOT/GFER-Cloud",
        baseUrl: "https://example.com",
      });

      const job = await engine.startDiscovery(app);
      expect(job.status).toBe("completed");
    } finally {
      if (prevGhe === undefined) {
        delete process.env.GHE_PERSONAL_ACCESS_TOKEN;
      } else {
        process.env.GHE_PERSONAL_ACCESS_TOKEN = prevGhe;
      }
      if (prevGh === undefined) {
        delete process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
      } else {
        process.env.GITHUB_PERSONAL_ACCESS_TOKEN = prevGh;
      }
    }
  });

  it("falls back to GITHUB_PERSONAL_ACCESS_TOKEN for GHE repos when GHE var not set", async () => {
    const prevGhe = process.env.GHE_PERSONAL_ACCESS_TOKEN;
    const prevGh = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
    delete process.env.GHE_PERSONAL_ACCESS_TOKEN;
    process.env.GITHUB_PERSONAL_ACCESS_TOKEN = "ghp_fallback_token";
    try {
      const engine = new DiscoveryEngine({
        repository: repo,
        config: discoveryConfig,
      });

      const app = repo.createApplication({
        name: "GHE Fallback App",
        repositoryUrl: "https://git.nyiso.com/GOT/GFER-Cloud",
        baseUrl: "https://example.com",
      });

      const job = await engine.startDiscovery(app);
      expect(job.status).toBe("completed");
    } finally {
      if (prevGhe === undefined) {
        delete process.env.GHE_PERSONAL_ACCESS_TOKEN;
      } else {
        process.env.GHE_PERSONAL_ACCESS_TOKEN = prevGhe;
      }
      if (prevGh === undefined) {
        delete process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
      } else {
        process.env.GITHUB_PERSONAL_ACCESS_TOKEN = prevGh;
      }
    }
  });

  it("throws descriptive error for GHE repos when no PAT is set", async () => {
    const prevGhe = process.env.GHE_PERSONAL_ACCESS_TOKEN;
    const prevGh = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
    delete process.env.GHE_PERSONAL_ACCESS_TOKEN;
    delete process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
    try {
      const engine = new DiscoveryEngine({
        repository: repo,
        config: discoveryConfig,
      });

      const app = repo.createApplication({
        name: "GHE No PAT App",
        repositoryUrl: "https://git.nyiso.com/GOT/GFER-Cloud",
        baseUrl: "https://example.com",
      });

      await expect(engine.startDiscovery(app)).rejects.toThrow("GHE_PERSONAL_ACCESS_TOKEN");
    } finally {
      if (prevGhe === undefined) {
        delete process.env.GHE_PERSONAL_ACCESS_TOKEN;
      } else {
        process.env.GHE_PERSONAL_ACCESS_TOKEN = prevGhe;
      }
      if (prevGh === undefined) {
        delete process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
      } else {
        process.env.GITHUB_PERSONAL_ACCESS_TOKEN = prevGh;
      }
    }
  });

  it("filterFiles respects includeExtensions and excludePatterns", () => {
    const engine = new DiscoveryEngine({
      repository: repo,
      config: discoveryConfig,
    });
    const filter = (
      engine as unknown as {
        filterFiles: (files: { path: string; type: string; size: number }[]) => { path: string }[];
      }
    ).filterFiles;

    const files = [
      { path: "src/app.ts", type: "file", size: 100 },
      { path: "src/app.tsx", type: "file", size: 100 },
      { path: "node_modules/lib.ts", type: "file", size: 100 },
      { path: "README.md", type: "file", size: 100 },
      { path: "src/dir", type: "tree", size: 0 },
    ];

    const result = filter.call(engine, files);
    expect(result).toHaveLength(2);
    expect(result.map((f: { path: string }) => f.path)).toEqual(["src/app.ts", "src/app.tsx"]);
  });

  it("onProgress callback is invoked during discovery", async () => {
    const progressUpdates: DiscoveryProgress[] = [];
    const engine = new DiscoveryEngine({
      repository: repo,
      config: discoveryConfig,
      resolveSecret: async () => "ghp_test",
      storeChunks: async () => {},
    });

    const app = repo.createApplication({
      name: "ProgressApp",
      repositoryUrl: "https://github.com/owner/repo",
      baseUrl: "https://example.com",
      githubPatRef: "vault:github-pat",
    });

    const onProgress = vi.fn((progress: DiscoveryProgress) => {
      progressUpdates.push({ ...progress });
    });

    const job = await engine.startDiscovery(app, false, onProgress);
    expect(job.status).toBe("completed");
    // onProgress should be called: 1 (after tree) + 2 (per indexed .ts file) = 3 times
    expect(onProgress).toHaveBeenCalledTimes(3);
    // First call: after tree discovery (filesDiscovered > 0, filesIndexed = 0)
    expect(progressUpdates[0].filesDiscovered).toBe(4);
    expect(progressUpdates[0].filesIndexed).toBe(0);
    // Last call: after last file processed
    expect(progressUpdates[progressUpdates.length - 1].filesIndexed).toBe(2);
    expect(progressUpdates[progressUpdates.length - 1].chunksCreated).toBeGreaterThan(0);
  });

  it("startDiscovery re-throws errors and sets progress to failed", async () => {
    const engine = new DiscoveryEngine({
      repository: repo,
      config: discoveryConfig,
      resolveSecret: async () => { throw new Error("vault unavailable"); },
      storeChunks: async () => {},
    });

    const app = repo.createApplication({
      name: "ErrorApp",
      repositoryUrl: "https://github.com/owner/repo",
      baseUrl: "https://example.com",
      githubPatRef: "vault:secret",
    });

    await expect(engine.startDiscovery(app)).rejects.toThrow("vault unavailable");

    // Progress should be tracked as failed
    const jobs = (engine as unknown as { jobs: Map<string, { status: string; errorMessage?: string }> }).jobs;
    const progress = [...jobs.values()][0];
    expect(progress.status).toBe("failed");
    expect(progress.errorMessage).toBe("vault unavailable");
  });
});
