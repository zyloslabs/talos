/**
 * CopilotScraper — DOM scraping with retry + exponential backoff.
 * Adapted from copilot365-int for Talos M365 integration.
 */

import type { Page, ElementHandle } from "@playwright/test";
import { SELECTORS, type SelectorsConfig } from "./selectors.js";
import { ScrapeError, type SearchResult, type RetryOptions } from "./types.js";

const DEFAULT_RETRY: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 1000,
};

export class CopilotScraper {
  constructor(
    private readonly page: Page,
    private readonly selectors: SelectorsConfig = SELECTORS,
  ) {}

  buildEnrichedQuery(rawQuery: string): string {
    const year = new Date().getFullYear();
    return [
      rawQuery,
      "",
      "Search thoroughly across SharePoint, OneDrive, Teams, and Email.",
      "For each relevant result please include:",
      "- Document title and file type (DOCX, PDF, XLSX, PPTX)",
      "- A direct SharePoint or OneDrive URL to the file",
      "- The date the document was last modified",
      "- A 2-3 sentence summary of the key content",
      `Prioritize content from ${year - 1}–${year} unless the query specifies otherwise.`,
    ].join("\n");
  }

  async search(query: string): Promise<SearchResult[]> {
    const enrichedQuery = this.buildEnrichedQuery(query);

    const input = await this.retryAction<ElementHandle>(
      () => this.page.waitForSelector(this.selectors.SEARCH_INPUT, { timeout: 10_000 }) as Promise<ElementHandle>,
      { ...DEFAULT_RETRY, step: "wait_for_search_input", selector: this.selectors.SEARCH_INPUT },
    );

    await this.selectBestModel();

    const thinkDeeperBtn = await this.page.$(this.selectors.THINK_DEEPER_BUTTON);
    if (thinkDeeperBtn) {
      const isActive = await thinkDeeperBtn.evaluate(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (el: any) => el.getAttribute("aria-pressed") === "true" || el.getAttribute("aria-checked") === "true",
      );
      if (!isActive) {
        await thinkDeeperBtn.click();
      }
    }

    await input.click();
    await this.page.keyboard.press("Control+a");
    await this.page.keyboard.press("Backspace");
    await this.page.keyboard.type(enrichedQuery, { delay: 30 });

    const button = await this.page.$(this.selectors.SEARCH_BUTTON);
    if (button) {
      await button.click();
    } else {
      await this.page.keyboard.press("Enter");
    }

    await this.waitForResults();
    return this.extractResults();
  }

  async waitForResults(): Promise<void> {
    try {
      const loading = await this.page.$(this.selectors.LOADING_INDICATOR);
      if (loading) {
        await this.page.waitForSelector(this.selectors.LOADING_INDICATOR, {
          state: "hidden",
          timeout: 30_000,
        });
      }
    } catch {
      // Loading indicator may not appear
    }

    try {
      await Promise.race([
        this.page.waitForSelector(this.selectors.RESULT_CONTAINER, { timeout: 30_000 }),
        this.page.waitForSelector(this.selectors.RESPONSE_CONTAINER, { timeout: 30_000 }),
        this.page.waitForLoadState("networkidle"),
      ]);
    } catch {
      throw new ScrapeError(
        "Timed out waiting for search results",
        this.selectors.RESULT_CONTAINER,
        "wait_for_results",
      );
    }
  }

  async extractResults(): Promise<SearchResult[]> {
    const items = await this.page.$$(this.selectors.RESULT_ITEM);

    if (items.length === 0) {
      const responseEl = await this.page.$(this.selectors.RESPONSE_CONTAINER);
      if (responseEl) {
        const text = await responseEl.textContent();
        return text
          ? [{ title: "Copilot Response", snippet: text.trim(), url: this.page.url() }]
          : [];
      }
      return [];
    }

    const results: SearchResult[] = [];
    for (const item of items) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const title = await item.$eval(this.selectors.RESULT_TITLE, (el: any) => el.textContent?.trim() ?? "").catch(() => "");
      const snippet = await item
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .$eval(this.selectors.RESULT_SNIPPET, (el: any) => el.textContent?.trim() ?? "")
        .catch(() => "");
      const url = await item
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .$eval(this.selectors.RESULT_LINK, (el: any) => el.href ?? "")
        .catch(() => "");

      if (title || snippet) {
        results.push({
          title,
          snippet,
          url,
          fileType: this.detectFileType(url),
        });
      }
    }
    return results;
  }

  async downloadFile(url: string): Promise<Buffer> {
    const downloadUrl = this.toSharePointDownloadUrl(url);

    const response = await this.page.context().request.fetch(downloadUrl, {
      headers: { Accept: "application/octet-stream, */*" },
    });

    if (response.ok()) {
      return Buffer.from(await response.body());
    }

    if (response.status() === 401 || response.status() === 403) {
      await this.primeSharePointSession(downloadUrl);

      const retryResponse = await this.page.context().request.fetch(downloadUrl, {
        headers: { Accept: "application/octet-stream, */*" },
      });

      if (retryResponse.ok()) {
        return Buffer.from(await retryResponse.body());
      }

      if (retryResponse.status() === 401 || retryResponse.status() === 403) {
        return this.downloadViaBrowser(downloadUrl, url);
      }

      throw new ScrapeError(
        `Download failed after session prime: HTTP ${retryResponse.status()}`,
        downloadUrl,
        "download_file",
      );
    }

    throw new ScrapeError(
      `Download failed: HTTP ${response.status()}`,
      downloadUrl,
      "download_file",
    );
  }

  private async primeSharePointSession(downloadUrl: string): Promise<void> {
    const origin = new URL(downloadUrl).origin;
    const newPage = await this.page.context().newPage();
    try {
      await newPage.goto(origin, { waitUntil: "domcontentloaded", timeout: 30_000 });
    } catch {
      // Best-effort
    } finally {
      await newPage.close().catch(() => {});
    }
  }

  private async downloadViaBrowser(downloadUrl: string, originalUrl: string): Promise<Buffer> {
    const newPage = await this.page.context().newPage();
    try {
      await newPage.goto(originalUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });

      const base64 = await newPage.evaluate(async (apiUrl: string): Promise<string> => {
        const resp = await fetch(apiUrl, {
          credentials: "include",
          headers: { Accept: "application/octet-stream, */*" },
        });
        if (!resp.ok) {
          throw new Error(`In-page fetch failed: HTTP ${resp.status}`);
        }
        const buf = await resp.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let bin = "";
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin);
      }, downloadUrl);

      return Buffer.from(base64, "base64");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new ScrapeError(
        `Browser in-page download failed: ${message}`,
        originalUrl,
        "download_via_browser",
      );
    } finally {
      await newPage.close().catch(() => {});
    }
  }

  scoreModel(label: string): number {
    const lower = label.toLowerCase();
    const versionMatches = lower.match(/\d+(?:\.\d+)?/g) ?? [];
    const maxVersion = versionMatches.map(Number).reduce((max, v) => (v > max ? v : max), 0);
    const thinkBonus = lower.includes("think") ? 0.5 : 0;
    return maxVersion + thinkBonus;
  }

  async selectBestModel(): Promise<void> {
    const pickerBtn = await this.page.$(this.selectors.MODEL_PICKER_BUTTON);
    if (!pickerBtn) return;

    await pickerBtn.click();

    try {
      await this.page.waitForSelector(this.selectors.MODEL_OPTION_ITEM, { timeout: 5_000 });
    } catch {
      return;
    }

    const options = await this.page.$$(this.selectors.MODEL_OPTION_ITEM);
    if (options.length === 0) return;

    let bestOption: (typeof options)[0] | null = null;
    let bestScore = -1;

    for (const option of options) {
      const label = await option.textContent().catch(() => "");
      if (!label) continue;
      const score = this.scoreModel(label);
      if (score > bestScore) {
        bestScore = score;
        bestOption = option;
      }
    }

    if (bestOption) {
      await bestOption.click();
    }
  }

  private toSharePointDownloadUrl(url: string): string {
    const spLayoutsPattern = /\/_layouts\/15\/(Doc|viewer)\.aspx/i;
    if (spLayoutsPattern.test(url)) {
      const u = new URL(url);
      const sourcedoc = u.searchParams.get("sourcedoc");
      if (sourcedoc) {
        const guid = sourcedoc.replace(/^\{|\}$/g, "");
        const siteBase = `${u.origin}${u.pathname.replace(spLayoutsPattern, "")}`;
        return `${siteBase}/_api/Web/GetFileById('${guid}')/$value`;
      }
    }
    return url;
  }

  private detectFileType(url: string): SearchResult["fileType"] {
    if (!url) return "unknown";
    const lower = url.toLowerCase();
    if (lower.includes(".docx") || lower.includes("word")) return "docx";
    if (lower.includes(".pdf")) return "pdf";
    if (lower.includes(".xlsx") || lower.includes("excel")) return "xlsx";
    if (lower.includes(".pptx") || lower.includes("powerpoint")) return "pptx";
    return "unknown";
  }

  private async retryAction<T>(
    fn: () => Promise<T>,
    opts: RetryOptions & { step: string; selector: string },
  ): Promise<T> {
    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= opts.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        opts.onRetry?.(attempt, lastError);
        if (attempt < opts.maxRetries) {
          await new Promise((r) => setTimeout(r, opts.baseDelayMs * Math.pow(2, attempt - 1)));
        }
      }
    }
    throw new ScrapeError(
      `Failed after ${opts.maxRetries} retries: ${lastError?.message}`,
      opts.selector,
      opts.step,
    );
  }
}
