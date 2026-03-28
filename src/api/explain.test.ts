/**
 * Tests for the POST /api/talos/tests/:id/explain endpoint.
 */

import { describe, it, expect, vi } from "vitest";
import express from "express";
import Database from "better-sqlite3";
import { TalosRepository } from "../talos/repository.js";
import type { CopilotWrapper } from "../copilot/copilot-wrapper.js";

// Helper: create a minimal Express app with the explain route wired
function buildApp(copilot?: Partial<CopilotWrapper>) {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const repo = new TalosRepository(db);
  repo.migrate();

  // Seed a test application and a test record
  const app_ = repo.createApplication({
    name: "Test App",
    repositoryUrl: "https://github.com/test/repo",
    baseUrl: "https://test.app",
    description: "",
  });
  const test_ = repo.createTest({
    applicationId: app_.id,
    name: "Login test",
    description: "Verify login",
    type: "e2e",
    code: "import { test } from '@playwright/test';\ntest('login', async ({ page }) => { /* ... */ });",
    tags: [],
  });

  const appExpress = express();
  appExpress.use(express.json());

  // Minimal version of the explain endpoint (copied logic from src/index.ts)
  appExpress.post("/api/talos/tests/:id/explain", async (req, res) => {
    const record = repo.getTest(req.params.id);
    if (!record) {
      res.status(404).json({ error: "Test not found" });
      return;
    }

    const { selection } = req.body as { selection?: string };

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

    const codeToExplain = selection ?? record.code;

    if (!copilot) {
      res.json({ explanation: "AI explanation not available — Copilot is not configured." });
      return;
    }

    const systemPrompt = `You are a QA expert. Explain what this Playwright test is doing in plain English.`;
    const userPrompt = selection
      ? `Explain this code selection:\n\n${codeToExplain}`
      : `Explain this Playwright test:\n\`\`\`typescript\n${codeToExplain}\n\`\`\``;

    try {
      let explanation = "";
      for await (const chunk of (copilot as CopilotWrapper).chat(userPrompt, {
        systemMessage: { mode: "replace", content: systemPrompt },
        conversationId: `explain-${req.params.id}-${Date.now()}`,
      })) {
        explanation += chunk;
      }
      res.json({ explanation: explanation.trim() });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: `Explanation failed: ${errMsg}` });
    }
  });

  return { appExpress, repo, testId: test_.id };
}

async function withServer(app: express.Express, fn: (baseUrl: string) => Promise<void>) {
  const { createServer } = await import("node:http");
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

describe("POST /api/talos/tests/:id/explain", () => {
  describe("without Copilot configured", () => {
    it("returns fallback message when copilot is undefined", async () => {
      const { appExpress, testId } = buildApp(undefined);
      await withServer(appExpress, async (base) => {
        const res = await fetch(`${base}/api/talos/tests/${testId}/explain`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        expect(res.status).toBe(200);
        const body = (await res.json()) as { explanation: string };
        expect(body.explanation).toContain("Copilot is not configured");
      });
    });
  });

  describe("with Copilot configured", () => {
    async function* mockStream(chunks: string[]): AsyncGenerator<string> {
      for (const chunk of chunks) yield chunk;
    }

    it("returns explanation from streaming chat", async () => {
      const mockCopilot: Partial<CopilotWrapper> = {
        chat: vi.fn().mockReturnValue(mockStream(["This test", " verifies login."])),
      };
      const { appExpress, testId } = buildApp(mockCopilot);

      await withServer(appExpress, async (base) => {
        const res = await fetch(`${base}/api/talos/tests/${testId}/explain`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        expect(res.status).toBe(200);
        const body = (await res.json()) as { explanation: string };
        expect(body.explanation).toBe("This test verifies login.");
      });
    });

    it("uses selection when provided", async () => {
      const mockCopilot: Partial<CopilotWrapper> = {
        chat: vi.fn().mockReturnValue(mockStream(["This selection checks the button click."])),
      };
      const { appExpress, testId } = buildApp(mockCopilot);

      await withServer(appExpress, async (base) => {
        const res = await fetch(`${base}/api/talos/tests/${testId}/explain`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ selection: "await page.click('button')" }),
        });
        expect(res.status).toBe(200);
        const body = (await res.json()) as { explanation: string };
        expect(body.explanation).toBe("This selection checks the button click.");

        // Verify the user prompt contains the selection
        const chatSpy = mockCopilot.chat as ReturnType<typeof vi.fn>;
        const userPromptArg: string = chatSpy.mock.calls[0][0];
        expect(userPromptArg).toContain("await page.click");
        expect(userPromptArg).toContain("selection");
      });
    });

    it("returns 404 when test does not exist", async () => {
      const mockCopilot: Partial<CopilotWrapper> = {
        chat: vi.fn().mockReturnValue(mockStream(["irrelevant"])),
      };
      const { appExpress } = buildApp(mockCopilot);

      await withServer(appExpress, async (base) => {
        const res = await fetch(`${base}/api/talos/tests/nonexistent-id/explain`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        expect(res.status).toBe(404);
        const body = (await res.json()) as { error: string };
        expect(body.error).toBe("Test not found");
      });
    });

    it("returns 500 when copilot.chat throws", async () => {
      const mockCopilot: Partial<CopilotWrapper> = {
        chat: vi.fn().mockImplementation(function* () {
          throw new Error("Chat service unavailable");
        }),
      };
      const { appExpress, testId } = buildApp(mockCopilot);

      await withServer(appExpress, async (base) => {
        const res = await fetch(`${base}/api/talos/tests/${testId}/explain`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        expect(res.status).toBe(500);
        const body = (await res.json()) as { error: string };
        expect(body.error).toContain("Explanation failed");
      });
    });

    it("trims whitespace from explanation", async () => {
      const mockCopilot: Partial<CopilotWrapper> = {
        chat: vi.fn().mockReturnValue(mockStream(["  Explanation with spaces.  "])),
      };
      const { appExpress, testId } = buildApp(mockCopilot);

      await withServer(appExpress, async (base) => {
        const res = await fetch(`${base}/api/talos/tests/${testId}/explain`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        expect(res.status).toBe(200);
        const body = (await res.json()) as { explanation: string };
        expect(body.explanation).toBe("Explanation with spaces.");
      });
    });

    it("returns 400 when selection is not a string", async () => {
      const mockCopilot: Partial<CopilotWrapper> = {
        chat: vi.fn().mockReturnValue(mockStream(["irrelevant"])),
      };
      const { appExpress, testId } = buildApp(mockCopilot);

      await withServer(appExpress, async (base) => {
        const res = await fetch(`${base}/api/talos/tests/${testId}/explain`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ selection: 12345 }),
        });
        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: string };
        expect(body.error).toBe("selection must be a string");
      });
    });

    it("returns 400 when selection exceeds 10000 characters", async () => {
      const mockCopilot: Partial<CopilotWrapper> = {
        chat: vi.fn().mockReturnValue(mockStream(["irrelevant"])),
      };
      const { appExpress, testId } = buildApp(mockCopilot);

      await withServer(appExpress, async (base) => {
        const res = await fetch(`${base}/api/talos/tests/${testId}/explain`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ selection: "x".repeat(10001) }),
        });
        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: string };
        expect(body.error).toBe("selection too long (max 10000 characters)");
      });
    });
  });
});
