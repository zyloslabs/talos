import { describe, it, expect } from "vitest";
import { cn, formatDuration, formatRelativeTime, getStatusColor } from "./utils";

describe("utils", () => {
  describe("cn", () => {
    it("merges class names", () => {
      expect(cn("foo", "bar")).toBe("foo bar");
    });

    it("handles conditional classes", () => {
      expect(cn("foo", false && "bar", "baz")).toBe("foo baz");
    });

    it("merges tailwind classes correctly", () => {
      expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
    });
  });

  describe("formatDuration", () => {
    it("returns dash for null", () => {
      expect(formatDuration(null)).toBe("-");
    });

    it("formats milliseconds", () => {
      expect(formatDuration(500)).toBe("500ms");
    });

    it("formats seconds", () => {
      expect(formatDuration(2500)).toBe("2.5s");
    });

    it("formats minutes and seconds", () => {
      expect(formatDuration(125000)).toBe("2m 5s");
    });
  });

  describe("formatRelativeTime", () => {
    it("returns 'just now' for recent times", () => {
      const now = new Date();
      expect(formatRelativeTime(now)).toBe("just now");
    });

    it("formats minutes ago", () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      expect(formatRelativeTime(fiveMinutesAgo)).toBe("5m ago");
    });

    it("formats hours ago", () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      expect(formatRelativeTime(twoHoursAgo)).toBe("2h ago");
    });
  });

  describe("getStatusColor", () => {
    it("returns success color for passed", () => {
      expect(getStatusColor("passed")).toContain("success");
    });

    it("returns destructive color for failed", () => {
      expect(getStatusColor("failed")).toContain("destructive");
    });

    it("returns warning color for running", () => {
      expect(getStatusColor("running")).toContain("warning");
    });

    it("returns muted color for unknown status", () => {
      expect(getStatusColor("unknown")).toContain("muted");
    });
  });
});
