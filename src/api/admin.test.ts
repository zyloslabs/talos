/**
 * Admin API Router unit tests.
 */

import { describe, it, expect, beforeEach } from "vitest";
import express from "express";
import Database from "better-sqlite3";
import { PlatformRepository } from "../platform/repository.js";
import { createAdminRouter } from "./admin.js";

const TEST_TOKEN = "test-admin-token-xyz";
const authHeaders = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${TEST_TOKEN}`,
};

function createTestApp() {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const platformRepo = new PlatformRepository(db);
  platformRepo.migrate();
  const app = express();
  app.use(express.json());
  app.use("/api/admin", createAdminRouter({ platformRepo, adminToken: TEST_TOKEN }));
  return { app, platformRepo, db };
}

// Simple supertest-like helper using native fetch against an in-process server
async function withServer(app: express.Express, fn: (baseUrl: string) => Promise<void>) {
  const { createServer } = await import("node:http");
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  }
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return res.json() as Promise<Record<string, unknown>>;
}

describe("Admin API", () => {
  let app: express.Express;

  beforeEach(() => {
    ({ app } = createTestApp());
  });

  // ── Auth Middleware ──

  describe("auth middleware", () => {
    it("returns 401 when no token provided", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/personality`);
        expect(res.status).toBe(401);
      });
    });

    it("returns 401 with invalid token", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/personality`, {
          headers: { Authorization: "Bearer wrong-token" },
        });
        expect(res.status).toBe(401);
      });
    });

    it("allows access with valid token", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/personality`, {
          headers: { Authorization: `Bearer ${TEST_TOKEN}` },
        });
        expect(res.status).toBe(200);
      });
    });
  });

  // ── Personality ──

  describe("GET /api/admin/personality", () => {
    it("returns default personality", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/personality`, { headers: authHeaders });
        const data = await json(res);
        expect(data.personalities).toHaveLength(1);
        expect(data.activeId).toBeTruthy();
      });
    });
  });

  describe("POST /api/admin/personality", () => {
    it("creates a new personality", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/personality`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ name: "Snarky", systemPrompt: "Be snarky." }),
        });
        expect(res.status).toBe(201);
        const data = await json(res);
        expect(data.name).toBe("Snarky");
      });
    });

    it("rejects missing name", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/personality`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ systemPrompt: "No name" }),
        });
        expect(res.status).toBe(400);
      });
    });
  });

  // ── Prompts ──

  describe("prompts CRUD", () => {
    it("creates, reads, updates, deletes prompts", async () => {
      await withServer(app, async (base) => {
        const createRes = await fetch(`${base}/api/admin/prompts`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ name: "Test", content: "Do test things" }),
        });
        expect(createRes.status).toBe(201);
        const prompt = await json(createRes);
        expect(prompt.name).toBe("Test");

        const getRes = await fetch(`${base}/api/admin/prompts/${prompt.id as string}`, { headers: authHeaders });
        expect(getRes.status).toBe(200);

        const updateRes = await fetch(`${base}/api/admin/prompts/${prompt.id as string}`, {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify({ name: "Updated" }),
        });
        expect(updateRes.status).toBe(200);
        const updated = await json(updateRes);
        expect(updated.name).toBe("Updated");

        const delRes = await fetch(`${base}/api/admin/prompts/${prompt.id as string}`, { method: "DELETE", headers: authHeaders });
        expect(delRes.status).toBe(204);
      });
    });

    it("returns 404 for non-existent prompt", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/prompts/nonexistent`, { headers: authHeaders });
        expect(res.status).toBe(404);
      });
    });
  });

  // ── Scheduled Jobs ──

  describe("scheduler jobs CRUD", () => {
    it("creates and lists jobs", async () => {
      await withServer(app, async (base) => {
        const createRes = await fetch(`${base}/api/admin/scheduler/jobs`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ name: "Nightly", cronExpression: "0 0 * * *", prompt: "Run tests" }),
        });
        expect(createRes.status).toBe(201);

        const listRes = await fetch(`${base}/api/admin/scheduler/jobs`, { headers: authHeaders });
        const jobs = await listRes.json() as unknown[];
        expect(jobs.length).toBe(1);
      });
    });

    it("returns 400 when missing required fields", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/scheduler/jobs`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ name: "Nightly" }),
        });
        expect(res.status).toBe(400);
      });
    });
  });

  // ── Tasks ──

  describe("tasks CRUD", () => {
    it("creates and lists tasks", async () => {
      await withServer(app, async (base) => {
        const createRes = await fetch(`${base}/api/admin/tasks`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ prompt: "Generate tests for login" }),
        });
        expect(createRes.status).toBe(201);

        const listRes = await fetch(`${base}/api/admin/tasks`, { headers: authHeaders });
        const tasks = await listRes.json() as unknown[];
        expect(tasks.length).toBe(1);
      });
    });

    it("gets task stats", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/tasks/stats`, { headers: authHeaders });
        const stats = await json(res);
        expect(stats).toHaveProperty("pending");
        expect(stats).toHaveProperty("running");
      });
    });

    it("returns 400 for invalid status filter", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/tasks?status=bogus`, { headers: authHeaders });
        expect(res.status).toBe(400);
      });
    });

    it("clamps limit to valid range", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/tasks?limit=-5`, { headers: authHeaders });
        expect(res.status).toBe(200);
      });
    });
  });

  // ── MCP Servers ──

  describe("mcp servers CRUD", () => {
    it("creates, reads, updates, deletes servers", async () => {
      await withServer(app, async (base) => {
        const createRes = await fetch(`${base}/api/admin/mcp-servers`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ name: "GitHub", type: "stdio", command: "npx", args: ["-y", "@mcp/github"] }),
        });
        expect(createRes.status).toBe(201);
        const server = await json(createRes);

        const updateRes = await fetch(`${base}/api/admin/mcp-servers/${server.id as string}`, {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify({ enabled: false }),
        });
        expect(updateRes.status).toBe(200);

        const delRes = await fetch(`${base}/api/admin/mcp-servers/${server.id as string}`, { method: "DELETE", headers: authHeaders });
        expect(delRes.status).toBe(204);
      });
    });

    it("rejects SSRF-prone URLs on create", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/mcp-servers`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ name: "Evil", type: "http", url: "http://127.0.0.1:8080/steal" }),
        });
        expect(res.status).toBe(400);
      });
    });

    it("rejects SSRF-prone URLs on update", async () => {
      await withServer(app, async (base) => {
        const createRes = await fetch(`${base}/api/admin/mcp-servers`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ name: "Good", type: "stdio", command: "npx" }),
        });
        const server = await json(createRes);

        const updateRes = await fetch(`${base}/api/admin/mcp-servers/${server.id as string}`, {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify({ url: "http://192.168.1.1/internal" }),
        });
        expect(updateRes.status).toBe(400);
      });
    });
  });

  // ── Skills ──

  describe("skills CRUD", () => {
    it("creates, reads, updates, deletes skills", async () => {
      await withServer(app, async (base) => {
        const createRes = await fetch(`${base}/api/admin/skills`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ name: "Code Review", content: "# Code Review\nReview code." }),
        });
        expect(createRes.status).toBe(201);
        const skill = await json(createRes);

        const getRes = await fetch(`${base}/api/admin/skills/${skill.id as string}`, { headers: authHeaders });
        expect(getRes.status).toBe(200);

        const delRes = await fetch(`${base}/api/admin/skills/${skill.id as string}`, { method: "DELETE", headers: authHeaders });
        expect(delRes.status).toBe(204);
      });
    });

    it("returns 404 for non-existent skill", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/skills/nonexistent`, { headers: authHeaders });
        expect(res.status).toBe(404);
      });
    });
  });

  // ── Auth ──

  describe("auth status", () => {
    it("returns unauthenticated when no copilot", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/auth/status`, { headers: authHeaders });
        const data = await json(res);
        expect(data.authenticated).toBe(false);
      });
    });
  });

  // ── Models ──

  describe("models", () => {
    it("returns defaults when no copilot", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/models`, { headers: authHeaders });
        const data = await json(res);
        expect(data.models).toEqual([]);
        expect(data.selected).toBe("gpt-4.1");
      });
    });
  });

  // ── Knowledge Base ──

  describe("knowledge endpoints", () => {
    it("GET /knowledge/stats returns document and chunk counts", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/knowledge/stats`, { headers: authHeaders });
        expect(res.status).toBe(200);
        const data = await json(res);
        expect(data).toHaveProperty("documentCount");
        expect(data).toHaveProperty("chunkCount");
        expect(data).toHaveProperty("lastIndexedAt");
      });
    });

    it("GET /knowledge/documents returns array", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/knowledge/documents`, { headers: authHeaders });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(Array.isArray(data)).toBe(true);
      });
    });

    it("POST /knowledge/search requires query", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/knowledge/search`, {
          method: "POST", headers: authHeaders, body: JSON.stringify({}),
        });
        expect(res.status).toBe(400);
      });
    });

    it("POST /knowledge/search returns results for valid query", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/knowledge/search`, {
          method: "POST", headers: authHeaders, body: JSON.stringify({ query: "login flow" }),
        });
        expect(res.status).toBe(200);
        const data = await json(res);
        expect(data).toHaveProperty("results");
      });
    });

    it("GET /knowledge/config returns default config", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/knowledge/config`, { headers: authHeaders });
        expect(res.status).toBe(200);
        const data = await json(res);
        expect(data).toHaveProperty("vectorDbPath");
        expect(data).toHaveProperty("collectionName");
        expect(data).toHaveProperty("searchMode");
        expect(data).toHaveProperty("minScore");
      });
    });

    it("PUT /knowledge/config updates with valid data", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/knowledge/config`, {
          method: "PUT", headers: authHeaders, body: JSON.stringify({ minScore: 0.7 }),
        });
        expect(res.status).toBe(200);
        const data = await json(res);
        expect(data.minScore).toBe(0.7);
      });
    });

    it("PUT /knowledge/config rejects invalid searchMode", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/knowledge/config`, {
          method: "PUT", headers: authHeaders, body: JSON.stringify({ searchMode: "invalid" }),
        });
        expect(res.status).toBe(400);
        const data = await json(res);
        expect(data.error).toBe("Invalid knowledge config");
      });
    });

    it("PUT /knowledge/config rejects minScore out of range", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/knowledge/config`, {
          method: "PUT", headers: authHeaders, body: JSON.stringify({ minScore: 5 }),
        });
        expect(res.status).toBe(400);
      });
    });

    it("PUT /knowledge/config rejects unknown fields", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/knowledge/config`, {
          method: "PUT", headers: authHeaders, body: JSON.stringify({ unknownField: "bad" }),
        });
        expect(res.status).toBe(400);
      });
    });

    it("DELETE /knowledge/documents/:docId returns 404 for non-existent doc", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/knowledge/documents/nonexistent`, {
          method: "DELETE", headers: authHeaders,
        });
        expect(res.status).toBe(404);
      });
    });
  });
});
