/**
 * Tests for DocumentIngester (#282)
 * Covers: ingestMarkdown, ingestOpenAPI, ingestDocument dispatcher,
 *         section splitting, overlap, stable IDs, error handling
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { DocumentIngester, type DocMetadata } from "./document-ingester.js";

// Mock the RAG pipeline
const mockIndexChunks = vi.fn().mockResolvedValue({ indexed: 3, skipped: 0, totalTokens: 100 });
const mockRagPipeline = {
  indexChunks: mockIndexChunks,
  initialize: vi.fn(),
  retrieve: vi.fn(),
  findSimilar: vi.fn(),
  clearApplication: vi.fn(),
  getStats: vi.fn(),
  retrieveWithFilters: vi.fn(),
} as unknown as import("../rag/rag-pipeline.js").RagPipeline;

const baseMeta: DocMetadata = {
  fileName: "requirements.md",
  docType: "prd",
  version: "v1",
  tags: ["project-alpha"],
};

describe("DocumentIngester", () => {
  let ingester: DocumentIngester;

  beforeEach(() => {
    vi.clearAllMocks();
    ingester = new DocumentIngester({ ragPipeline: mockRagPipeline });
  });

  // ── ingestDocument dispatcher ───────────────────────────────────────────────

  describe("ingestDocument", () => {
    it("dispatches markdown format to ingestMarkdown", async () => {
      const content = "# Section\nSome requirement text";
      const result = await ingester.ingestDocument("app-1", content, "markdown", baseMeta);
      expect(result.docId).toContain("app-1");
      expect(mockIndexChunks).toHaveBeenCalled();
    });

    it("dispatches openapi_json format to ingestOpenAPI", async () => {
      const content = JSON.stringify({
        openapi: "3.0.0",
        paths: { "/users": { get: { summary: "List users", operationId: "listUsers" } } },
      });
      const meta: DocMetadata = { ...baseMeta, docType: "api_spec", fileName: "api.json" };
      const result = await ingester.ingestDocument("app-1", content, "openapi_json", meta);
      expect(result.docId).toContain("app-1");
    });

    it("dispatches openapi_yaml format to ingestOpenAPI", async () => {
      const content = "openapi: 3.0.0\npaths:\n  /users:\n    get:\n      summary: List users";
      const meta: DocMetadata = { ...baseMeta, docType: "api_spec", fileName: "api.yaml" };
      const result = await ingester.ingestDocument("app-1", content, "openapi_yaml", meta);
      expect(result.docId).toContain("app-1");
    });

    it("throws for unsupported format", async () => {
      await expect(ingester.ingestDocument("app-1", "content", "csv" as "markdown", baseMeta)).rejects.toThrow(
        "Unsupported document format"
      );
    });
  });

  // ── ingestMarkdown ──────────────────────────────────────────────────────────

  describe("ingestMarkdown", () => {
    it("creates chunks from markdown sections", async () => {
      const content = [
        "# Introduction",
        "This is the intro paragraph.",
        "",
        "## Requirements",
        "The system shall do X.",
        "",
        "## Constraints",
        "Must run on Node.js 22+.",
      ].join("\n");

      const result = await ingester.ingestMarkdown("app-1", content, baseMeta);

      expect(result.chunksCreated).toBe(3);
      expect(result.docId).toBe("doc:app-1:requirements.md:v1");
      expect(result.totalTokens).toBe(100);

      // Verify chunks passed to indexChunks
      const chunks = mockIndexChunks.mock.calls[0][1];
      expect(chunks.length).toBe(3);
      expect(chunks[0].type).toBe("requirement");
      expect(chunks[0].metadata.docType).toBe("prd");
    });

    it("returns zeros for empty content", async () => {
      const result = await ingester.ingestMarkdown("app-1", "", baseMeta);
      expect(result.chunksCreated).toBe(0);
      expect(result.chunksSkipped).toBe(0);
      expect(result.totalTokens).toBe(0);
    });

    it("handles content with no headings as single chunk", async () => {
      const content = "Just some plain text without any headings.";
      await ingester.ingestMarkdown("app-1", content, baseMeta);
      const chunks = mockIndexChunks.mock.calls[0][1];
      expect(chunks.length).toBe(1);
    });

    it("generates stable chunk IDs in metadata", async () => {
      const content = "# Section One\nContent here.";
      await ingester.ingestMarkdown("app-1", content, baseMeta);
      const chunks = mockIndexChunks.mock.calls[0][1];
      expect(chunks[0].metadata.stableId).toBe("req:app-1:requirements.md:0:v1");
    });

    it("uses 'latest' when version is not provided", async () => {
      const meta: DocMetadata = { fileName: "req.md", docType: "prd" };
      const content = "# Title\nSome content.";
      const result = await ingester.ingestMarkdown("app-1", content, meta);
      expect(result.docId).toContain("latest");
    });

    it("assigns requirement chunk type for prd docType", async () => {
      const content = "# Requirements\nShall do things.";
      await ingester.ingestMarkdown("app-1", content, baseMeta);
      const chunks = mockIndexChunks.mock.calls[0][1];
      expect(chunks[0].type).toBe("requirement");
    });

    it("assigns user_story chunk type for user_story docType", async () => {
      const meta: DocMetadata = { ...baseMeta, docType: "user_story" };
      const content = "# Story\nAs a user I want to...";
      await ingester.ingestMarkdown("app-1", content, meta);
      const chunks = mockIndexChunks.mock.calls[0][1];
      expect(chunks[0].type).toBe("user_story");
    });

    it("includes auto-generated tags in chunk metadata", async () => {
      const content = "# Security\nAll endpoints require authentication and OWASP compliance.";
      await ingester.ingestMarkdown("app-1", content, baseMeta);
      const chunks = mockIndexChunks.mock.calls[0][1];
      expect(chunks[0].metadata.tags).toContain("security");
    });

    it("handles skipped chunks from rag pipeline", async () => {
      mockIndexChunks.mockResolvedValueOnce({ indexed: 1, skipped: 2, totalTokens: 50 });
      const content = "# A\nText\n## B\nMore\n## C\nEven more";
      const result = await ingester.ingestMarkdown("app-1", content, baseMeta);
      expect(result.chunksCreated).toBe(1);
      expect(result.chunksSkipped).toBe(2);
    });
  });

  // ── ingestOpenAPI ───────────────────────────────────────────────────────────

  describe("ingestOpenAPI", () => {
    it("creates one chunk per operation from JSON spec", async () => {
      const spec = {
        openapi: "3.0.0",
        paths: {
          "/users": {
            get: { summary: "List users", operationId: "listUsers" },
            post: { summary: "Create user", operationId: "createUser" },
          },
          "/users/{id}": {
            get: { summary: "Get user", operationId: "getUser" },
          },
        },
      };
      const meta: DocMetadata = { ...baseMeta, docType: "api_spec", fileName: "api.json" };
      mockIndexChunks.mockResolvedValueOnce({ indexed: 3, skipped: 0, totalTokens: 75 });

      const result = await ingester.ingestOpenAPI("app-1", JSON.stringify(spec), meta);

      expect(result.chunksCreated).toBe(3);
      expect(result.totalTokens).toBe(75);

      const chunks = mockIndexChunks.mock.calls[0][1];
      expect(chunks.length).toBe(3);
      expect(chunks[0].type).toBe("api_spec");
      expect(chunks[0].metadata.method).toBe("GET");
      expect(chunks[0].metadata.path).toBe("/users");
    });

    it("falls back to single chunk for invalid JSON", async () => {
      const meta: DocMetadata = { ...baseMeta, docType: "api_spec", fileName: "api.json" };
      await ingester.ingestOpenAPI("app-1", "not valid json {{{", meta);
      const chunks = mockIndexChunks.mock.calls[0][1];
      expect(chunks.length).toBe(1);
      expect(chunks[0].metadata.operationId).toBe("full-spec");
    });

    it("falls back to single chunk when no paths key", async () => {
      const spec = { openapi: "3.0.0", info: { title: "No paths" } };
      const meta: DocMetadata = { ...baseMeta, docType: "api_spec", fileName: "api.json" };
      await ingester.ingestOpenAPI("app-1", JSON.stringify(spec), meta);
      const chunks = mockIndexChunks.mock.calls[0][1];
      expect(chunks.length).toBe(1);
    });

    it("generates stable IDs for operations", async () => {
      const spec = {
        paths: { "/items": { get: { summary: "List items" } } },
      };
      const meta: DocMetadata = { ...baseMeta, docType: "api_spec", fileName: "api.json" };
      await ingester.ingestOpenAPI("app-1", JSON.stringify(spec), meta);
      const chunks = mockIndexChunks.mock.calls[0][1];
      expect(chunks[0].metadata.stableId).toMatch(/^req:app-1:api\.json:\d+:v1$/);
    });

    it("uses generated operationId when none is provided", async () => {
      const spec = {
        paths: { "/items": { post: { summary: "Create item" } } },
      };
      const meta: DocMetadata = { ...baseMeta, docType: "api_spec", fileName: "api.json" };
      await ingester.ingestOpenAPI("app-1", JSON.stringify(spec), meta);
      const chunks = mockIndexChunks.mock.calls[0][1];
      expect(chunks[0].metadata.operationId).toBe("post__items");
    });

    it("returns zeros for empty spec", async () => {
      const spec = { paths: {} };
      const meta: DocMetadata = { ...baseMeta, docType: "api_spec", fileName: "api.json" };
      const result = await ingester.ingestOpenAPI("app-1", JSON.stringify(spec), meta);
      expect(result.chunksCreated).toBe(0);
    });

    it("handles YAML-like content with .yaml extension", async () => {
      const yamlContent = [
        "openapi: 3.0.0",
        "paths:",
        "  /pets:",
        "    get:",
        "      summary: List pets",
        "      operationId: listPets",
      ].join("\n");
      const meta: DocMetadata = { ...baseMeta, docType: "api_spec", fileName: "api.yaml" };
      await ingester.ingestOpenAPI("app-1", yamlContent, meta);
      const chunks = mockIndexChunks.mock.calls[0][1];
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      expect(chunks[0].type).toBe("api_spec");
    });

    it("includes description when present in operation", async () => {
      const spec = {
        paths: {
          "/items": {
            get: {
              summary: "List items",
              description: "Returns a list of all items",
              operationId: "listItems",
            },
          },
        },
      };
      const meta: DocMetadata = { ...baseMeta, docType: "api_spec", fileName: "api.json" };
      await ingester.ingestOpenAPI("app-1", JSON.stringify(spec), meta);
      const chunks = mockIndexChunks.mock.calls[0][1];
      expect(chunks[0].content).toContain("Description: Returns a list of all items");
    });

    it("handles operation without summary or description", async () => {
      const spec = {
        paths: {
          "/items": {
            get: {
              operationId: "listItems",
              // no summary or description
            },
          },
        },
      };
      const meta: DocMetadata = { ...baseMeta, docType: "api_spec", fileName: "api.json" };
      await ingester.ingestOpenAPI("app-1", JSON.stringify(spec), meta);
      const chunks = mockIndexChunks.mock.calls[0][1];
      expect(chunks[0].content).toContain("GET /items");
      expect(chunks[0].content).not.toContain("Summary:");
      expect(chunks[0].content).not.toContain("Description:");
    });
  });

  // ── ingestSchemaData ────────────────────────────────────────────────────────

  describe("ingestSchemaData", () => {
    it("creates a schema chunk with table info", async () => {
      mockIndexChunks.mockResolvedValueOnce({ indexed: 1, skipped: 0, totalTokens: 20 });
      const result = await ingester.ingestSchemaData(
        "app-1",
        "USERS",
        "id INT, name VARCHAR(100), email VARCHAR(255)",
        "Primary DB"
      );
      expect(result.docId).toBe("schema:app-1:Primary DB:USERS");
      expect(result.chunksCreated).toBe(1);

      const chunks = mockIndexChunks.mock.calls[0][1];
      expect(chunks[0].type).toBe("schema");
      expect(chunks[0].content).toContain("USERS");
      expect(chunks[0].content).toContain("Primary DB");
    });
  });

  // ── ingestAtlassianContent ──────────────────────────────────────────────────

  describe("ingestAtlassianContent", () => {
    it("ingest Jira issue as user_story chunk", async () => {
      mockIndexChunks.mockResolvedValueOnce({ indexed: 1, skipped: 0, totalTokens: 30 });
      const result = await ingester.ingestAtlassianContent(
        "app-1",
        "As a user, I want to log in so that I can access my account.",
        "jira",
        "PROJ-123",
        "User Login"
      );
      expect(result.docId).toBe("jira:app-1:PROJ-123");
      expect(result.chunksCreated).toBe(1);

      const chunks = mockIndexChunks.mock.calls[0][1];
      expect(chunks[0].type).toBe("user_story");
      expect(chunks[0].content).toContain("JIRA PROJ-123");
    });

    it("ingest Confluence page as requirement chunk", async () => {
      mockIndexChunks.mockResolvedValueOnce({ indexed: 1, skipped: 0, totalTokens: 40 });
      const result = await ingester.ingestAtlassianContent(
        "app-1",
        "System architecture and design requirements for the login module.",
        "confluence",
        "DOC-456",
        "Login Module Architecture"
      );
      expect(result.docId).toBe("confluence:app-1:DOC-456");

      const chunks = mockIndexChunks.mock.calls[0][1];
      expect(chunks[0].type).toBe("requirement");
      expect(chunks[0].content).toContain("CONFLUENCE DOC-456");
    });
  });

  // ── chunkTypeForDocType ─────────────────────────────────────────────────────

  describe("functional_spec docType → requirement type", () => {
    it("maps functional_spec to requirement chunk type", async () => {
      const meta: DocMetadata = { fileName: "spec.md", docType: "functional_spec" };
      const content = "# Functional Requirement\nThe system shall process payments.";
      await ingester.ingestMarkdown("app-1", content, meta);
      const chunks = mockIndexChunks.mock.calls[0][1];
      expect(chunks[0].type).toBe("requirement");
    });
  });

  // ── parseSimpleYaml edge cases ──────────────────────────────────────────────

  describe("parseSimpleYaml edge cases (via ingestOpenAPI)", () => {
    it("handles YAML with non-HTTP method keys (ignored)", async () => {
      const yamlContent = [
        "openapi: 3.0.0",
        "paths:",
        "  /items:",
        "    get:",
        "      summary: Get items",
        "    x-custom:",
        "      note: not an HTTP method",
      ].join("\n");
      const meta: DocMetadata = { ...baseMeta, docType: "api_spec", fileName: "api.yaml" };
      await ingester.ingestOpenAPI("app-1", yamlContent, meta);
      const chunks = mockIndexChunks.mock.calls[0][1];
      // Should only have the 'get' operation, ignoring x-custom
      expect(chunks.length).toBe(1);
    });

    it("handles YAML with summary/description/operationId field parsing", async () => {
      const yamlContent = [
        "paths:",
        "  /users:",
        "    post:",
        "      summary: Create user",
        "      description: Creates a new user account",
        "      operationId: createUser",
      ].join("\n");
      const meta: DocMetadata = { ...baseMeta, docType: "api_spec", fileName: "api.yaml" };
      await ingester.ingestOpenAPI("app-1", yamlContent, meta);
      const chunks = mockIndexChunks.mock.calls[0][1];
      expect(chunks[0].content).toContain("Summary: Create user");
      expect(chunks[0].metadata.operationId).toBe("createUser");
    });
  });
});
