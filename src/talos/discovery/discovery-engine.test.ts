/**
 * Tests for DiscoveryEngine
 * Covers: constructor, startDiscovery, getProgress, URL parsing, file filtering
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { TalosRepository } from "../repository.js";
import { DiscoveryEngine, type ParsedRepoUrl } from "./discovery-engine.js";

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

  it("startDiscovery returns job with pending status", async () => {
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
    expect(job.status).toBe("pending");
    expect(job.applicationId).toBe(app.id);
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

    const job = await engine.startDiscovery(app);
    // Wait for background runDiscovery to fail
    await new Promise((r) => setTimeout(r, 50));
    const progress = engine.getProgress(job.id);
    expect(progress!.status).toBe("failed");
    expect(progress!.errorMessage).toContain("PAT");
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
        // no resolveSecret needed since we fall back to env var
      });

      const app = repo.createApplication({
        name: "EnvPAT App",
        repositoryUrl: "https://github.com/fake/repo",
        baseUrl: "https://example.com",
        // no githubPatRef — should use env var
      });

      const job = await engine.startDiscovery(app);
      // Wait for background task to attempt and fail at network level (not PAT check)
      await new Promise((r) => setTimeout(r, 100));
      const progress = engine.getProgress(job.id);
      // Whatever the final status, the error should not be about missing PAT
      expect(progress!.errorMessage ?? "").not.toContain("No GitHub PAT");
    } finally {
      if (prev === undefined) {
        delete process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
      } else {
        process.env.GITHUB_PERSONAL_ACCESS_TOKEN = prev;
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
});
