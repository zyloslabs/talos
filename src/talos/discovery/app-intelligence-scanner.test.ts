import { describe, it, expect, vi } from "vitest";
import { AppIntelligenceScanner } from "./app-intelligence-scanner.js";
import type { GitHubTree } from "./github-api-client.js";

describe("AppIntelligenceScanner", () => {
  const fixedDate = new Date("2026-03-28T12:00:00Z");
  const clock = () => fixedDate;

  function makeTree(files: { path: string; size?: number }[]): GitHubTree {
    return {
      sha: "abc123",
      url: "https://api.github.com/repos/test/test/git/trees/abc123",
      tree: files.map((f) => ({
        path: f.path,
        type: "file" as const,
        size: f.size ?? 100,
        sha: "sha-" + f.path,
        url: "",
      })),
      truncated: false,
    };
  }

  it("scans a Node.js repository", async () => {
    const tree = makeTree([
      { path: "package.json" },
      { path: ".env.example" },
      { path: "docker-compose.yml" },
      { path: "README.md" },
      { path: "docs/guide.md" },
      { path: "src/index.ts" },
      { path: "playwright.config.ts" },
    ]);

    const contentMap: Record<string, string> = {
      "package.json": JSON.stringify({
        dependencies: { react: "^18.0.0", express: "^4.18.0", prisma: "^5.0.0" },
        devDependencies: { typescript: "^5.3.0", vitest: "^1.0.0" },
      }),
      ".env.example":
        "TEST_USER_EMAIL=test@example.com\nTEST_USER_PASSWORD=secret\nDATABASE_URL=postgres://user:pass@localhost:5432/mydb",
      "docker-compose.yml": "services:\n  db:\n    image: postgres:16\n  cache:\n    image: redis:7",
      "playwright.config.ts": "export default { globalSetup: './setup.ts', use: { storageState: 'auth.json' } }",
    };

    const fetchContent = vi.fn(async (path: string) => {
      if (contentMap[path]) return contentMap[path];
      throw new Error(`Not found: ${path}`);
    });

    const scanner = new AppIntelligenceScanner({ applicationId: "app-1", clock });
    const report = await scanner.scan(tree, fetchContent);

    // Verify structure
    expect(report.applicationId).toBe("app-1");
    expect(report.scannedAt).toEqual(fixedDate);
    expect(report.id).toBeTruthy();

    // Tech stack detected
    expect(report.techStack).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "React", category: "framework" }),
        expect.objectContaining({ name: "Express", category: "framework" }),
        expect.objectContaining({ name: "TypeScript", category: "build" }),
      ])
    );

    // Databases detected
    expect(report.databases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "PostgreSQL" }),
        expect.objectContaining({ type: "Redis" }),
      ])
    );

    // Test users detected
    expect(report.testUsers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ variableName: "TEST_USER_EMAIL" }),
        expect.objectContaining({ variableName: "globalSetup" }),
      ])
    );

    // Documentation detected
    expect(report.documentation).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ filePath: "README.md", type: "readme" }),
        expect.objectContaining({ filePath: "docs/guide.md", type: "guide" }),
      ])
    );

    // Config files detected
    expect(report.configFiles.length).toBeGreaterThan(0);

    // Verify content fetcher was called only for scannable files
    expect(fetchContent).toHaveBeenCalledWith("package.json");
    expect(fetchContent).toHaveBeenCalledWith(".env.example");
    expect(fetchContent).toHaveBeenCalledWith("docker-compose.yml");
    expect(fetchContent).not.toHaveBeenCalledWith("src/index.ts");
    expect(fetchContent).not.toHaveBeenCalledWith("README.md");
  });

  it("handles fetch errors gracefully", async () => {
    const tree = makeTree([{ path: "package.json" }, { path: ".env.example" }]);

    const fetchContent = vi.fn(async () => {
      throw new Error("Network error");
    });

    const scanner = new AppIntelligenceScanner({ applicationId: "app-1", clock });
    const report = await scanner.scan(tree, fetchContent);

    // Should not throw, just return empty results
    expect(report.techStack).toEqual([]);
    expect(report.databases).toEqual([]);
    expect(report.testUsers).toEqual([]);
  });

  it("works with empty repository", async () => {
    const tree = makeTree([]);
    const fetchContent = vi.fn(async () => "");

    const scanner = new AppIntelligenceScanner({ applicationId: "app-1", clock });
    const report = await scanner.scan(tree, fetchContent);

    expect(report.techStack).toEqual([]);
    expect(report.databases).toEqual([]);
    expect(report.testUsers).toEqual([]);
    expect(report.documentation).toEqual([]);
    expect(report.configFiles).toEqual([]);
    expect(fetchContent).not.toHaveBeenCalled();
  });

  it("uses clock for deterministic timestamps", async () => {
    const customDate = new Date("2025-01-01T00:00:00Z");
    const tree = makeTree([]);
    const fetchContent = vi.fn(async () => "");

    const scanner = new AppIntelligenceScanner({ applicationId: "app-1", clock: () => customDate });
    const report = await scanner.scan(tree, fetchContent);

    expect(report.scannedAt).toEqual(customDate);
  });

  it("scans multiple manifest files from different ecosystems", async () => {
    const tree = makeTree([{ path: "package.json" }, { path: "requirements.txt" }, { path: "go.mod" }]);

    const contentMap: Record<string, string> = {
      "package.json": JSON.stringify({ dependencies: { express: "^4.0.0" } }),
      "requirements.txt": "django==4.2.0\n",
      "go.mod": "module myapp\ngo 1.21\nrequire github.com/gin-gonic/gin v1.9.1\n",
    };

    const fetchContent = vi.fn(async (path: string) => contentMap[path] ?? "");

    const scanner = new AppIntelligenceScanner({ applicationId: "app-1", clock });
    const report = await scanner.scan(tree, fetchContent);

    expect(report.techStack).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Express" }),
        expect.objectContaining({ name: "Django" }),
        expect.objectContaining({ name: "Go" }),
        expect.objectContaining({ name: "Gin" }),
      ])
    );
  });
});
