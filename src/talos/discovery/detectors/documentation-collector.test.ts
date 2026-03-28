import { describe, it, expect } from "vitest";
import { detectDocumentation } from "./documentation-collector.js";

describe("detectDocumentation", () => {
  it("detects README files at root and nested", () => {
    const files = [{ path: "README.md" }, { path: "packages/core/README.md" }];
    const results = detectDocumentation(files);
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ filePath: "README.md", type: "readme" }),
        expect.objectContaining({ filePath: "packages/core/README.md", type: "readme" }),
      ])
    );
  });

  it("detects CONTRIBUTING and CHANGELOG files", () => {
    const files = [{ path: "CONTRIBUTING.md" }, { path: "CHANGELOG.md" }];
    const results = detectDocumentation(files);
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ filePath: "CONTRIBUTING.md", type: "contributing" }),
        expect.objectContaining({ filePath: "CHANGELOG.md", type: "changelog" }),
      ])
    );
  });

  it("detects OpenAPI and Swagger specs", () => {
    const files = [
      { path: "api/openapi.yaml" },
      { path: "api.openapi.json" },
      { path: "swagger.yaml" },
      { path: "docs/swagger.json" },
    ];
    const results = detectDocumentation(files);
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "api-spec" }),
        expect.objectContaining({ type: "api-spec" }),
        expect.objectContaining({ type: "api-spec" }),
        expect.objectContaining({ type: "api-spec" }),
      ])
    );
    expect(results).toHaveLength(4);
  });

  it("detects markdown files in docs/ directory", () => {
    const files = [
      { path: "docs/getting-started.md" },
      { path: "docs/api-reference.md" },
      { path: "docs/architecture/overview.md" },
    ];
    const results = detectDocumentation(files);
    expect(results).toHaveLength(3);
    results.forEach((doc) => {
      expect(doc.type).toBe("guide");
    });
  });

  it("generates title from filename", () => {
    const files = [{ path: "docs/getting-started.md" }];
    const results = detectDocumentation(files);
    expect(results[0].title).toBe("Getting Started");
  });

  it("ignores non-documentation files", () => {
    const files = [
      { path: "src/index.ts" },
      { path: "package.json" },
      { path: ".gitignore" },
      { path: "node_modules/foo/README.md" },
    ];
    const results = detectDocumentation(files);
    // node_modules/foo/README.md should still be detected (the tree filter should exclude it upstream)
    expect(results).toHaveLength(1);
  });

  it("detects API.md as api-spec", () => {
    const files = [{ path: "API.md" }];
    const results = detectDocumentation(files);
    expect(results).toEqual(
      expect.arrayContaining([expect.objectContaining({ filePath: "API.md", type: "api-spec" })])
    );
  });

  it("returns empty for no documentation files", () => {
    const files = [{ path: "src/main.rs" }, { path: "Cargo.toml" }];
    const results = detectDocumentation(files);
    expect(results).toEqual([]);
  });

  it("deduplicates files", () => {
    const files = [{ path: "README.md" }, { path: "README.md" }];
    const results = detectDocumentation(files);
    expect(results).toHaveLength(1);
  });
});
