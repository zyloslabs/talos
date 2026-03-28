import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GitHubExportService } from "./github-export-service.js";

// ── Helper to create a mock fetch response ────────────────────────────────────

function mockResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GitHubExportService", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("constructor", () => {
    it("throws when PAT is empty", () => {
      expect(() => new GitHubExportService({ pat: "" })).toThrow("GitHub PAT is required");
    });

    it("uses default GitHub base URL", () => {
      const svc = new GitHubExportService({ pat: "tok" });
      expect(svc).toBeDefined();
    });

    it("accepts a custom base URL", () => {
      const svc = new GitHubExportService({ pat: "tok", baseUrl: "http://localhost:8080" });
      expect(svc).toBeDefined();
    });

    it("strips trailing slash from baseUrl", () => {
      const svc = new GitHubExportService({ pat: "tok", baseUrl: "http://localhost:8080/" });
      // Test that ensureRepo uses the stripped URL (no double-slash)
      fetchMock.mockResolvedValueOnce(mockResponse(200, { id: 1 }));
      void svc.ensureRepo("owner", "repo", false);
      const calledUrl = fetchMock.mock.calls[0][0] as string;
      expect(calledUrl).toBe("http://localhost:8080/repos/owner/repo");
    });
  });

  describe("ensureRepo", () => {
    it("returns exists=true, created=false when repo already exists", async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(200, { id: 1, name: "repo" }));

      const svc = new GitHubExportService({ pat: "tok" });
      const result = await svc.ensureRepo("myorg", "myrepo", false);

      expect(result).toEqual({ created: false, exists: true });
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.github.com/repos/myorg/myrepo",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer tok",
            "X-GitHub-Api-Version": "2022-11-28",
          }),
        })
      );
    });

    it("creates repo when not found and createIfNotExists=true", async () => {
      fetchMock
        .mockResolvedValueOnce(mockResponse(404, { message: "Not Found" }))
        .mockResolvedValueOnce(mockResponse(201, { id: 2, name: "myrepo" }));

      const svc = new GitHubExportService({ pat: "tok" });
      const result = await svc.ensureRepo("myorg", "myrepo", true);

      expect(result).toEqual({ created: true, exists: true });

      // Second call should POST to /user/repos
      const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
      expect(url).toBe("https://api.github.com/user/repos");
      expect(init.method).toBe("POST");
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body.name).toBe("myrepo");
      expect(body.auto_init).toBe(true);
    });

    it("returns exists=false when not found and createIfNotExists=false", async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(404, { message: "Not Found" }));

      const svc = new GitHubExportService({ pat: "tok" });
      const result = await svc.ensureRepo("myorg", "myrepo", false);

      expect(result).toEqual({ created: false, exists: false });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("throws when create repo fails", async () => {
      fetchMock
        .mockResolvedValueOnce(mockResponse(404, { message: "Not Found" }))
        .mockResolvedValueOnce(mockResponse(422, { message: "Already exists" }));

      const svc = new GitHubExportService({ pat: "tok" });
      await expect(svc.ensureRepo("myorg", "myrepo", true)).rejects.toThrow(
        "Failed to create repository"
      );
    });

    it("throws on unexpected error status", async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(500, { message: "Server Error" }));

      const svc = new GitHubExportService({ pat: "tok" });
      await expect(svc.ensureRepo("myorg", "myrepo", false)).rejects.toThrow(
        "Failed to check repository"
      );
    });
  });

  describe("pushFiles", () => {
    it("creates new files when they do not exist (no SHA)", async () => {
      // GET returns 404 (file not found), PUT returns 201 (created)
      fetchMock
        .mockResolvedValueOnce(mockResponse(404, { message: "Not Found" })) // GET file SHA
        .mockResolvedValueOnce(mockResponse(201, { content: { sha: "abc123" } })); // PUT

      const svc = new GitHubExportService({ pat: "tok" });
      const result = await svc.pushFiles("owner", "repo", "main", [
        { path: "tests/example.spec.ts", content: "test content" },
      ]);

      expect(result.pushedCount).toBe(1);
      expect(result.repoUrl).toBe("https://github.com/owner/repo");

      const [putUrl, putInit] = fetchMock.mock.calls[1] as [string, RequestInit];
      expect(putUrl).toContain("/repos/owner/repo/contents/");
      expect(putInit.method).toBe("PUT");
      const body = JSON.parse(putInit.body as string) as Record<string, unknown>;
      expect(body.content).toBe(Buffer.from("test content").toString("base64"));
      expect(body.branch).toBe("main");
      expect(body.sha).toBeUndefined();
    });

    it("updates existing files using their SHA", async () => {
      // GET returns existing file with SHA
      fetchMock
        .mockResolvedValueOnce(mockResponse(200, { sha: "existing-sha-123" })) // GET
        .mockResolvedValueOnce(mockResponse(200, { content: { sha: "new-sha" } })); // PUT (update)

      const svc = new GitHubExportService({ pat: "tok" });
      const result = await svc.pushFiles("owner", "repo", "main", [
        { path: "tests/existing.spec.ts", content: "updated content" },
      ]);

      expect(result.pushedCount).toBe(1);

      const [, putInit] = fetchMock.mock.calls[1] as [string, RequestInit];
      const body = JSON.parse(putInit.body as string) as Record<string, unknown>;
      expect(body.sha).toBe("existing-sha-123");
    });

    it("pushes multiple files and counts them all", async () => {
      // Two files: first is new, second exists
      fetchMock
        .mockResolvedValueOnce(mockResponse(404, {})) // GET file 1
        .mockResolvedValueOnce(mockResponse(201, {})) // PUT file 1
        .mockResolvedValueOnce(mockResponse(200, { sha: "sha-2" })) // GET file 2
        .mockResolvedValueOnce(mockResponse(200, {})); // PUT file 2

      const svc = new GitHubExportService({ pat: "tok" });
      const result = await svc.pushFiles("owner", "repo", "main", [
        { path: "tests/a.spec.ts", content: "test a" },
        { path: "tests/b.spec.ts", content: "test b" },
      ]);

      expect(result.pushedCount).toBe(2);
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it("returns zero pushedCount for empty file list", async () => {
      const svc = new GitHubExportService({ pat: "tok" });
      const result = await svc.pushFiles("owner", "repo", "main", []);
      expect(result.pushedCount).toBe(0);
      expect(result.repoUrl).toBe("https://github.com/owner/repo");
    });

    it("throws when PUT fails", async () => {
      fetchMock
        .mockResolvedValueOnce(mockResponse(404, {})) // GET
        .mockResolvedValueOnce(mockResponse(422, { message: "Validation Failed" })); // PUT

      const svc = new GitHubExportService({ pat: "tok" });
      await expect(
        svc.pushFiles("owner", "repo", "main", [{ path: "tests/fail.spec.ts", content: "x" }])
      ).rejects.toThrow("Failed to push file");
    });

    it("properly encodes file paths with special characters", async () => {
      fetchMock
        .mockResolvedValueOnce(mockResponse(404, {}))
        .mockResolvedValueOnce(mockResponse(201, {}));

      const svc = new GitHubExportService({ pat: "tok" });
      await svc.pushFiles("owner", "repo", "main", [
        { path: "tests/my test.spec.ts", content: "x" },
      ]);

      const getUrl = fetchMock.mock.calls[0][0] as string;
      expect(getUrl).toContain("my%20test.spec.ts");
    });

    it("uses branch param in GET and PUT", async () => {
      fetchMock
        .mockResolvedValueOnce(mockResponse(404, {}))
        .mockResolvedValueOnce(mockResponse(201, {}));

      const svc = new GitHubExportService({ pat: "tok" });
      await svc.pushFiles("owner", "repo", "feature-branch", [
        { path: "tests/a.spec.ts", content: "test" },
      ]);

      const getUrl = fetchMock.mock.calls[0][0] as string;
      expect(getUrl).toContain("ref=feature-branch");

      const [, putInit] = fetchMock.mock.calls[1] as [string, RequestInit];
      const body = JSON.parse(putInit.body as string) as Record<string, unknown>;
      expect(body.branch).toBe("feature-branch");
    });
  });
});
