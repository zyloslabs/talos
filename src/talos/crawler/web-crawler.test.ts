/**
 * Tests for WebCrawler (#477)
 */

import { describe, it, expect, vi } from "vitest";
import { WebCrawler, type PlaywrightBrowserLike, type PlaywrightPageLike, type BrowserLauncher } from "./web-crawler.js";
import type { AccessibilityNode } from "../types.js";

// ── Mock Helpers ──────────────────────────────────────────────────────────────

function createMockPage(options: {
  url: string;
  title: string;
  snapshot?: AccessibilityNode;
  links?: Array<{ href: string; text: string }>;
}): PlaywrightPageLike {
  let currentUrl = options.url;
  return {
    goto: vi.fn(async (url: string) => {
      currentUrl = url;
    }),
    title: vi.fn(async () => options.title),
    url: () => currentUrl,
    accessibility: {
      snapshot: vi.fn(async () => options.snapshot ?? null),
    },
    evaluate: vi.fn(async () => options.links ?? []),
    close: vi.fn(),
  };
}

function createMockBrowser(pages: PlaywrightPageLike[]): PlaywrightBrowserLike {
  let pageIndex = 0;
  return {
    newPage: vi.fn(async () => pages[pageIndex++] ?? pages[0]),
    close: vi.fn(),
  };
}

function createMockLauncher(browser: PlaywrightBrowserLike): BrowserLauncher {
  return vi.fn(async () => browser);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("WebCrawler", () => {
  describe("crawl", () => {
    it("crawls a single page at baseUrl", async () => {
      const page = createMockPage({
        url: "https://app.example.com",
        title: "App Home",
        snapshot: {
          role: "WebArea",
          children: [
            { role: "heading", name: "Welcome" },
            { role: "button", name: "Get Started" },
          ],
        },
        links: [],
      });

      const browser = createMockBrowser([page]);
      const launcher = createMockLauncher(browser);
      const crawler = new WebCrawler({ maxDepth: 1, maxPages: 10 }, launcher);

      const result = await crawler.crawl("app-1", "https://app.example.com");

      expect(result.status).toBe("completed");
      expect(result.pages).toHaveLength(1);
      expect(result.pages[0].title).toBe("App Home");
      expect(result.pages[0].headings).toContain("Welcome");
      expect(result.totalPagesCrawled).toBe(1);
      expect(result.applicationId).toBe("app-1");
    });

    it("follows internal links up to maxDepth", async () => {
      const homePage = createMockPage({
        url: "https://app.example.com",
        title: "Home",
        snapshot: { role: "WebArea", children: [{ role: "link", name: "About" }] },
        links: [{ href: "https://app.example.com/about", text: "About" }],
      });

      const aboutPage = createMockPage({
        url: "https://app.example.com/about",
        title: "About",
        snapshot: { role: "WebArea", children: [{ role: "heading", name: "About Us" }] },
        links: [],
      });

      const browser = createMockBrowser([homePage, aboutPage]);
      const launcher = createMockLauncher(browser);
      const crawler = new WebCrawler({ maxDepth: 2, maxPages: 10 }, launcher);

      const result = await crawler.crawl("app-1", "https://app.example.com");

      expect(result.status).toBe("completed");
      expect(result.pages).toHaveLength(2);
      expect(result.pages[0].title).toBe("Home");
      expect(result.pages[1].title).toBe("About");
    });

    it("skips external links (different origin)", async () => {
      const page = createMockPage({
        url: "https://app.example.com",
        title: "Home",
        snapshot: { role: "WebArea" },
        links: [
          { href: "https://external.com/page", text: "External" },
          { href: "https://app.example.com/internal", text: "Internal" },
        ],
      });

      const internalPage = createMockPage({
        url: "https://app.example.com/internal",
        title: "Internal",
        snapshot: { role: "WebArea" },
        links: [],
      });

      const browser = createMockBrowser([page, internalPage]);
      const launcher = createMockLauncher(browser);
      const crawler = new WebCrawler({ maxDepth: 2, maxPages: 10 }, launcher);

      const result = await crawler.crawl("app-1", "https://app.example.com");

      expect(result.pages).toHaveLength(2);
      // Should not have visited external.com
      expect(result.pages.every((p) => p.url.startsWith("https://app.example.com"))).toBe(true);
    });

    it("respects maxPages limit", async () => {
      const pages = Array.from({ length: 5 }, (_, i) =>
        createMockPage({
          url: `https://app.example.com/page-${i}`,
          title: `Page ${i}`,
          snapshot: { role: "WebArea" },
          links: Array.from({ length: 3 }, (_, j) => ({
            href: `https://app.example.com/page-${i}-${j}`,
            text: `Link ${j}`,
          })),
        })
      );

      const browser = createMockBrowser(pages);
      const launcher = createMockLauncher(browser);
      const crawler = new WebCrawler({ maxDepth: 3, maxPages: 3 }, launcher);

      const result = await crawler.crawl("app-1", "https://app.example.com/page-0");

      expect(result.totalPagesCrawled).toBeLessThanOrEqual(3);
    });

    it("handles page crawl errors gracefully", async () => {
      const failingPage: PlaywrightPageLike = {
        goto: vi.fn(async () => {
          throw new Error("Navigation failed");
        }),
        title: vi.fn(async () => ""),
        url: () => "https://app.example.com",
        accessibility: { snapshot: vi.fn(async () => null) },
        evaluate: vi.fn(async () => []),
        close: vi.fn(),
      };

      const browser = createMockBrowser([failingPage]);
      const launcher = createMockLauncher(browser);
      const crawler = new WebCrawler({ maxDepth: 1 }, launcher);

      const result = await crawler.crawl("app-1", "https://app.example.com");

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain("Navigation failed");
    });

    it("handles browser launch errors", async () => {
      const launcher: BrowserLauncher = vi.fn(async () => {
        throw new Error("Browser launch failed");
      });
      const crawler = new WebCrawler({ maxDepth: 1 }, launcher);

      const result = await crawler.crawl("app-1", "https://app.example.com");

      expect(result.status).toBe("failed");
      expect(result.errors).toHaveLength(1);
    });

    it("does not visit same page twice", async () => {
      const page = createMockPage({
        url: "https://app.example.com",
        title: "Home",
        snapshot: { role: "WebArea" },
        links: [
          { href: "https://app.example.com", text: "Home" }, // Self-link
          { href: "https://app.example.com/", text: "Home Again" }, // Trailing slash
        ],
      });

      const browser = createMockBrowser([page]);
      const launcher = createMockLauncher(browser);
      const crawler = new WebCrawler({ maxDepth: 2, maxPages: 10 }, launcher);

      const result = await crawler.crawl("app-1", "https://app.example.com");

      expect(result.totalPagesCrawled).toBe(1);
    });
  });

  describe("normalizeUrl", () => {
    const crawler = new WebCrawler();

    it("removes trailing slashes", () => {
      expect(crawler.normalizeUrl("https://example.com/path/")).toBe("https://example.com/path");
    });

    it("removes hash fragments", () => {
      expect(crawler.normalizeUrl("https://example.com/page#section")).toBe("https://example.com/page");
    });

    it("preserves root path", () => {
      expect(crawler.normalizeUrl("https://example.com/")).toBe("https://example.com/");
    });

    it("handles invalid URLs gracefully", () => {
      expect(crawler.normalizeUrl("not-a-url")).toBe("not-a-url");
    });
  });

  describe("resolveUrl", () => {
    const crawler = new WebCrawler();

    it("resolves relative URLs", () => {
      expect(crawler.resolveUrl("/about", "https://example.com/home")).toBe("https://example.com/about");
    });

    it("resolves absolute URLs", () => {
      expect(crawler.resolveUrl("https://other.com/page", "https://example.com")).toBe("https://other.com/page");
    });

    it("returns null for javascript: links", () => {
      expect(crawler.resolveUrl("javascript:void(0)", "https://example.com")).toBeNull();
    });

    it("returns null for mailto: links", () => {
      expect(crawler.resolveUrl("mailto:test@example.com", "https://example.com")).toBeNull();
    });

    it("returns null for empty href", () => {
      expect(crawler.resolveUrl("", "https://example.com")).toBeNull();
    });
  });
});
