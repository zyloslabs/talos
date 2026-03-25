/**
 * Unit tests for CopilotScraper (src/talos/m365/scraper.ts)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { CopilotScraper } from "./scraper.js";
import { ScrapeError } from "./types.js";
import { SELECTORS } from "./selectors.js";

// ── Mock Page ─────────────────────────────────────────────────────────────────

function createMockPage() {
  const mockElement = {
    click: vi.fn(),
    evaluate: vi.fn().mockResolvedValue(false),
    textContent: vi.fn().mockResolvedValue(""),
    $eval: vi.fn().mockResolvedValue(""),
  };

  const mockPage = {
    $: vi.fn().mockResolvedValue(null),
    $$: vi.fn().mockResolvedValue([]),
    url: vi.fn().mockReturnValue("https://m365.cloud.microsoft/chat/"),
    waitForSelector: vi.fn().mockResolvedValue(mockElement),
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
    keyboard: {
      press: vi.fn(),
      type: vi.fn(),
    },
    context: vi.fn().mockReturnValue({
      request: {
        fetch: vi.fn().mockResolvedValue({
          ok: vi.fn().mockReturnValue(true),
          status: vi.fn().mockReturnValue(200),
          body: vi.fn().mockResolvedValue(Buffer.from("file-data")),
        }),
      },
      newPage: vi.fn(),
    }),
  };

  return { mockPage, mockElement };
}

describe("CopilotScraper", () => {
  let scraper: CopilotScraper;
  let mockPage: ReturnType<typeof createMockPage>["mockPage"];
  let mockElement: ReturnType<typeof createMockPage>["mockElement"];

  beforeEach(() => {
    vi.clearAllMocks();
    const mocks = createMockPage();
    mockPage = mocks.mockPage;
    mockElement = mocks.mockElement;
    scraper = new CopilotScraper(mockPage as never);
  });

  // ── buildEnrichedQuery ──────────────────────────────────────────────────

  describe("buildEnrichedQuery", () => {
    it("includes the original query", () => {
      const result = scraper.buildEnrichedQuery("test documents");
      expect(result).toContain("test documents");
    });

    it("includes search instructions", () => {
      const result = scraper.buildEnrichedQuery("find reports");
      expect(result).toContain("SharePoint");
      expect(result).toContain("OneDrive");
      expect(result).toContain("Teams");
    });

    it("includes current year range", () => {
      const year = new Date().getFullYear();
      const result = scraper.buildEnrichedQuery("query");
      expect(result).toContain(String(year));
      expect(result).toContain(String(year - 1));
    });
  });

  // ── scoreModel ──────────────────────────────────────────────────────────

  describe("scoreModel", () => {
    it("scores higher versions higher", () => {
      expect(scraper.scoreModel("GPT-4")).toBeGreaterThan(scraper.scoreModel("GPT-3.5"));
    });

    it("adds bonus for think models", () => {
      expect(scraper.scoreModel("GPT-4 Think")).toBeGreaterThan(scraper.scoreModel("GPT-4"));
    });

    it("handles models with no version", () => {
      expect(scraper.scoreModel("Custom Model")).toBe(0);
    });

    it("adds think bonus to versionless models", () => {
      expect(scraper.scoreModel("Think Model")).toBe(0.5);
    });
  });

  // ── extractResults ──────────────────────────────────────────────────────

  describe("extractResults", () => {
    it("returns empty array when no items found and no response container", async () => {
      mockPage.$$.mockResolvedValue([]);
      mockPage.$.mockResolvedValue(null);
      const results = await scraper.extractResults();
      expect(results).toEqual([]);
    });

    it("falls back to response container text", async () => {
      mockPage.$$.mockResolvedValue([]);
      mockPage.$.mockResolvedValue({
        textContent: vi.fn().mockResolvedValue("Copilot says hello"),
      });
      const results = await scraper.extractResults();
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe("Copilot Response");
      expect(results[0].snippet).toBe("Copilot says hello");
    });

    it("extracts title, snippet, and url from result items", async () => {
      const mockItem = {
        $eval: vi.fn()
          .mockResolvedValueOnce("Document Title")
          .mockResolvedValueOnce("Summary of doc")
          .mockResolvedValueOnce("https://sharepoint.com/doc.docx"),
      };
      mockPage.$$.mockResolvedValue([mockItem]);
      const results = await scraper.extractResults();
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe("Document Title");
      expect(results[0].snippet).toBe("Summary of doc");
      expect(results[0].url).toBe("https://sharepoint.com/doc.docx");
      expect(results[0].fileType).toBe("docx");
    });

    it("handles $eval failures gracefully", async () => {
      const mockItem = {
        $eval: vi.fn()
          .mockResolvedValueOnce("Title Only")
          .mockRejectedValueOnce(new Error("not found"))
          .mockRejectedValueOnce(new Error("not found")),
      };
      mockPage.$$.mockResolvedValue([mockItem]);
      const results = await scraper.extractResults();
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe("Title Only");
      expect(results[0].snippet).toBe("");
    });

    it("skips items with no title and no snippet", async () => {
      const mockItem = {
        $eval: vi.fn().mockResolvedValue(""),
      };
      mockPage.$$.mockResolvedValue([mockItem]);
      const results = await scraper.extractResults();
      expect(results).toEqual([]);
    });
  });

  // ── waitForResults ──────────────────────────────────────────────────────

  describe("waitForResults", () => {
    it("succeeds when result container appears", async () => {
      mockPage.$.mockResolvedValue(null); // no loading indicator
      mockPage.waitForSelector.mockResolvedValue(mockElement);
      await expect(scraper.waitForResults()).resolves.not.toThrow();
    });

    it("throws ScrapeError when all selectors timeout", async () => {
      mockPage.$.mockResolvedValue(null);
      mockPage.waitForSelector.mockRejectedValue(new Error("timeout"));
      mockPage.waitForLoadState.mockRejectedValue(new Error("timeout"));
      await expect(scraper.waitForResults()).rejects.toThrow(ScrapeError);
    });
  });

  // ── downloadFile ────────────────────────────────────────────────────────

  describe("downloadFile", () => {
    it("returns buffer on successful download", async () => {
      const mockResponse = {
        ok: () => true,
        status: () => 200,
        body: () => Promise.resolve(Buffer.from("file-content")),
      };
      mockPage.context.mockReturnValue({
        request: { fetch: vi.fn().mockResolvedValue(mockResponse) },
        newPage: vi.fn(),
      });
      const result = await scraper.downloadFile("https://example.com/file.docx");
      expect(Buffer.isBuffer(result)).toBe(true);
    });

    it("retries with session priming on 401", async () => {
      const mock401 = {
        ok: () => false,
        status: () => 401,
      };
      const mockOk = {
        ok: () => true,
        status: () => 200,
        body: () => Promise.resolve(Buffer.from("file-data")),
      };
      const mockNewPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      };
      const fetchFn = vi.fn()
        .mockResolvedValueOnce(mock401)
        .mockResolvedValueOnce(mockOk);
      mockPage.context.mockReturnValue({
        request: { fetch: fetchFn },
        newPage: vi.fn().mockResolvedValue(mockNewPage),
      });

      const result = await scraper.downloadFile("https://sharepoint.com/doc.pdf");
      expect(Buffer.isBuffer(result)).toBe(true);
      expect(fetchFn).toHaveBeenCalledTimes(2);
    });

    it("throws on non-auth failure", async () => {
      const mock500 = {
        ok: () => false,
        status: () => 500,
      };
      mockPage.context.mockReturnValue({
        request: { fetch: vi.fn().mockResolvedValue(mock500) },
        newPage: vi.fn(),
      });
      await expect(scraper.downloadFile("https://example.com/file.pdf")).rejects.toThrow(ScrapeError);
    });
  });

  // ── selectBestModel ─────────────────────────────────────────────────────

  describe("selectBestModel", () => {
    it("does nothing when picker button not found", async () => {
      mockPage.$.mockResolvedValue(null);
      await expect(scraper.selectBestModel()).resolves.not.toThrow();
    });

    it("selects the highest scoring model", async () => {
      const pickerBtn = { click: vi.fn() };
      const gpt3opt = { textContent: vi.fn().mockResolvedValue("GPT-3.5"), click: vi.fn() };
      const gpt4opt = { textContent: vi.fn().mockResolvedValue("GPT-4"), click: vi.fn() };
      const gpt4think = { textContent: vi.fn().mockResolvedValue("GPT-4 Think"), click: vi.fn() };

      mockPage.$.mockImplementation(async (sel: string) => {
        if (sel === SELECTORS.MODEL_PICKER_BUTTON) return pickerBtn;
        return null;
      });
      mockPage.waitForSelector.mockResolvedValue(gpt3opt);
      mockPage.$$.mockResolvedValue([gpt3opt, gpt4opt, gpt4think]);

      await scraper.selectBestModel();
      expect(gpt4think.click).toHaveBeenCalled();
      expect(gpt3opt.click).not.toHaveBeenCalled();
    });
  });

  // ── search (integration of subcomponents) ──────────────────────────────

  describe("search", () => {
    it("types query and triggers search", async () => {
      const inputEl = { click: vi.fn() };
      const responseContainer = {
        textContent: vi.fn().mockResolvedValue("Response text from Copilot"),
      };

      mockPage.waitForSelector.mockResolvedValue(inputEl);
      // Model picker not found
      mockPage.$.mockImplementation(async (sel: string) => {
        if (sel === SELECTORS.MODEL_PICKER_BUTTON) return null;
        if (sel === SELECTORS.THINK_DEEPER_BUTTON) return null;
        if (sel === SELECTORS.SEARCH_BUTTON) return null;
        if (sel === SELECTORS.LOADING_INDICATOR) return null;
        if (sel === SELECTORS.RESPONSE_CONTAINER) return responseContainer;
        return null;
      });

      // For waitForResults — make one of the race promises resolve
      mockPage.waitForLoadState.mockResolvedValue(undefined);
      // extractResults — no result items, falls back to response container
      mockPage.$$.mockResolvedValue([]);

      const results = await scraper.search("test query");
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe("Copilot Response");
      expect(mockPage.keyboard.type).toHaveBeenCalled();
      // Should have pressed Enter since no search button found
      expect(mockPage.keyboard.press).toHaveBeenCalledWith("Enter");
    });
  });
});
