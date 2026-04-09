/**
 * Web App Crawler (#477)
 *
 * Playwright-based crawler that navigates a live web app,
 * discovers pages/routes, captures page structure, and stores
 * crawled data for RAG and POM generation.
 */

import type {
  CrawledPage,
  CrawlResult,
  CrawlStatus,
  AccessibilityNode,
} from "../types.js";
import { DomDistiller } from "./dom-distiller.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type WebCrawlerOptions = {
  /** Maximum crawl depth (default 3) */
  maxDepth?: number;
  /** Maximum pages to crawl (default 50) */
  maxPages?: number;
  /** Include URL patterns (glob) */
  includePatterns?: string[];
  /** Exclude URL patterns (glob) */
  excludePatterns?: string[];
  /** Page load timeout in ms (default 30000) */
  timeout?: number;
  /** Run headless (default true) */
  headless?: boolean;
  /** Wait for network idle (default true) */
  waitForNetworkIdle?: boolean;
};

export type PageSnapshot = {
  url: string;
  title: string;
  accessibilityTree: AccessibilityNode;
  links: string[];
};

/** Minimal Playwright page interface for testability */
export type PlaywrightPageLike = {
  goto(url: string, options?: { waitUntil?: string; timeout?: number }): Promise<unknown>;
  title(): Promise<string>;
  url(): string;
  accessibility: {
    snapshot(options?: { interestingOnly?: boolean }): Promise<AccessibilityNode | null>;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  evaluate(fn: (...args: any[]) => any): Promise<any>;
  close(): Promise<void>;
};

/** Minimal Playwright browser interface for testability */
export type PlaywrightBrowserLike = {
  newPage(): Promise<PlaywrightPageLike>;
  close(): Promise<void>;
};

/** Browser launcher — injectable for testing */
export type BrowserLauncher = (options: {
  headless: boolean;
  timeout: number;
}) => Promise<PlaywrightBrowserLike>;

// ── Default Configuration ─────────────────────────────────────────────────────

const DEFAULT_OPTIONS: Required<WebCrawlerOptions> = {
  maxDepth: 3,
  maxPages: 50,
  includePatterns: [],
  excludePatterns: [],
  timeout: 30000,
  headless: true,
  waitForNetworkIdle: true,
};

// ── Web Crawler ───────────────────────────────────────────────────────────────

export class WebCrawler {
  private options: Required<WebCrawlerOptions>;
  private distiller: DomDistiller;
  private launchBrowser: BrowserLauncher;

  constructor(options?: WebCrawlerOptions, launcher?: BrowserLauncher) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.distiller = new DomDistiller();
    this.launchBrowser = launcher ?? WebCrawler.defaultLauncher;
  }

  /**
   * Crawl a web application starting from baseUrl.
   */
  async crawl(applicationId: string, baseUrl: string): Promise<CrawlResult> {
    const startTime = Date.now();
    const visited = new Set<string>();
    const queue: Array<{ url: string; depth: number }> = [{ url: baseUrl, depth: 0 }];
    const pages: CrawledPage[] = [];
    const errors: Array<{ url: string; error: string }> = [];
    let status: CrawlStatus = "crawling";

    const origin = new URL(baseUrl).origin;

    let browser: PlaywrightBrowserLike | null = null;
    try {
      browser = await this.launchBrowser({
        headless: this.options.headless,
        timeout: this.options.timeout,
      });

      while (queue.length > 0 && pages.length < this.options.maxPages) {
        const item = queue.shift();
        if (!item) break;
        const { url, depth } = item;

        // Skip if visited or beyond max depth
        const normalizedUrl = this.normalizeUrl(url);
        if (visited.has(normalizedUrl)) continue;
        if (depth > this.options.maxDepth) continue;

        // Skip excluded patterns
        if (this.isExcluded(normalizedUrl)) continue;

        // Skip non-same-origin
        if (!normalizedUrl.startsWith(origin)) continue;

        visited.add(normalizedUrl);

        try {
          const page = await browser.newPage();
          const crawledPage = await this.crawlPage(page, normalizedUrl, depth);
          await page.close();

          pages.push(crawledPage);

          // Enqueue discovered links
          if (depth < this.options.maxDepth) {
            for (const link of crawledPage.links) {
              const resolved = this.resolveUrl(link.href, normalizedUrl);
              if (resolved && resolved.startsWith(origin) && !visited.has(resolved)) {
                queue.push({ url: resolved, depth: depth + 1 });
              }
            }
          }
        } catch (err) {
          errors.push({
            url: normalizedUrl,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      status = "completed";
    } catch (err) {
      status = "failed";
      errors.push({
        url: baseUrl,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      if (browser) {
        await browser.close();
      }
    }

    return {
      applicationId,
      baseUrl,
      pages,
      totalPagesDiscovered: visited.size,
      totalPagesCrawled: pages.length,
      errors,
      durationMs: Date.now() - startTime,
      status,
    };
  }

  /**
   * Crawl a single page, extracting structure via accessibility tree.
   */
  async crawlPage(
    page: PlaywrightPageLike,
    url: string,
    depth: number
  ): Promise<CrawledPage> {
    await page.goto(url, {
      waitUntil: this.options.waitForNetworkIdle ? "networkidle" : "domcontentloaded",
      timeout: this.options.timeout,
    });

    const title = await page.title();

    // Get accessibility snapshot (#486)
    const snapshot = await page.accessibility.snapshot({ interestingOnly: false });

    // Use DOM distiller to extract structured data
    const distilled = snapshot
      ? this.distiller.distill(snapshot)
      : { interactiveElements: [], forms: [], headings: [], links: [], locators: [] };

    // Also extract links from the page DOM for navigation
    // The callback executes in browser context where document/Element are available
    const pageLinks: Array<{ href: string; text: string }> = await page.evaluate(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (() => {
        // Inside browser context: document, HTMLAnchorElement etc. are global
        const doc = (globalThis as any).document; // eslint-disable-line @typescript-eslint/no-unsafe-member-access
        const anchors = doc.querySelectorAll("a[href]");
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        return Array.from(anchors).map((a: any) => ({          // eslint-disable-line @typescript-eslint/no-explicit-any
          href: String(a.href ?? ""),                           // eslint-disable-line @typescript-eslint/no-unsafe-member-access
          text: String(a.textContent?.trim() ?? ""),            // eslint-disable-line @typescript-eslint/no-unsafe-member-access
        }));
      }) as () => Array<{ href: string; text: string }>
    );

    // Merge distilled links with DOM links
    const allLinks = [...pageLinks];
    for (const link of distilled.links) {
      if (!allLinks.some((l) => l.text === link.text)) {
        allLinks.push(link);
      }
    }

    return {
      url,
      title,
      headings: distilled.headings,
      forms: distilled.forms,
      interactiveElements: distilled.interactiveElements,
      links: allLinks,
      accessibilitySnapshot: snapshot ?? undefined,
      depth,
      crawledAt: new Date(),
    };
  }

  // ── URL Helpers ─────────────────────────────────────────────────────────────

  normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      // Remove hash and trailing slash
      parsed.hash = "";
      let pathname = parsed.pathname;
      if (pathname.length > 1 && pathname.endsWith("/")) {
        pathname = pathname.slice(0, -1);
      }
      parsed.pathname = pathname;
      return parsed.toString();
    } catch {
      return url;
    }
  }

  resolveUrl(href: string, base: string): string | null {
    if (!href || href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("tel:")) {
      return null;
    }
    try {
      return new URL(href, base).toString();
    } catch {
      return null;
    }
  }

  private isExcluded(url: string): boolean {
    if (this.options.includePatterns.length > 0) {
      const included = this.options.includePatterns.some((p) => this.matchGlob(url, p));
      if (!included) return true;
    }
    if (this.options.excludePatterns.length > 0) {
      return this.options.excludePatterns.some((p) => this.matchGlob(url, p));
    }
    return false;
  }

  private matchGlob(url: string, pattern: string): boolean {
    // Simple glob: * matches anything except /, ** matches everything
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*\*/g, "{{GLOBSTAR}}")
      .replace(/\*/g, "[^/]*")
      .replace(/\{\{GLOBSTAR\}\}/g, ".*");
    return new RegExp(`^${escaped}$`).test(url);
  }

  // ── Default Browser Launcher ────────────────────────────────────────────────

  private static async defaultLauncher(options: {
    headless: boolean;
    timeout: number;
  }): Promise<PlaywrightBrowserLike> {
    // Dynamic import to avoid hard dependency on playwright at module level
    // @ts-expect-error -- playwright is an optional peer dependency
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: options.headless });
    return browser as unknown as PlaywrightBrowserLike;
  }
}
