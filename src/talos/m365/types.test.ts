import { describe, it, expect } from "vitest";
import { ScrapeError, ParseError, AuthError, type FileType, type SearchResult, type RetryOptions } from "./types.js";

describe("M365 Types", () => {
  describe("ScrapeError", () => {
    it("stores selector and step", () => {
      const err = new ScrapeError("failed to click", "#btn", "submit");
      expect(err.message).toBe("failed to click");
      expect(err.selector).toBe("#btn");
      expect(err.step).toBe("submit");
      expect(err.name).toBe("ScrapeError");
      expect(err).toBeInstanceOf(Error);
    });
  });

  describe("ParseError", () => {
    it("stores fileType", () => {
      const err = new ParseError("bad docx", "docx");
      expect(err.message).toBe("bad docx");
      expect(err.fileType).toBe("docx");
      expect(err.name).toBe("ParseError");
      expect(err).toBeInstanceOf(Error);
    });
  });

  describe("AuthError", () => {
    it("has correct name", () => {
      const err = new AuthError("timeout");
      expect(err.message).toBe("timeout");
      expect(err.name).toBe("AuthError");
      expect(err).toBeInstanceOf(Error);
    });
  });

  describe("FileType", () => {
    it("accepts valid types", () => {
      const types: FileType[] = ["docx", "pdf", "xlsx", "pptx"];
      expect(types).toHaveLength(4);
    });
  });

  describe("SearchResult", () => {
    it("satisfies the interface shape", () => {
      const result: SearchResult = {
        title: "My Doc",
        snippet: "Some text...",
        url: "https://example.com/doc",
        fileType: "docx",
      };
      expect(result.title).toBe("My Doc");
      expect(result.fileType).toBe("docx");
    });

    it("allows unknown fileType", () => {
      const result: SearchResult = {
        title: "Unknown",
        snippet: "",
        url: "https://example.com",
        fileType: "unknown",
      };
      expect(result.fileType).toBe("unknown");
    });
  });

  describe("RetryOptions", () => {
    it("satisfies the interface shape", () => {
      const opts: RetryOptions = {
        maxRetries: 3,
        baseDelayMs: 1000,
        onRetry: (attempt, error) => {
          expect(typeof attempt).toBe("number");
          expect(error).toBeInstanceOf(Error);
        },
      };
      expect(opts.maxRetries).toBe(3);
    });
  });
});
