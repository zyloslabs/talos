/**
 * Unit tests for the POST /api/talos/tests/:id/explain endpoint.
 *
 * Covers:
 * - Input validation (selection type + length limits) — OWASP A03 prompt injection guard
 * - Valid selection routed to copilot mock
 * - Fallback when Copilot is unavailable
 */

import { describe, it, expect } from "vitest";
import express from "express";
import Database from "better-sqlite3";
import { createServer, type Server as HttpServer } from "node:http";
import { TalosRepository } from "../talos/repository.js";

// ── Minimal copilot mock ──────────────────────────────────────────────────────

function makeCopilotMock(response: string) {
  return {
    chat: async function* (..._args: unknown[]): AsyncGenerator<string> {
      yield response;
    },
  };
}

// ── Test app factory ──────────────────────────────────────────────────────────

function createExplainApp(copilot?: { chat: (...args: unknown[]) => AsyncIterable<string> }) {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const repo = new TalosRepository(db);
  repo.migrate();

  const app = express();
  app.use(express.json());

  // Seed a test record
  const appRecord = repo.createApplication({
    name: "TestApp",
    repositoryUrl: "https://github.com/a/b",
    baseUrl: "https://example.com",
  });

  const testRecord = repo.createTest({
    applicationId: appRecord.id,
    name: "Login test",
    code: "import { test } from '@playwright/test';\ntest('login', async ({ page }) => { await page.goto('/'); });",
    type: "e2e",
    tags: [],
  });

  app.post("/api/talos/tests/:id/explain", async (req, res) => {
    const { selection } = req.body as { selection?: unknown };

    // Guard against prompt injection via oversized or malicious selections
    if (selection !== undefined) {
      if (typeof selection !== "string") {
        res.status(400).json({ error: "selection must be a string" });
        return;
      }
      if (selection.length > 10000) {
        res.status(400).json({ error: "selection too long (max 10000 characters)" });
        return;
      }
    }

    const test = repo.getTest(req.params.id);
    if (!test) {
      res.status(404).json({ error: "Test not found" });
      return;
    }

    const codeToExplain = typeof selection === "string" && selection.length > 0 ? selection : test.code;

    if (!copilot) {
      res.json({ explanation: "Copilot SDK is not configured. Go to Admin > Auth to set up authentication." });
      return;
    }

    try {
      const systemPrompt =
        "You are an expert Playwright test explainer. Explain what the provided test code does in clear, concise terms.";
      const userPrompt = `Explain this Playwright test:\n\`\`\`typescript\n${codeToExplain}\n\`\`\``;

      let explanation = "";
      for await (const chunk of copilot.chat(userPrompt, {
        systemMessage: { mode: "replace", content: systemPrompt },
      })) {
        explanation += chunk;
      }

      res.json({ explanation });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: `Explanation failed: ${errMsg}` });
    }
  });

  return { app, testRecord };
}

async function withServer(app: express.Express, fn: (base: string, httpServer: HttpServer) => Promise<void>) {
  const httpServer = createServer(app);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const addr = httpServer.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  try {
    await fn(`http://127.0.0.1:${port}`, httpServer);
  } finally {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/talos/tests/:id/explain — input validation", () => {
  it("returns 400 when selection is longer than 10000 characters", async () => {
    const { app, testRecord } = createExplainApp(makeCopilotMock("This test navigates to the homepage."));
    await withServer(app, async (base) => {
      const oversized = "x".repeat(10001);
      const res = await fetch(`${base}/api/talos/tests/${testRecord.id}/explain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selection: oversized }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/too long/i);
    });
  });

  it("returns 400 when selection is not a string", async () => {
    const { app, testRecord } = createExplainApp(makeCopilotMock("Explanation."));
    await withServer(app, async (base) => {
      const res = await fetch(`${base}/api/talos/tests/${testRecord.id}/explain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selection: 12345 }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/string/i);
    });
  });

  it("returns 400 when selection is a non-string object", async () => {
    const { app, testRecord } = createExplainApp(makeCopilotMock("Explanation."));
    await withServer(app, async (base) => {
      const res = await fetch(`${base}/api/talos/tests/${testRecord.id}/explain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selection: { evil: "payload" } }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/string/i);
    });
  });

  it("returns 200 with explanation when selection is exactly 10000 characters", async () => {
    const { app, testRecord } = createExplainApp(makeCopilotMock("Explanation text."));
    await withServer(app, async (base) => {
      const maxValid = "x".repeat(10000);
      const res = await fetch(`${base}/api/talos/tests/${testRecord.id}/explain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selection: maxValid }),
      });
      expect(res.status).toBe(200);
    });
  });

  it("routes valid selection to copilot mock and returns explanation", async () => {
    const mockResponse = "This test logs into the application.";
    const { app, testRecord } = createExplainApp(makeCopilotMock(mockResponse));
    await withServer(app, async (base) => {
      const res = await fetch(`${base}/api/talos/tests/${testRecord.id}/explain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selection: "await page.goto('/');" }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { explanation: string };
      expect(body.explanation).toBe(mockResponse);
    });
  });

  it("uses full test code when no selection is provided", async () => {
    const mockResponse = "This is a full test explanation.";
    const { app, testRecord } = createExplainApp(makeCopilotMock(mockResponse));
    await withServer(app, async (base) => {
      const res = await fetch(`${base}/api/talos/tests/${testRecord.id}/explain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { explanation: string };
      expect(body.explanation).toBe(mockResponse);
    });
  });

  it("returns fallback message when copilot is not configured", async () => {
    const { app, testRecord } = createExplainApp(undefined);
    await withServer(app, async (base) => {
      const res = await fetch(`${base}/api/talos/tests/${testRecord.id}/explain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selection: "await page.goto('/');" }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { explanation: string };
      expect(body.explanation).toMatch(/not configured/i);
    });
  });

  it("returns 404 for unknown test id", async () => {
    const { app } = createExplainApp(makeCopilotMock("explanation"));
    await withServer(app, async (base) => {
      const res = await fetch(`${base}/api/talos/tests/non-existent-id/explain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(404);
    });
  });
});
