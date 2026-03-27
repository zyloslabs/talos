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
      expect(wf).toHaveBeenCalledWith(expect.stringContaining("report.md"), "# Hello", "utf-8");
    });

    it("does not double .md extension", async () => {
      const { writeFile: wf } = await import("node:fs/promises");
      await store.saveMd("report.md", "# Hello");
      expect(wf).toHaveBeenCalledWith(expect.stringContaining("report.md"), "# Hello", "utf-8");
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

  describe("cleanupOlderThan", () => {
    it("deletes files older than threshold", async () => {
      const { readdir: readdirFn, rm: rmFn, stat: statFn } = await import("node:fs/promises");
      const oldTime = Date.now() - 120_000; // 2 minutes ago
      (readdirFn as ReturnType<typeof vi.fn>).mockResolvedValueOnce(["old.md", "new.md"]);
      (statFn as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ mtimeMs: oldTime }) // old.md
        .mockResolvedValueOnce({ mtimeMs: Date.now() }); // new.md
      const deleted = await store.cleanupOlderThan(60_000); // 60s threshold
      expect(deleted).toBe(1);
      expect(rmFn).toHaveBeenCalledWith(expect.stringContaining("old.md"), { force: true });
    });

    it("returns 0 when no files exceed threshold", async () => {
      const { readdir: readdirFn } = await import("node:fs/promises");
      (readdirFn as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
      const deleted = await store.cleanupOlderThan(60_000);
      expect(deleted).toBe(0);
    });
  });

  describe("destroy", () => {
    it("removes docs directory", async () => {
      const { rm: rmFn } = await import("node:fs/promises");
      await store.destroy();
      expect(rmFn).toHaveBeenCalledWith(expect.any(String), { recursive: true, force: true });
    });

    it("silently handles rm failure in destroy", async () => {
      const { rm: rmFn } = await import("node:fs/promises");
      (rmFn as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("permission denied"));
      await expect(store.destroy()).resolves.toBeUndefined();
    });
  });

  describe("listFiles — catch branch", () => {
    it("returns empty array when readdir throws", async () => {
      const { readdir: readdirFn } = await import("node:fs/promises");
      (readdirFn as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("ENOENT: dir not found"));
      const result = await store.listFiles();
      expect(result).toEqual([]);
    });
  });

  describe("listFilesWithAge", () => {
    it("returns file list with ages", async () => {
      const { readdir: readdirFn, stat: statFn } = await import("node:fs/promises");
      const ts = Date.now() - 5000;
      (readdirFn as ReturnType<typeof vi.fn>).mockResolvedValueOnce(["doc.md"]);
      (statFn as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ mtimeMs: ts });
      const files = await store.listFilesWithAge();
      expect(files.length).toBe(1);
      expect(files[0].name).toBe("doc.md");
      expect(files[0].ageMs).toBeGreaterThanOrEqual(5000);
    });

    it("handles per-file stat error gracefully", async () => {
      const { readdir: readdirFn, stat: statFn } = await import("node:fs/promises");
      (readdirFn as ReturnType<typeof vi.fn>).mockResolvedValueOnce(["broken.md"]);
      (statFn as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("stat failed"));
      const files = await store.listFilesWithAge();
      expect(files[0].ageMs).toBe(0);
    });
  });
});
