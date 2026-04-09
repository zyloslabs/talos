/**
 * Tests for IntelligenceVectorizer (#481)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { IntelligenceVectorizer } from "./intelligence-vectorizer.js";
import type { AppIntelligenceReport } from "../types.js";

const mockIndexChunks = vi.fn().mockResolvedValue({ indexed: 3, skipped: 0, totalTokens: 50 });

const mockRagPipeline = {
  indexChunks: mockIndexChunks,
  initialize: vi.fn(),
  retrieve: vi.fn(),
  findSimilar: vi.fn(),
  clearApplication: vi.fn(),
  getStats: vi.fn(),
  retrieveWithFilters: vi.fn(),
} as unknown as ConstructorParameters<typeof IntelligenceVectorizer>[0]["ragPipeline"];

function makeReport(overrides: Partial<AppIntelligenceReport> = {}): AppIntelligenceReport {
  return {
    id: "report-1",
    applicationId: "app-1",
    techStack: [
      { name: "React", category: "framework", version: "18.2.0", source: "package.json" },
    ],
    databases: [
      { type: "PostgreSQL", connectionPattern: "postgresql://", source: "docker-compose.yml" },
    ],
    testUsers: [
      { variableName: "ADMIN_USER", roleHint: "admin", source: "seed-data.sql" },
    ],
    documentation: [
      { type: "readme", filePath: "README.md" },
    ],
    configFiles: [
      { filePath: "tsconfig.json", type: "typescript" },
    ],
    scannedAt: new Date("2026-04-01T00:00:00Z"),
    ...overrides,
  };
}

describe("IntelligenceVectorizer", () => {
  let vectorizer: IntelligenceVectorizer;

  beforeEach(() => {
    vi.clearAllMocks();
    vectorizer = new IntelligenceVectorizer({ ragPipeline: mockRagPipeline });
  });

  it("vectorizes all non-empty report sections as chunks", async () => {
    const report = makeReport();
    const result = await vectorizer.vectorizeIntelligence("app-1", report);

    expect(mockIndexChunks).toHaveBeenCalledOnce();
    const [appId, chunks] = mockIndexChunks.mock.calls[0];
    expect(appId).toBe("app-1");
    expect(chunks).toHaveLength(5); // techStack, databases, testUsers, documentation, configFiles
    expect(result.chunksIndexed).toBe(3);
    expect(result.totalTokens).toBe(50);
  });

  it("sets chunk type to app_intelligence for all chunks", async () => {
    const report = makeReport();
    await vectorizer.vectorizeIntelligence("app-1", report);

    const chunks = mockIndexChunks.mock.calls[0][1];
    for (const chunk of chunks) {
      expect(chunk.type).toBe("app_intelligence");
    }
  });

  it("includes correct metadata on each chunk", async () => {
    const report = makeReport();
    await vectorizer.vectorizeIntelligence("app-1", report);

    const chunks = mockIndexChunks.mock.calls[0][1];
    const techChunk = chunks.find((c: { metadata: { fieldName: string } }) => c.metadata.fieldName === "techStack");
    expect(techChunk).toBeDefined();
    expect(techChunk.metadata.scanTimestamp).toBe("2026-04-01T00:00:00.000Z");
    expect(techChunk.metadata.applicationId).toBe("app-1");
    expect(techChunk.metadata.reportId).toBe("report-1");
  });

  it("sets filePath to intelligence/{appId}/{field}", async () => {
    const report = makeReport();
    await vectorizer.vectorizeIntelligence("app-1", report);

    const chunks = mockIndexChunks.mock.calls[0][1];
    expect(chunks[0].filePath).toBe("intelligence/app-1/techStack");
    expect(chunks[1].filePath).toBe("intelligence/app-1/databases");
  });

  it("generates unique content hashes per section", async () => {
    const report = makeReport();
    await vectorizer.vectorizeIntelligence("app-1", report);

    const chunks = mockIndexChunks.mock.calls[0][1];
    const hashes = chunks.map((c: { contentHash: string }) => c.contentHash);
    const uniqueHashes = new Set(hashes);
    expect(uniqueHashes.size).toBe(hashes.length);
  });

  it("skips empty sections", async () => {
    const report = makeReport({
      techStack: [],
      databases: [],
      testUsers: [],
      documentation: [],
      configFiles: [],
    });

    const result = await vectorizer.vectorizeIntelligence("app-1", report);

    expect(mockIndexChunks).not.toHaveBeenCalled();
    expect(result.chunksIndexed).toBe(0);
    expect(result.chunksSkipped).toBe(0);
    expect(result.totalTokens).toBe(0);
  });

  it("includes only non-empty sections as chunks", async () => {
    const report = makeReport({
      databases: [],
      configFiles: [],
    });

    await vectorizer.vectorizeIntelligence("app-1", report);

    const chunks = mockIndexChunks.mock.calls[0][1];
    expect(chunks).toHaveLength(3); // techStack, testUsers, documentation
    const fields = chunks.map((c: { metadata: { fieldName: string } }) => c.metadata.fieldName);
    expect(fields).toContain("techStack");
    expect(fields).toContain("testUsers");
    expect(fields).toContain("documentation");
    expect(fields).not.toContain("databases");
    expect(fields).not.toContain("configFiles");
  });

  it("formats techStack content with name, category, version", async () => {
    const report = makeReport();
    await vectorizer.vectorizeIntelligence("app-1", report);

    const chunks = mockIndexChunks.mock.calls[0][1];
    const techChunk = chunks.find((c: { metadata: { fieldName: string } }) => c.metadata.fieldName === "techStack");
    expect(techChunk.content).toContain("React");
    expect(techChunk.content).toContain("framework");
    expect(techChunk.content).toContain("18.2.0");
  });

  it("formats databases content with type and connection pattern", async () => {
    const report = makeReport();
    await vectorizer.vectorizeIntelligence("app-1", report);

    const chunks = mockIndexChunks.mock.calls[0][1];
    const dbChunk = chunks.find((c: { metadata: { fieldName: string } }) => c.metadata.fieldName === "databases");
    expect(dbChunk.content).toContain("PostgreSQL");
    expect(dbChunk.content).toContain("postgresql://");
  });
});
