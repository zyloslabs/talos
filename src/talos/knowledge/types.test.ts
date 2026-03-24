/**
 * Tests for extended TalosChunk types (#281)
 * Covers: new chunk types, metadata fields, CreateChunkInput, UpdateChunkInput
 */

import { describe, it, expect } from "vitest";
import type {
  TalosChunkType,
  TalosChunk,
  CreateChunkInput,
  UpdateChunkInput,
  ArtifactLink,
} from "../types.js";

describe("TalosChunk extended types", () => {
  it("supports original chunk types", () => {
    const types: TalosChunkType[] = ["code", "test", "documentation", "config", "schema"];
    expect(types).toHaveLength(5);
  });

  it("supports new chunk types: requirement, api_spec, user_story", () => {
    const types: TalosChunkType[] = ["requirement", "api_spec", "user_story"];
    expect(types).toHaveLength(3);
    expect(types).toContain("requirement");
    expect(types).toContain("api_spec");
    expect(types).toContain("user_story");
  });

  it("TalosChunk includes optional metadata fields", () => {
    const chunk: TalosChunk = {
      id: "c1",
      applicationId: "app-1",
      type: "requirement",
      content: "The system shall...",
      filePath: "requirements.md",
      startLine: 1,
      endLine: 10,
      contentHash: "abc123",
      metadata: {},
      docId: "doc:app-1:requirements.md:v1",
      sourceVersion: "v1.0.0",
      confidence: 0.95,
      tags: ["auth", "security"],
      links: [{ artifactType: "test", artifactId: "t-1" }],
      createdAt: new Date(),
    };

    expect(chunk.docId).toBe("doc:app-1:requirements.md:v1");
    expect(chunk.sourceVersion).toBe("v1.0.0");
    expect(chunk.confidence).toBe(0.95);
    expect(chunk.tags).toEqual(["auth", "security"]);
    expect(chunk.links).toHaveLength(1);
  });

  it("TalosChunk optional fields can be undefined", () => {
    const chunk: TalosChunk = {
      id: "c2",
      applicationId: "app-1",
      type: "code",
      content: "function foo() {}",
      filePath: "/src/foo.ts",
      startLine: 1,
      endLine: 1,
      contentHash: "xyz",
      metadata: {},
      createdAt: new Date(),
    };

    expect(chunk.docId).toBeUndefined();
    expect(chunk.sourceVersion).toBeUndefined();
    expect(chunk.confidence).toBeUndefined();
    expect(chunk.tags).toBeUndefined();
    expect(chunk.links).toBeUndefined();
  });

  it("ArtifactLink shape is correct", () => {
    const link: ArtifactLink = { artifactType: "test", artifactId: "t-abc" };
    expect(link.artifactType).toBe("test");
    expect(link.artifactId).toBe("t-abc");
  });

  it("CreateChunkInput has required and optional fields", () => {
    const input: CreateChunkInput = {
      applicationId: "app-1",
      type: "api_spec",
      content: "GET /users",
      filePath: "openapi.yaml",
      contentHash: "hash1",
      docId: "doc:1",
      sourceVersion: "v2",
      confidence: 0.8,
      tags: ["api"],
      links: [{ artifactType: "requirement", artifactId: "r-1" }],
    };

    expect(input.applicationId).toBe("app-1");
    expect(input.type).toBe("api_spec");
    expect(input.docId).toBe("doc:1");
  });

  it("CreateChunkInput minimal (only required fields)", () => {
    const input: CreateChunkInput = {
      applicationId: "app-1",
      type: "user_story",
      content: "As a user...",
      filePath: "stories.md",
      contentHash: "h2",
    };

    expect(input.metadata).toBeUndefined();
    expect(input.tags).toBeUndefined();
  });

  it("UpdateChunkInput is partial", () => {
    const update: UpdateChunkInput = {
      confidence: 0.99,
      tags: ["updated"],
    };

    expect(update.confidence).toBe(0.99);
    expect(update.content).toBeUndefined();
  });
});
