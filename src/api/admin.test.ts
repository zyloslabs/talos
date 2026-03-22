/**
 * Admin API Router unit tests.
 */

import { describe, it, expect, beforeEach } from "vitest";
import express from "express";
import Database from "better-sqlite3";
import { PlatformRepository } from "../platform/repository.js";
import { createAdminRouter } from "./admin.js";

function createTestApp() {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const platformRepo = new PlatformRepository(db);
  platformRepo.migrate();
  const app = express();
  app.use(express.json());
  app.use("/api/admin", createAdminRouter({ platformRepo }));
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

  // ── Personality ──

  describe("GET /api/admin/personality", () => {
    it("returns default personality", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/personality`);
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
          headers: { "Content-Type": "application/json" },
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
          headers: { "Content-Type": "application/json" },
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
        // Create
        const createRes = await fetch(`${base}/api/admin/prompts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Test", content: "Do test things" }),
        });
        expect(createRes.status).toBe(201);
        const prompt = await json(createRes);
        expect(prompt.name).toBe("Test");

        // Read
        const getRes = await fetch(`${base}/api/admin/prompts/${prompt.id as string}`);
        expect(getRes.status).toBe(200);

        // Update
        const updateRes = await fetch(`${base}/api/admin/prompts/${prompt.id as string}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Updated" }),
        });
        expect(updateRes.status).toBe(200);
        const updated = await json(updateRes);
        expect(updated.name).toBe("Updated");

        // Delete
        const delRes = await fetch(`${base}/api/admin/prompts/${prompt.id as string}`, { method: "DELETE" });
        expect(delRes.status).toBe(204);
      });
    });
  });

  // ── Scheduled Jobs ──

  describe("scheduler jobs CRUD", () => {
    it("creates and lists jobs", async () => {
      await withServer(app, async (base) => {
        const createRes = await fetch(`${base}/api/admin/scheduler/jobs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Nightly", cronExpression: "0 0 * * *", prompt: "Run tests" }),
        });
        expect(createRes.status).toBe(201);

        const listRes = await fetch(`${base}/api/admin/scheduler/jobs`);
        const jobs = await listRes.json() as unknown[];
        expect(jobs.length).toBe(1);
      });
    });
  });

  // ── Tasks ──

  describe("tasks CRUD", () => {
    it("creates and lists tasks", async () => {
      await withServer(app, async (base) => {
        const createRes = await fetch(`${base}/api/admin/tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: "Generate tests for login" }),
        });
        expect(createRes.status).toBe(201);

        const listRes = await fetch(`${base}/api/admin/tasks`);
        const tasks = await listRes.json() as unknown[];
        expect(tasks.length).toBe(1);
      });
    });

    it("gets task stats", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/tasks/stats`);
        const stats = await json(res);
        expect(stats).toHaveProperty("pending");
        expect(stats).toHaveProperty("running");
      });
    });
  });

  // ── MCP Servers ──

  describe("mcp servers CRUD", () => {
    it("creates, reads, updates, deletes servers", async () => {
      await withServer(app, async (base) => {
        const createRes = await fetch(`${base}/api/admin/mcp-servers`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "GitHub", type: "stdio", command: "npx", args: ["-y", "@mcp/github"] }),
        });
        expect(createRes.status).toBe(201);
        const server = await json(createRes);

        const updateRes = await fetch(`${base}/api/admin/mcp-servers/${server.id as string}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: false }),
        });
        expect(updateRes.status).toBe(200);

        const delRes = await fetch(`${base}/api/admin/mcp-servers/${server.id as string}`, { method: "DELETE" });
        expect(delRes.status).toBe(204);
      });
    });
  });

  // ── Skills ──

  describe("skills CRUD", () => {
    it("creates, reads, updates, deletes skills", async () => {
      await withServer(app, async (base) => {
        const createRes = await fetch(`${base}/api/admin/skills`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Code Review", content: "# Code Review\nReview code." }),
        });
        expect(createRes.status).toBe(201);
        const skill = await json(createRes);

        const getRes = await fetch(`${base}/api/admin/skills/${skill.id as string}`);
        expect(getRes.status).toBe(200);

        const delRes = await fetch(`${base}/api/admin/skills/${skill.id as string}`, { method: "DELETE" });
        expect(delRes.status).toBe(204);
      });
    });
  });

  // ── Auth ──

  describe("auth status", () => {
    it("returns unauthenticated when no copilot", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/auth/status`);
        const data = await json(res);
        expect(data.authenticated).toBe(false);
      });
    });
  });

  // ── Models ──

  describe("models", () => {
    it("returns defaults when no copilot", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/models`);
        const data = await json(res);
        expect(data.models).toEqual([]);
        expect(data.selected).toBe("gpt-4.1");
      });
    });
  });
});
