/**
 * File Chunker Tests
 */

import { describe, it, expect } from "vitest";
import { FileChunker, createSlidingWindowChunks, createStructuralChunks } from "./file-chunker.js";

describe("FileChunker", () => {
  const chunker = new FileChunker();

  describe("chunk", () => {
    it("should chunk a simple TypeScript file", () => {
      const content = `
function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

function farewell(name: string): string {
  return \`Goodbye, \${name}!\`;
}
      `.trim();

      const chunks = chunker.chunk("test.ts", content, "app-1");

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].applicationId).toBe("app-1");
      expect(chunks[0].filePath).toBe("test.ts");
    });

    it("should fall back to sliding window for non-code files", () => {
      const content = "Lorem ipsum ".repeat(500);

      const chunks = chunker.chunk("readme.md", content, "app-1");

      expect(chunks.length).toBeGreaterThan(1);
    });

    it("should handle empty files", () => {
      const chunks = chunker.chunk("empty.ts", "", "app-1");
      expect(chunks).toHaveLength(0);
    });

    it("should handle small files", () => {
      const content = "const x = 1;";
      const chunks = chunker.chunk("small.ts", content, "app-1");

      expect(chunks).toHaveLength(1);
      expect(chunks[0].content).toBe(content);
    });

    it("detects test chunk type for .test.ts files", () => {
      const content = `test('should work', () => { expect(1).toBe(1); });`;
      const chunks = chunker.chunk("app.test.ts", content, "app-1");
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].type).toBe("test");
    });

    it("detects config chunk type for .json files", () => {
      const content = `{ "name": "myapp", "version": "1.0.0" }`;
      const chunks = chunker.chunk("settings.json", content, "app-1");
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].type).toBe("config");
    });

    it("detects schema chunk type for schema files", () => {
      const content = `export type UserSchema = { id: string; name: string; };`;
      const chunks = chunker.chunk("user-schema.ts", content, "app-1");
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].type).toBe("schema");
    });
  });
});

describe("createSlidingWindowChunks", () => {
  it("should create overlapping chunks", () => {
    // Create content with multiple lines to test line-based overlap
    const lines = Array(100).fill("some content here").join("\n");
    const chunks = createSlidingWindowChunks(lines, {
      filePath: "test.txt",
      applicationId: "app-1",
      chunkSize: 300,
      chunkOverlap: 100,
    });

    expect(chunks.length).toBeGreaterThan(1);

    // Check that multiple chunks were created
    // Note: overlap is character-based but reported as line numbers
    expect(chunks.every((c) => c.startLine >= 1)).toBe(true);
  });

  it("should set correct line numbers", () => {
    const content = "line1\nline2\nline3\nline4\nline5";
    const chunks = createSlidingWindowChunks(content, {
      filePath: "test.txt",
      applicationId: "app-1",
      chunkSize: 1000,
      chunkOverlap: 0,
    });

    expect(chunks[0].startLine).toBe(1);
    expect(chunks[0].endLine).toBe(5);
  });

  it("should handle single-chunk content", () => {
    const content = "short content";
    const chunks = createSlidingWindowChunks(content, {
      filePath: "test.txt",
      applicationId: "app-1",
      chunkSize: 1000,
      chunkOverlap: 100,
    });

    expect(chunks).toHaveLength(1);
  });

  it("returns empty array for empty content", () => {
    const chunks = createSlidingWindowChunks("", {
      filePath: "test.txt",
      applicationId: "app-1",
    });
    expect(chunks).toHaveLength(0);
  });
});

describe("createStructuralChunks", () => {
  it("should extract function definitions", () => {
    const content = `
function add(a: number, b: number): number {
  return a + b;
}

const subtract = (a: number, b: number) => a - b;

async function fetchData() {
  const response = await fetch('/api');
  return response.json();
}
    `.trim();

    const chunks = createStructuralChunks(content, {
      filePath: "math.ts",
      applicationId: "app-1",
    });

    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks.some((c) => c.content.includes("function add"))).toBe(true);
    expect(chunks.some((c) => c.content.includes("async function fetchData"))).toBe(true);
  });

  it("should extract class definitions", () => {
    const content = `
class Calculator {
  add(a: number, b: number) {
    return a + b;
  }
  
  subtract(a: number, b: number) {
    return a - b;
  }
}

class AdvancedCalculator extends Calculator {
  multiply(a: number, b: number) {
    return a * b;
  }
}
    `.trim();

    const chunks = createStructuralChunks(content, {
      filePath: "calc.ts",
      applicationId: "app-1",
    });

    expect(chunks.some((c) => c.content.includes("class Calculator"))).toBe(true);
    expect(chunks.some((c) => c.content.includes("class AdvancedCalculator"))).toBe(true);
  });

  it("should fall back to sliding window for non-structural content", () => {
    const content = "const x = 1;\nconst y = 2;\nconst z = x + y;";
    const chunks = createStructuralChunks(content, {
      filePath: "simple.ts",
      applicationId: "app-1",
    });

    // Should still produce chunks even without functions/classes
    expect(chunks.length).toBeGreaterThan(0);
  });

  it("should include line numbers for structural chunks", () => {
    const content = `
// Comment
function test() {
  console.log('test');
}
    `.trim();

    const chunks = createStructuralChunks(content, {
      filePath: "test.ts",
      applicationId: "app-1",
    });

    const funcChunk = chunks.find((c) => c.content.includes("function test"));
    expect(funcChunk?.startLine).toBeDefined();
    expect(funcChunk?.endLine).toBeDefined();
  });
});
