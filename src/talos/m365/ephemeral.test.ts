import { describe, it, expect, vi, beforeEach } from "vitest";
import { EphemeralStore } from "./ephemeral.js";

// Mock node:fs/promises
vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue([]),
  readFile: vi.fn().mockResolvedValue("file content"),
  rm: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn().mockResolvedValue({ mtimeMs: Date.now() - 60_000 }),
}));

describe("EphemeralStore", () => {
  let store: EphemeralStore;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new EphemeralStore("/tmp/test-docs");
  });

  describe("sanitizeFilename", () => {
    it("removes path traversal sequences", () => {
      expect(store.sanitizeFilename("../../../etc/passwd")).toBe("etcpasswd");
    });

    it("removes slashes", () => {
      expect(store.sanitizeFilename("path/to/file.md")).toBe("pathtofile.md");
    });

    it("replaces special chars with underscores", () => {
      expect(store.sanitizeFilename("hello world!@#$.md")).toBe("hello_world____.md");
    });

    it("removes leading dots", () => {
      expect(store.sanitizeFilename(".hidden")).toBe("hidden");
    });

    it("throws on empty result", () => {
      expect(() => store.sanitizeFilename("...///")).toThrow("Empty filename after sanitization");
    });

    it("preserves normal filenames", () => {
      expect(store.sanitizeFilename("my-document_v2.md")).toBe("my-document_v2.md");
    });
  });

  describe("saveMd", () => {
    it("appends .md extension if missing", async () => {
      const { writeFile: wf } = await import("node:fs/promises");
      await store.saveMd("report", "# Hello");
      expect(wf).toHaveBeenCalledWith(
        expect.stringContaining("report.md"),
        "# Hello",
        "utf-8",
      );
    });

    it("does not double .md extension", async () => {
      const { writeFile: wf } = await import("node:fs/promises");
      await store.saveMd("report.md", "# Hello");
      expect(wf).toHaveBeenCalledWith(
        expect.stringContaining("report.md"),
        "# Hello",
        "utf-8",
      );
      // Should NOT contain ".md.md"
      const path = (wf as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(path).not.toContain(".md.md");
    });
  });

  describe("listFiles", () => {
    it("returns empty array when dir doesn't exist", async () => {
      const result = await store.listFiles();
      expect(result).toEqual([]);
    });
  });

  describe("readFile", () => {
    it("reads a sanitized filename", async () => {
      const content = await store.readFile("test.md");
      expect(content).toBe("file content");
    });
  });

  describe("cleanup", () => {
    it("calls rm with recursive + force", async () => {
      const { rm: rmFn, mkdir: mkFn } = await import("node:fs/promises");
      await store.cleanup();
      expect(rmFn).toHaveBeenCalledWith(expect.any(String), { recursive: true, force: true });
      expect(mkFn).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    });
  });

  describe("getDocsDir", () => {
    it("returns resolved path", () => {
      expect(store.getDocsDir()).toContain("test-docs");
    });
  });
});
