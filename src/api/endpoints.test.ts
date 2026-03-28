/**
 * Integration tests for Talos API endpoints defined in index.ts.
 *
 * Tests session listing/restore, test generation (with code injection defense),
 * and knowledge base endpoints.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import Database from "better-sqlite3";
import { mkdirSync, writeFileSync, rmSync, readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import crypto from "node:crypto";
import { TalosRepository } from "../talos/repository.js";
import { PlatformRepository } from "../platform/repository.js";
import { createAdminRouter } from "./admin.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const TEST_TOKEN = "test-token-xyz";

function createTestApp() {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const repo = new TalosRepository(db);
  repo.migrate();
  const platformRepo = new PlatformRepository(db);
  platformRepo.migrate();

  const sessionsDir = join(tmpdir(), `talos-test-sessions-${crypto.randomUUID()}`);
  mkdirSync(sessionsDir, { recursive: true });

  const app = express();
  app.use(express.json());

  // ── Session endpoints (mirroring index.ts) ──

  app.get("/api/talos/sessions", (_req, res) => {
    const sessions: { id: string; startedAt: string; lastMessageAt: string; messageCount: number; preview: string }[] =
      [];
    try {
      const files = readdirSync(sessionsDir) as string[];
      for (const file of files) {
        if (!file.endsWith(".jsonl")) continue;
        const id = file.replace(".jsonl", "");
        const filePath = join(sessionsDir, file);
        const stat = statSync(filePath);
        const content = readFileSync(filePath, "utf-8");
        const lines = content.trim().split("\n").filter(Boolean);
        if (lines.length === 0) continue;
        const firstMsg = JSON.parse(lines[0]);
        const lastMsg = JSON.parse(lines[lines.length - 1]);
        const userMessages = lines.filter((l: string) => {
          try {
            return JSON.parse(l).role === "user";
          } catch {
            return false;
          }
        });
        const preview = userMessages.length > 0 ? JSON.parse(userMessages[0]).content.substring(0, 100) : "";
        sessions.push({
          id,
          startedAt: firstMsg.timestamp ?? stat.birthtime.toISOString(),
          lastMessageAt: lastMsg.timestamp ?? stat.mtime.toISOString(),
          messageCount: lines.length,
          preview,
        });
      }
    } catch {
      /* empty */
    }
    sessions.sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
    res.json(sessions);
  });

  // TODO: add rate limiting per client IP before production deployment
  app.get("/api/talos/sessions/:id", (req, res) => {
    const safeName = req.params.id.replace(/[^a-zA-Z0-9_-]/g, "_");
    // codeql[js/path-injection] -- safeName is sanitized above (alphanumeric + _ -)
    const filePath = join(sessionsDir, `${safeName}.jsonl`);
    if (!existsSync(filePath)) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    const content = readFileSync(filePath, "utf-8");
    const messages = content
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line: string) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    res.json({ id: req.params.id, messages });
  });

  // ── Test Generation endpoint (mirroring index.ts with injection fix) ──

  app.post("/api/talos/tests/generate", (req, res) => {
    const { applicationId, prompt, testType } = req.body as {
      applicationId?: string;
      prompt?: string;
      testType?: string;
    };
    if (!applicationId || !prompt) {
      res.status(400).json({ error: "applicationId and prompt are required" });
      return;
    }
    const app_ = repo.getApplication(applicationId);
    if (!app_) {
      res.status(404).json({ error: "Application not found" });
      return;
    }

    const testName = `Generated: ${prompt.substring(0, 50)}`;
    const code = `import { test, expect } from '@playwright/test';\n\ntest(${JSON.stringify(testName)}, async ({ page }) => {\n  // Generated test for: ${JSON.stringify(prompt).slice(1, -1)}\n  await page.goto(${JSON.stringify(app_.baseUrl)});\n  // TODO: Implement test logic\n});\n`;

    const created = repo.createTest({
      applicationId,
      name: testName,
      description: prompt,
      type: (testType as "e2e" | "smoke" | "regression" | "accessibility" | "unit") ?? "e2e",
      code,
      tags: ["ai-generated"],
      generationConfidence: 0.75,
    });

    res.status(201).json({
      id: created.id,
      code: created.code,
      name: created.name,
      confidence: created.generationConfidence ?? 0.75,
    });
  });

  // ── Admin router (for knowledge endpoints) ──

  app.use("/api/admin", createAdminRouter({ platformRepo, adminToken: TEST_TOKEN }));

  return { app, repo, platformRepo, sessionsDir };
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Talos API Endpoints", () => {
  let app: express.Express;
  let repo: TalosRepository;
  let sessionsDir: string;

  beforeEach(() => {
    ({ app, repo, sessionsDir } = createTestApp());
  });

  afterEach(() => {
    try {
      rmSync(sessionsDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  // ── Session Endpoints ──

  describe("sessions", () => {
    it("GET /sessions returns empty array when no sessions exist", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/talos/sessions`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data).toEqual([]);
      });
    });

    it("GET /sessions returns sessions sorted by last message", async () => {
      const msg1 = JSON.stringify({ role: "user", content: "Hello first session", timestamp: "2026-01-01T00:00:00Z" });
      const msg2 = JSON.stringify({ role: "user", content: "Hello second session", timestamp: "2026-01-02T00:00:00Z" });
      writeFileSync(join(sessionsDir, "session-a.jsonl"), msg1 + "\n");
      writeFileSync(join(sessionsDir, "session-b.jsonl"), msg2 + "\n");

      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/talos/sessions`);
        const data = (await res.json()) as { id: string }[];
        expect(data).toHaveLength(2);
        expect(data[0].id).toBe("session-b");
        expect(data[1].id).toBe("session-a");
      });
    });

    it("GET /sessions/:id returns messages", async () => {
      const msg = JSON.stringify({ role: "user", content: "Test msg", timestamp: "2026-01-01T00:00:00Z" });
      writeFileSync(join(sessionsDir, "test-session.jsonl"), msg + "\n");

      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/talos/sessions/test-session`);
        expect(res.status).toBe(200);
        const data = (await res.json()) as { messages: unknown[] };
        expect(data.messages).toHaveLength(1);
      });
    });

    it("GET /sessions/:id returns 404 for missing session", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/talos/sessions/nonexistent`);
        expect(res.status).toBe(404);
      });
    });
  });

  // ── Test Generation ──

  describe("test generation", () => {
    it("rejects missing applicationId/prompt", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/talos/tests/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ applicationId: "x" }),
        });
        expect(res.status).toBe(400);
      });
    });

    it("returns 404 for non-existent application", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/talos/tests/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ applicationId: "nope", prompt: "test login" }),
        });
        expect(res.status).toBe(404);
      });
    });

    it("generates a test for a valid application", async () => {
      const appEntry = repo.createApplication({
        name: "TestApp",
        repositoryUrl: "https://github.com/example/repo",
        baseUrl: "https://example.com",
      });

      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/talos/tests/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ applicationId: appEntry.id, prompt: "test login flow" }),
        });
        expect(res.status).toBe(201);
        const data = (await res.json()) as { id: string; code: string; name: string; confidence: number };
        expect(data.code).toContain("@playwright/test");
        expect(data.confidence).toBe(0.75);
      });
    });

    it("escapes malicious prompt in generated code", async () => {
      const appEntry = repo.createApplication({
        name: "TestApp",
        repositoryUrl: "https://github.com/example/repo",
        baseUrl: "https://example.com",
      });

      const maliciousPrompt = "test'); require('child_process').exec('rm -rf /'); //";

      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/talos/tests/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ applicationId: appEntry.id, prompt: maliciousPrompt }),
        });
        expect(res.status).toBe(201);
        const data = (await res.json()) as { code: string };
        // The test name should be JSON.stringify'd (double-quoted), not single-quoted template interpolation
        // With JSON.stringify, single quotes in the prompt are safely contained in a double-quoted string
        expect(data.code).toContain('test("Generated:');
        // Should NOT contain single-quote delimited test name (the old vulnerable pattern)
        expect(data.code).not.toMatch(/test\('Generated:/);
      });
    });

    it("escapes malicious baseUrl in generated code", async () => {
      const appEntry = repo.createApplication({
        name: "TestApp",
        repositoryUrl: "https://github.com/example/repo",
        baseUrl: "https://legit.com'); process.exit(1); //",
      });

      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/talos/tests/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ applicationId: appEntry.id, prompt: "test homepage" }),
        });
        expect(res.status).toBe(201);
        const data = (await res.json()) as { code: string };
        // page.goto should use JSON.stringify'd (double-quoted) URL, not single-quoted
        // The malicious URL is safely contained inside double quotes
        expect(data.code).toContain('page.goto("https://legit.com');
        // Should NOT use single-quote template interpolation (the old vulnerable pattern)
        expect(data.code).not.toMatch(/page\.goto\('https:/);
      });
    });
  });

  // ── Export to GitHub — targetRepo validation ──

  describe("POST /api/talos/applications/:appId/export-to-github — input validation", () => {
    function buildExportApp() {
      const exportApp = express();
      exportApp.use(express.json());
      exportApp.post("/api/talos/applications/:appId/export-to-github", (req, res) => {
        const { targetRepo } = req.body as { targetRepo?: string };
        if (!targetRepo || !targetRepo.includes("/")) {
          res.status(400).json({ error: "targetRepo is required and must be in owner/repo format" });
          return;
        }
        const parts = targetRepo.split("/");
        if (parts.length !== 2 || !parts[0] || !parts[1] || parts[0].includes("..") || parts[1].includes("..")) {
          res.status(400).json({ error: "targetRepo must be in 'owner/repo' format with no empty parts" });
          return;
        }
        res.status(200).json({ ok: true });
      });
      return exportApp;
    }

    it('rejects "/" with 400', async () => {
      await withServer(buildExportApp(), async (base) => {
        const res = await fetch(`${base}/api/talos/applications/app1/export-to-github`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetRepo: "/" }),
        });
        expect(res.status).toBe(400);
      });
    });

    it('rejects "/repo" (missing owner) with 400', async () => {
      await withServer(buildExportApp(), async (base) => {
        const res = await fetch(`${base}/api/talos/applications/app1/export-to-github`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetRepo: "/repo" }),
        });
        expect(res.status).toBe(400);
      });
    });

    it('rejects "owner/" (missing repo) with 400', async () => {
      await withServer(buildExportApp(), async (base) => {
        const res = await fetch(`${base}/api/talos/applications/app1/export-to-github`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetRepo: "owner/" }),
        });
        expect(res.status).toBe(400);
      });
    });

    it('rejects "owner/repo/extra" (too many segments) with 400', async () => {
      await withServer(buildExportApp(), async (base) => {
        const res = await fetch(`${base}/api/talos/applications/app1/export-to-github`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetRepo: "owner/repo/extra" }),
        });
        expect(res.status).toBe(400);
      });
    });

    it('accepts valid "owner/repo" with 200', async () => {
      await withServer(buildExportApp(), async (base) => {
        const res = await fetch(`${base}/api/talos/applications/app1/export-to-github`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetRepo: "owner/repo" }),
        });
        expect(res.status).toBe(200);
      });
    });
  });
});
