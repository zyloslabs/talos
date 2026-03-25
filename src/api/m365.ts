/**
 * M365 API Routes
 *
 * Express router for Microsoft 365 Copilot integration endpoints.
 */

import { Router, type Request, type Response } from "express";
import { resolve } from "node:path";
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

/**
 * Simple in-memory rate limiter for M365 routes.
 * Tracks request timestamps per IP and rejects requests that exceed the limit.
 */
function createRateLimiter(maxRequests: number, windowMs: number) {
  const requests = new Map<string, number[]>();

  // Periodically clean up stale entries to prevent memory growth
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of requests.entries()) {
      const valid = timestamps.filter((t) => now - t < windowMs);
      if (valid.length === 0) requests.delete(key);
      else requests.set(key, valid);
    }
  }, windowMs);
  // Unref so the timer doesn't prevent process exit
  if (cleanupInterval.unref) cleanupInterval.unref();

  return (req: Request, res: Response, next: () => void): void => {
    const key = req.ip ?? "unknown";
    const now = Date.now();
    const timestamps = (requests.get(key) ?? []).filter((t) => now - t < windowMs);
    if (timestamps.length >= maxRequests) {
      res.status(429).json({ error: "Too many requests. Please try again later." });
      return;
    }
    timestamps.push(now);
    requests.set(key, timestamps);
    next();
  };
}

export function createM365Router(options: M365RouterOptions): Router {
  const router = Router();
  const { browserAuth, ephemeralStore } = options;

  // Rate limit: 30 requests per minute for file-system and destructive routes
  const fsRateLimiter = createRateLimiter(30, 60_000);
  // Rate limit: 10 requests per minute for search/fetch (external calls)
  const externalRateLimiter = createRateLimiter(10, 60_000);

  // Helper to get scraper lazily (page may not be ready at router creation)
  const getScraper = (): typeof options.scraper => options.scraper;

  // POST /api/talos/m365/search
  router.post("/search", externalRateLimiter, async (req: Request, res: Response) => {
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
  router.post("/fetch", externalRateLimiter, async (req: Request, res: Response) => {
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
  router.post("/cleanup", fsRateLimiter, async (_req: Request, res: Response) => {
    try {
      await ephemeralStore.cleanup();
      res.json({ status: "ok", message: "Ephemeral documents cleaned up" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: `Cleanup failed: ${message}` });
    }
  });

  // POST /api/talos/m365/convert
  router.post("/convert", fsRateLimiter, async (req: Request, res: Response) => {
    const { path: filePath } = req.body as { path?: string };
    if (!filePath) {
      res.status(400).json({ error: "path is required" });
      return;
    }

    // Prevent path traversal — only allow files within the docs directory
    const docsDir = ephemeralStore.getDocsDir();
    const resolved = resolve(filePath);
    if (!resolved.startsWith(docsDir)) {
      res.status(403).json({ error: "Access denied: path outside allowed directory" });
      return;
    }

    try {
      const { readFile } = await import("node:fs/promises");
      const buffer = await readFile(resolved);
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
