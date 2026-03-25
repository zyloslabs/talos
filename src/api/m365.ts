/**
 * M365 API Routes
 *
 * Express router for Microsoft 365 Copilot integration endpoints.
 */

import { Router, type Request, type Response } from "express";
import type { BrowserAuth } from "../talos/m365/browser-auth.js";
import type { CopilotScraper } from "../talos/m365/scraper.js";
import type { EphemeralStore } from "../talos/m365/ephemeral.js";
import { parseFile } from "../talos/m365/file-parser.js";
import type { FileType } from "../talos/m365/types.js";

export interface M365RouterOptions {
  browserAuth: BrowserAuth | null;
  scraper: CopilotScraper | null;
  ephemeralStore: EphemeralStore;
}

export function createM365Router(options: M365RouterOptions): Router {
  const router = Router();
  const { browserAuth, ephemeralStore } = options;

  // Helper to get scraper lazily (page may not be ready at router creation)
  const getScraper = (): typeof options.scraper => options.scraper;

  // POST /api/talos/m365/search
  router.post("/search", async (req: Request, res: Response) => {
    const { query } = req.body as { query?: string };
    if (!query) {
      res.status(400).json({ error: "query is required" });
      return;
    }

    const scraper = getScraper();
    if (!scraper) {
      res.status(503).json({ error: "M365 integration is not initialized" });
      return;
    }

    try {
      const results = await scraper.search(query);
      res.json({ results });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: `Search failed: ${message}` });
    }
  });

  // POST /api/talos/m365/fetch
  router.post("/fetch", async (req: Request, res: Response) => {
    const { url, fileType } = req.body as { url?: string; fileType?: string };
    if (!url || !fileType) {
      res.status(400).json({ error: "url and fileType are required" });
      return;
    }

    const validTypes = ["docx", "pdf", "xlsx", "pptx"];
    if (!validTypes.includes(fileType)) {
      res.status(400).json({ error: `fileType must be one of: ${validTypes.join(", ")}` });
      return;
    }

    const scraper = getScraper();
    if (!scraper) {
      res.status(503).json({ error: "M365 integration is not initialized" });
      return;
    }

    try {
      const buffer = await scraper.downloadFile(url);
      const markdown = await parseFile(buffer, fileType as FileType);
      const filename = `fetch-${Date.now()}`;
      const savedPath = await ephemeralStore.saveMd(filename, markdown);
      res.json({ content: markdown, savedPath });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: `Fetch failed: ${message}` });
    }
  });

  // GET /api/talos/m365/status
  router.get("/status", async (_req: Request, res: Response) => {
    if (!browserAuth) {
      res.json({ status: "disabled", message: "M365 integration is not enabled" });
      return;
    }

    try {
      const valid = await browserAuth.isSessionValid();
      res.json({
        status: valid ? "active" : "expired",
        userDataDir: browserAuth.getUserDataDir(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.json({ status: "error", message });
    }
  });

  // POST /api/talos/m365/cleanup
  router.post("/cleanup", async (_req: Request, res: Response) => {
    try {
      await ephemeralStore.cleanup();
      res.json({ status: "ok", message: "Ephemeral documents cleaned up" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: `Cleanup failed: ${message}` });
    }
  });

  // POST /api/talos/m365/convert
  router.post("/convert", async (req: Request, res: Response) => {
    const { path: filePath } = req.body as { path?: string };
    if (!filePath) {
      res.status(400).json({ error: "path is required" });
      return;
    }

    try {
      const { readFile } = await import("node:fs/promises");
      const buffer = await readFile(filePath);
      const ext = filePath.toLowerCase().split(".").pop();
      const validExtensions: Record<string, FileType> = {
        docx: "docx",
        pdf: "pdf",
        xlsx: "xlsx",
        pptx: "pptx",
      };
      const fileType = validExtensions[ext ?? ""];
      if (!fileType) {
        res.status(400).json({ error: `Unsupported file type: .${ext}` });
        return;
      }

      const markdown = await parseFile(buffer, fileType);
      res.json({ content: markdown, fileType });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: `Conversion failed: ${message}` });
    }
  });

  return router;
}
