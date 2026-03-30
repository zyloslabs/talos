/**
 * Tests for GitHubApiClient
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GitHubApiClient, GitHubNotFoundError, GitHubApiError } from "./github-api-client.js";

function createClient(overrides?: Partial<ConstructorParameters<typeof GitHubApiClient>[0]>) {
  return new GitHubApiClient({
    pat: "ghp_test",
    owner: "acme",
    repo: "app",
    config: { rateLimitPerHour: 5000, backoffBaseMs: 1, backoffMaxMs: 10, cacheTtlSeconds: 60 },
    clock: () => new Date("2025-01-01T00:00:00Z"),
    ...overrides,
  });
}

describe("GitHubApiClient", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("getTree fetches recursive tree", async () => {
    const tree = {
      sha: "abc",
      url: "u",
      tree: [{ path: "src/a.ts", type: "file", size: 100, sha: "s1", url: "u1" }],
      truncated: false,
    };
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(tree),
      headers: new Headers({
        "x-ratelimit-remaining": "4999",
        "x-ratelimit-reset": "1735689600",
        "x-ratelimit-limit": "5000",
      }),
    });

    const client = createClient();
    const result = await client.getTree("main");
    expect(result.tree).toHaveLength(1);
    expect(result.tree[0].path).toBe("src/a.ts");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/git/trees/main?recursive=1"),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer ghp_test" }) })
    );
  });

  it("getTree uses cache on repeat call", async () => {
    const tree = { sha: "abc", url: "u", tree: [], truncated: false };
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(tree),
      headers: new Headers({
        "x-ratelimit-remaining": "4999",
        "x-ratelimit-reset": "1735689600",
        "x-ratelimit-limit": "5000",
      }),
    });

    const client = createClient();
    await client.getTree("main");
    await client.getTree("main");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("getFileContent fetches file", async () => {
    const content = { path: "README.md", content: btoa("hello"), encoding: "base64", sha: "s", size: 5 };
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(content),
      headers: new Headers({
        "x-ratelimit-remaining": "4998",
        "x-ratelimit-reset": "1735689600",
        "x-ratelimit-limit": "5000",
      }),
    });

    const client = createClient();
    const result = await client.getFileContent("README.md");
    expect(result.path).toBe("README.md");
    expect(result.encoding).toBe("base64");
  });

  it("getFileText decodes base64", async () => {
    const content = {
      path: "a.ts",
      content: Buffer.from("const x = 1;").toString("base64"),
      encoding: "base64",
      sha: "s",
      size: 12,
    };
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(content),
      headers: new Headers({
        "x-ratelimit-remaining": "4998",
        "x-ratelimit-reset": "1735689600",
        "x-ratelimit-limit": "5000",
      }),
    });

    const client = createClient();
    const text = await client.getFileText("a.ts");
    expect(text).toBe("const x = 1;");
  });

  it("getFileText returns utf-8 content directly", async () => {
    const content = { path: "a.ts", content: "const x = 1;", encoding: "utf-8", sha: "s", size: 12 };
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(content),
      headers: new Headers({
        "x-ratelimit-remaining": "4998",
        "x-ratelimit-reset": "1735689600",
        "x-ratelimit-limit": "5000",
      }),
    });

    const client = createClient();
    const text = await client.getFileText("a.ts");
    expect(text).toBe("const x = 1;");
  });

  it("listFiles filters by extension", async () => {
    const tree = {
      sha: "abc",
      url: "u",
      truncated: false,
      tree: [
        { path: "src/a.ts", type: "file", size: 100, sha: "s1", url: "u1" },
        { path: "src/b.js", type: "file", size: 50, sha: "s2", url: "u2" },
        { path: "src/c", type: "dir", size: 0, sha: "s3", url: "u3" },
      ],
    };
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(tree),
      headers: new Headers({
        "x-ratelimit-remaining": "4999",
        "x-ratelimit-reset": "1735689600",
        "x-ratelimit-limit": "5000",
      }),
    });

    const client = createClient();
    const files = await client.listFiles([".ts"]);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("src/a.ts");
  });

  it("throws GitHubNotFoundError on 404", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      headers: new Headers({
        "x-ratelimit-remaining": "4999",
        "x-ratelimit-reset": "1735689600",
        "x-ratelimit-limit": "5000",
      }),
    });

    const client = createClient();
    await expect(client.getTree()).rejects.toThrow(GitHubNotFoundError);
  });

  it("throws on non-ok response", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Server Error",
      headers: new Headers({
        "x-ratelimit-remaining": "4999",
        "x-ratelimit-reset": "1735689600",
        "x-ratelimit-limit": "5000",
      }),
    });

    const client = createClient();
    await expect(client.getTree()).rejects.toThrow(GitHubApiError);
  });

  it("getRateLimit returns null initially", () => {
    const client = createClient();
    expect(client.getRateLimit()).toBeNull();
  });

  it("shouldThrottle returns false when no rate limit", () => {
    const client = createClient();
    expect(client.shouldThrottle()).toBe(false);
  });

  it("getTimeToReset returns 0 with no rate limit", () => {
    const client = createClient();
    expect(client.getTimeToReset()).toBe(0);
  });

  it("updates rate limit from headers", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ sha: "a", url: "u", tree: [], truncated: false }),
      headers: new Headers({
        "x-ratelimit-remaining": "100",
        "x-ratelimit-reset": "1735700000",
        "x-ratelimit-limit": "5000",
      }),
    });

    const client = createClient();
    await client.getTree("HEAD", false);
    const rl = client.getRateLimit();
    expect(rl).not.toBeNull();
    expect(rl!.remaining).toBe(100);
    expect(rl!.limit).toBe(5000);
  });
});
