/**
 * Admin API Router unit tests.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { EnvManager } from "../platform/env-manager.js";
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
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function json(res: Response): Promise<any> {
  return res.json();
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

        const delRes = await fetch(`${base}/api/admin/prompts/${prompt.id as string}`, {
          method: "DELETE",
          headers: authHeaders,
        });
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
        const jobs = await json(listRes);
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
        const tasks = await json(listRes);
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

        const delRes = await fetch(`${base}/api/admin/mcp-servers/${server.id as string}`, {
          method: "DELETE",
          headers: authHeaders,
        });
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

        const delRes = await fetch(`${base}/api/admin/skills/${skill.id as string}`, {
          method: "DELETE",
          headers: authHeaders,
        });
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

  // ── Auth Test ──

  describe("auth test", () => {
    it("returns 503 when copilot not configured", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/auth/test`, { headers: authHeaders });
        expect(res.status).toBe(503);
      });
    });
  });

  // ── AI Enhance ──

  describe("ai enhance", () => {
    it("returns 503 when copilot not configured", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/ai/enhance`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ text: "Hello world" }),
        });
        expect(res.status).toBe(503);
      });
    });

    it("returns 503 for empty text when copilot not configured", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/ai/enhance`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ text: "" }),
        });
        // Copilot check runs before validation, so 503 is expected
        expect(res.status).toBe(503);
      });
    });
  });

  // ── Agents ──

  describe("agents", () => {
    it("lists agents (initially empty)", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/agents`, { headers: authHeaders });
        expect(res.status).toBe(200);
        const data = await json(res);
        expect(data).toEqual([]);
      });
    });

    it("creates an agent", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/agents`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ name: "Test Agent", description: "A test agent", systemPrompt: "Be helpful" }),
        });
        expect(res.status).toBe(201);
        const data = await json(res);
        expect(data.name).toBe("Test Agent");
        expect(data.description).toBe("A test agent");
        expect(data.systemPrompt).toBe("Be helpful");
        expect(data.enabled).toBe(true);
        expect(data.toolsWhitelist).toEqual([]);
      });
    });

    it("returns 400 for agent without name", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/agents`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ description: "No name" }),
        });
        expect(res.status).toBe(400);
      });
    });

    it("gets a single agent", async () => {
      await withServer(app, async (base) => {
        const createRes = await fetch(`${base}/api/admin/agents`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ name: "Fetch Me" }),
        });
        const created = await json(createRes);

        const res = await fetch(`${base}/api/admin/agents/${created.id}`, { headers: authHeaders });
        expect(res.status).toBe(200);
        const data = await json(res);
        expect(data.name).toBe("Fetch Me");
      });
    });

    it("returns 404 for nonexistent agent", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/agents/nonexistent`, { headers: authHeaders });
        expect(res.status).toBe(404);
      });
    });

    it("updates an agent", async () => {
      await withServer(app, async (base) => {
        const createRes = await fetch(`${base}/api/admin/agents`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ name: "Original" }),
        });
        const created = await json(createRes);

        const res = await fetch(`${base}/api/admin/agents/${created.id}`, {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify({ name: "Updated", toolsWhitelist: ["web-search"] }),
        });
        expect(res.status).toBe(200);
        const data = await json(res);
        expect(data.name).toBe("Updated");
        expect(data.toolsWhitelist).toEqual(["web-search"]);
      });
    });

    it("deletes an agent", async () => {
      await withServer(app, async (base) => {
        const createRes = await fetch(`${base}/api/admin/agents`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ name: "Delete Me" }),
        });
        const created = await json(createRes);

        const res = await fetch(`${base}/api/admin/agents/${created.id}`, {
          method: "DELETE",
          headers: authHeaders,
        });
        expect(res.status).toBe(204);

        const getRes = await fetch(`${base}/api/admin/agents/${created.id}`, { headers: authHeaders });
        expect(getRes.status).toBe(404);
      });
    });

    it("returns 404 when deleting nonexistent agent", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/agents/nonexistent`, {
          method: "DELETE",
          headers: authHeaders,
        });
        expect(res.status).toBe(404);
      });
    });

    it("returns 409 for duplicate agent name", async () => {
      await withServer(app, async (base) => {
        await fetch(`${base}/api/admin/agents`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ name: "Duplicate", description: "first" }),
        });
        const res = await fetch(`${base}/api/admin/agents`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ name: "Duplicate", description: "second" }),
        });
        expect(res.status).toBe(409);
        const data = await json(res);
        expect(data.error).toContain("already exists");
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
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({}),
        });
        expect(res.status).toBe(400);
      });
    });

    it("POST /knowledge/search returns results for valid query", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/knowledge/search`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ query: "login flow" }),
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
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify({ minScore: 0.7 }),
        });
        expect(res.status).toBe(200);
        const data = await json(res);
        expect(data.minScore).toBe(0.7);
      });
    });

    it("PUT /knowledge/config rejects invalid searchMode", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/knowledge/config`, {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify({ searchMode: "invalid" }),
        });
        expect(res.status).toBe(400);
        const data = await json(res);
        expect(data.error).toBe("Invalid knowledge config");
      });
    });

    it("PUT /knowledge/config rejects minScore out of range", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/knowledge/config`, {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify({ minScore: 5 }),
        });
        expect(res.status).toBe(400);
      });
    });

    it("PUT /knowledge/config rejects unknown fields", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/knowledge/config`, {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify({ unknownField: "bad" }),
        });
        expect(res.status).toBe(400);
      });
    });

    it("DELETE /knowledge/documents/:docId returns 404 for non-existent doc", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/knowledge/documents/nonexistent`, {
          method: "DELETE",
          headers: authHeaders,
        });
        expect(res.status).toBe(404);
      });
    });
  });

  // ── Agent Skills API ──

  describe("agent skills API", () => {
    it("gets and sets agent skills", async () => {
      await withServer(app, async (base) => {
        // Create an agent
        const agentRes = await fetch(`${base}/api/admin/agents`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ name: "Skill Agent" }),
        });
        const agent = await json(agentRes);

        // Create a skill
        const skillRes = await fetch(`${base}/api/admin/skills`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ name: "S1", content: "c1" }),
        });
        const skill = await json(skillRes);

        // Set skills
        const setRes = await fetch(`${base}/api/admin/agents/${agent.id}/skills`, {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify({ skillIds: [skill.id] }),
        });
        expect(setRes.status).toBe(200);

        // Get skills
        const getRes = await fetch(`${base}/api/admin/agents/${agent.id}/skills`, { headers: authHeaders });
        expect(getRes.status).toBe(200);
        const skills = await json(getRes);
        expect(skills.length).toBe(1);
        expect(skills[0].name).toBe("S1");
      });
    });

    it("returns 400 for invalid skills body", async () => {
      await withServer(app, async (base) => {
        const agentRes = await fetch(`${base}/api/admin/agents`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ name: "Validate Agent" }),
        });
        const agent = await json(agentRes);

        const res = await fetch(`${base}/api/admin/agents/${agent.id}/skills`, {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify({ skillIds: "not-an-array" }),
        });
        expect(res.status).toBe(400);
      });
    });

    it("rejects extra fields in skills body (strict)", async () => {
      await withServer(app, async (base) => {
        const agentRes = await fetch(`${base}/api/admin/agents`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ name: "Strict Agent" }),
        });
        const agent = await json(agentRes);

        const res = await fetch(`${base}/api/admin/agents/${agent.id}/skills`, {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify({ skillIds: [], extraField: true }),
        });
        expect(res.status).toBe(400);
      });
    });
  });

  // ── Skills with requiredTools ──

  describe("skills with requiredTools", () => {
    it("creates skill with requiredTools", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/skills`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ name: "ToolSkill", content: "c", requiredTools: ["shell-execute"] }),
        });
        expect(res.status).toBe(201);
        const data = await json(res);
        expect(data.requiredTools).toEqual(["shell-execute"]);
      });
    });

    it("skill detail includes agents list", async () => {
      await withServer(app, async (base) => {
        // Create a skill
        const skillRes = await fetch(`${base}/api/admin/skills`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ name: "SharedSkill", content: "c" }),
        });
        const skill = await json(skillRes);

        // Get skill detail
        const res = await fetch(`${base}/api/admin/skills/${skill.id}`, { headers: authHeaders });
        const data = await json(res);
        expect(data.agents).toEqual([]);
      });
    });
  });

  // ── Env Routes ──

  describe("env routes", () => {
    let tempDir: string;
    let envApp: express.Express;

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), "talos-admin-env-test-"));
      const envPath = join(tempDir, ".env");
      const envManager = new EnvManager(envPath);
      const db = new Database(":memory:");
      db.pragma("journal_mode = WAL");
      db.pragma("foreign_keys = ON");
      const platformRepo = new PlatformRepository(db);
      platformRepo.migrate();
      envApp = express();
      envApp.use(express.json());
      envApp.use("/api/admin", createAdminRouter({ platformRepo, adminToken: TEST_TOKEN, envManager }));
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it("GET /env returns 503 when envManager not configured", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/env`, { headers: authHeaders });
        expect(res.status).toBe(503);
      });
    });

    it("GET /env returns entries with warnings when GITHUB_CLIENT_ID missing", async () => {
      await withServer(envApp, async (base) => {
        const res = await fetch(`${base}/api/admin/env`, { headers: authHeaders });
        expect(res.status).toBe(200);
        const data = await json(res);
        expect(data).toHaveProperty("entries");
        expect(data.warnings).toBeDefined();
      });
    });

    it("GET /env returns no warnings when required vars are present", async () => {
      await withServer(envApp, async (base) => {
        // Set GITHUB_CLIENT_ID so validation passes
        await fetch(`${base}/api/admin/env`, {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify({ key: "GITHUB_CLIENT_ID", value: "test-client-id" }),
        });
        const res = await fetch(`${base}/api/admin/env`, { headers: authHeaders });
        expect(res.status).toBe(200);
        const data = await json(res);
        expect(data.warnings).toBeUndefined();
      });
    });

    it("GET /env/:key returns 503 when envManager not configured", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/env/FOO_VAR`, { headers: authHeaders });
        expect(res.status).toBe(503);
      });
    });

    it("GET /env/:key returns 404 for missing key", async () => {
      await withServer(envApp, async (base) => {
        const res = await fetch(`${base}/api/admin/env/NONEXISTENT_KEY`, { headers: authHeaders });
        expect(res.status).toBe(404);
      });
    });

    it("GET /env/:key returns value for existing key", async () => {
      await withServer(envApp, async (base) => {
        await fetch(`${base}/api/admin/env`, {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify({ key: "MY_APP_VAR", value: "hello" }),
        });
        const res = await fetch(`${base}/api/admin/env/MY_APP_VAR`, { headers: authHeaders });
        expect(res.status).toBe(200);
        const data = await json(res);
        expect(data.key).toBe("MY_APP_VAR");
      });
    });

    it("PUT /env returns 503 when envManager not configured", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/env`, {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify({ key: "FOO", value: "bar" }),
        });
        expect(res.status).toBe(503);
      });
    });

    it("PUT /env returns 400 when value missing", async () => {
      await withServer(envApp, async (base) => {
        const res = await fetch(`${base}/api/admin/env`, {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify({ key: "FOO_VAR" }),
        });
        expect(res.status).toBe(400);
      });
    });

    it("PUT /env sets a key successfully", async () => {
      await withServer(envApp, async (base) => {
        const res = await fetch(`${base}/api/admin/env`, {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify({ key: "MY_APP_SETTING", value: "testval" }),
        });
        expect(res.status).toBe(200);
        const data = await json(res);
        expect(data.key).toBe("MY_APP_SETTING");
      });
    });

    it("PUT /env returns 400 for dangerous key (EnvValidationError)", async () => {
      await withServer(envApp, async (base) => {
        const res = await fetch(`${base}/api/admin/env`, {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify({ key: "PATH", value: "/usr/bin" }),
        });
        expect(res.status).toBe(400);
      });
    });

    it("DELETE /env/:key returns 503 when envManager not configured", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/env/SOME_KEY`, {
          method: "DELETE",
          headers: authHeaders,
        });
        expect(res.status).toBe(503);
      });
    });

    it("DELETE /env/:key returns 404 for missing key", async () => {
      await withServer(envApp, async (base) => {
        const res = await fetch(`${base}/api/admin/env/NONEXISTENT_KEY`, {
          method: "DELETE",
          headers: authHeaders,
        });
        expect(res.status).toBe(404);
      });
    });

    it("DELETE /env/:key deletes successfully", async () => {
      await withServer(envApp, async (base) => {
        await fetch(`${base}/api/admin/env`, {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify({ key: "DEL_ME_VAR", value: "bye" }),
        });
        const res = await fetch(`${base}/api/admin/env/DEL_ME_VAR`, {
          method: "DELETE",
          headers: authHeaders,
        });
        expect(res.status).toBe(204);
      });
    });

    it("GET /env/validate/required returns 503 when envManager not configured", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/env/validate/required`, { headers: authHeaders });
        expect(res.status).toBe(503);
      });
    });

    it("GET /env/validate/required returns valid and missing keys", async () => {
      await withServer(envApp, async (base) => {
        const res = await fetch(`${base}/api/admin/env/validate/required`, { headers: authHeaders });
        expect(res.status).toBe(200);
        const data = await json(res);
        expect(data).toHaveProperty("valid");
        expect(data).toHaveProperty("missing");
      });
    });
  });

  // ── Models additional endpoints ──

  describe("models additional endpoints", () => {
    it("PUT /models/selected returns 400 when model missing", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/models/selected`, {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify({}),
        });
        expect(res.status).toBe(400);
      });
    });

    it("PUT /models/selected sets model when provided", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/models/selected`, {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify({ model: "gpt-4o" }),
        });
        expect(res.status).toBe(200);
        const data = await json(res);
        expect(data.selected).toBe("gpt-4o");
      });
    });

    it("PUT /models/reasoning-effort sets effort", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/models/reasoning-effort`, {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify({ effort: "high" }),
        });
        expect(res.status).toBe(200);
        const data = await json(res);
        expect(data.reasoningEffort).toBe("high");
      });
    });

    it("PUT /models/provider returns 400 for invalid provider type", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/models/provider`, {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify({ provider: { type: "invalid-type" } }),
        });
        expect(res.status).toBe(400);
      });
    });

    it("PUT /models/provider accepts valid provider type", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/models/provider`, {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify({ provider: { type: "openai", apiKey: "sk-test" } }),
        });
        expect(res.status).toBe(200);
      });
    });

    it("PUT /models/provider accepts empty body (no provider)", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/models/provider`, {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify({}),
        });
        expect(res.status).toBe(200);
      });
    });

    it("PUT /models/provider returns 400 when provider type is absent", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/models/provider`, {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify({ provider: { baseUrl: "http://localhost:11434" } }),
        });
        expect(res.status).toBe(400);
      });
    });

    it("GET /models/health returns healthy false without copilot", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/models/health`, { headers: authHeaders });
        expect(res.status).toBe(200);
        const data = await json(res);
        expect(data.healthy).toBe(false);
        expect(data.authenticated).toBe(false);
      });
    });
  });

  // ── Personality update/activate ──

  describe("personality update and activate", () => {
    it("PUT /personality/:id updates systemPrompt", async () => {
      await withServer(app, async (base) => {
        const createRes = await fetch(`${base}/api/admin/personality`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ name: "Original", systemPrompt: "Be helpful" }),
        });
        const p = await json(createRes);
        const res = await fetch(`${base}/api/admin/personality/${p.id as string}`, {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify({ systemPrompt: "Be very helpful" }),
        });
        expect(res.status).toBe(200);
        const updated = await json(res);
        expect(updated.systemPrompt).toBe("Be very helpful");
      });
    });

    it("PUT /personality/:id returns 400 when systemPrompt missing", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/personality/someid`, {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify({}),
        });
        expect(res.status).toBe(400);
      });
    });

    it("PUT /personality/:id returns 404 for nonexistent id", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/personality/nonexistent`, {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify({ systemPrompt: "Test" }),
        });
        expect(res.status).toBe(404);
      });
    });

    it("PUT /personality/:id/activate sets active personality", async () => {
      await withServer(app, async (base) => {
        const createRes = await fetch(`${base}/api/admin/personality`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ name: "ActiveTest", systemPrompt: "Test prompt" }),
        });
        const p = await json(createRes);
        const res = await fetch(`${base}/api/admin/personality/${p.id as string}/activate`, {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify({}),
        });
        expect(res.status).toBe(200);
        const data = await json(res);
        expect(data.activeId).toBe(p.id as string);
      });
    });
  });

  // ── Scheduler additional ──

  describe("scheduler additional endpoints", () => {
    it("GET /scheduler/jobs/:id returns job", async () => {
      await withServer(app, async (base) => {
        const createRes = await fetch(`${base}/api/admin/scheduler/jobs`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ name: "Fetch Me", cronExpression: "0 0 * * *", prompt: "Do work" }),
        });
        const created = await json(createRes);
        const res = await fetch(`${base}/api/admin/scheduler/jobs/${created.id as string}`, { headers: authHeaders });
        expect(res.status).toBe(200);
        const data = await json(res);
        expect(data.name).toBe("Fetch Me");
      });
    });

    it("GET /scheduler/jobs/:id returns 404 for nonexistent", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/scheduler/jobs/nonexistent`, { headers: authHeaders });
        expect(res.status).toBe(404);
      });
    });

    it("PUT /scheduler/jobs/:id updates job", async () => {
      await withServer(app, async (base) => {
        const createRes = await fetch(`${base}/api/admin/scheduler/jobs`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ name: "Update Me", cronExpression: "0 0 * * *", prompt: "Original" }),
        });
        const created = await json(createRes);
        const res = await fetch(`${base}/api/admin/scheduler/jobs/${created.id as string}`, {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify({ enabled: false }),
        });
        expect(res.status).toBe(200);
        const data = await json(res);
        expect(data.enabled).toBe(false);
      });
    });

    it("PUT /scheduler/jobs/:id returns 404 for nonexistent", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/scheduler/jobs/nonexistent`, {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify({ enabled: false }),
        });
        expect(res.status).toBe(404);
      });
    });

    it("DELETE /scheduler/jobs/:id deletes job", async () => {
      await withServer(app, async (base) => {
        const createRes = await fetch(`${base}/api/admin/scheduler/jobs`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ name: "Delete Me", cronExpression: "0 0 * * *", prompt: "Work" }),
        });
        const created = await json(createRes);
        const res = await fetch(`${base}/api/admin/scheduler/jobs/${created.id as string}`, {
          method: "DELETE",
          headers: authHeaders,
        });
        expect(res.status).toBe(204);
      });
    });

    it("DELETE /scheduler/jobs/:id returns 404 for nonexistent", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/scheduler/jobs/nonexistent`, {
          method: "DELETE",
          headers: authHeaders,
        });
        expect(res.status).toBe(404);
      });
    });
  });

  // ── Tasks additional ──

  describe("tasks additional endpoints", () => {
    it("GET /tasks/:id returns task", async () => {
      await withServer(app, async (base) => {
        const createRes = await fetch(`${base}/api/admin/tasks`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ prompt: "Find the task" }),
        });
        const created = await json(createRes);
        const res = await fetch(`${base}/api/admin/tasks/${created.id as string}`, { headers: authHeaders });
        expect(res.status).toBe(200);
        const data = await json(res);
        expect(data.prompt).toBe("Find the task");
      });
    });

    it("GET /tasks/:id returns 404 for nonexistent", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/tasks/nonexistent`, { headers: authHeaders });
        expect(res.status).toBe(404);
      });
    });

    it("GET /tasks with valid status filter", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/tasks?status=pending`, { headers: authHeaders });
        expect(res.status).toBe(200);
        const data = await json(res);
        expect(Array.isArray(data)).toBe(true);
      });
    });

    it("POST /tasks returns 400 when prompt missing", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/tasks`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({}),
        });
        expect(res.status).toBe(400);
      });
    });

    it("POST /tasks creates task with parentId", async () => {
      await withServer(app, async (base) => {
        const parentRes = await fetch(`${base}/api/admin/tasks`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ prompt: "Parent task" }),
        });
        const parent = await json(parentRes);
        const res = await fetch(`${base}/api/admin/tasks`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ prompt: "Child task", parentId: parent.id as string }),
        });
        expect(res.status).toBe(201);
        const child = await json(res);
        expect(child.parentId).toBe(parent.id as string);
      });
    });

    it("PUT /tasks/:id/status updates task status", async () => {
      await withServer(app, async (base) => {
        const createRes = await fetch(`${base}/api/admin/tasks`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ prompt: "Status update task" }),
        });
        const created = await json(createRes);
        const res = await fetch(`${base}/api/admin/tasks/${created.id as string}/status`, {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify({ status: "completed", result: "All done" }),
        });
        expect(res.status).toBe(200);
        const data = await json(res);
        expect(data.status).toBe("completed");
      });
    });

    it("PUT /tasks/:id/status returns 400 when status missing", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/tasks/someid/status`, {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify({}),
        });
        expect(res.status).toBe(400);
      });
    });

    it("PUT /tasks/:id/status returns 404 for nonexistent task", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/tasks/nonexistent/status`, {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify({ status: "completed" }),
        });
        expect(res.status).toBe(404);
      });
    });
  });

  // ── MCP Servers additional ──

  describe("mcp servers additional endpoints", () => {
    it("GET /mcp-servers lists servers", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/mcp-servers`, { headers: authHeaders });
        expect(res.status).toBe(200);
        const data = await json(res);
        expect(Array.isArray(data)).toBe(true);
      });
    });

    it("GET /mcp-servers/:id returns server", async () => {
      await withServer(app, async (base) => {
        const createRes = await fetch(`${base}/api/admin/mcp-servers`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ name: "GetMe", type: "stdio", command: "npx" }),
        });
        const server = await json(createRes);
        const res = await fetch(`${base}/api/admin/mcp-servers/${server.id as string}`, { headers: authHeaders });
        expect(res.status).toBe(200);
        const data = await json(res);
        expect(data.name).toBe("GetMe");
      });
    });

    it("GET /mcp-servers/:id returns 404 for nonexistent", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/mcp-servers/nonexistent`, { headers: authHeaders });
        expect(res.status).toBe(404);
      });
    });

    it("DELETE /mcp-servers/:id returns 404 for nonexistent", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/mcp-servers/nonexistent`, {
          method: "DELETE",
          headers: authHeaders,
        });
        expect(res.status).toBe(404);
      });
    });

    it("PUT /mcp-servers/:id returns 404 for nonexistent", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/mcp-servers/nonexistent`, {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify({ enabled: false }),
        });
        expect(res.status).toBe(404);
      });
    });

    it("POST /mcp-servers rejects SSRF via 10.x.x.x range", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/mcp-servers`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ name: "10x", type: "http", url: "http://10.0.0.1/api" }),
        });
        expect(res.status).toBe(400);
      });
    });

    it("POST /mcp-servers rejects SSRF via 172.16.x.x range", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/mcp-servers`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ name: "172x", type: "http", url: "http://172.17.0.1/api" }),
        });
        expect(res.status).toBe(400);
      });
    });

    it("POST /mcp-servers rejects SSRF via 169.254.x.x link-local", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/mcp-servers`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ name: "link", type: "http", url: "http://169.254.1.1/api" }),
        });
        expect(res.status).toBe(400);
      });
    });

    it("POST /mcp-servers rejects SSRF via 0.x.x.x range", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/mcp-servers`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ name: "0x", type: "http", url: "http://0.0.0.1/api" }),
        });
        expect(res.status).toBe(400);
      });
    });

    it("POST /mcp-servers rejects non-http protocol (ftp)", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/mcp-servers`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ name: "ftp", type: "http", url: "ftp://example.com/api" }),
        });
        expect(res.status).toBe(400);
      });
    });

    it("POST /mcp-servers rejects localhost URL", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/mcp-servers`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ name: "lh", type: "http", url: "http://localhost/api" }),
        });
        expect(res.status).toBe(400);
      });
    });

    it("POST /mcp-servers rejects [::1] IPv6 loopback", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/mcp-servers`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ name: "ipv6", type: "http", url: "http://[::1]/api" }),
        });
        expect(res.status).toBe(400);
      });
    });

    it("POST /mcp-servers rejects invalid URL string", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/mcp-servers`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ name: "bad", type: "http", url: "not-a-url" }),
        });
        expect(res.status).toBe(400);
      });
    });

    it("POST /mcp-servers accepts safe public HTTPS URL", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/mcp-servers`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ name: "external", type: "http", url: "https://api.example.com/mcp" }),
        });
        expect(res.status).toBe(201);
      });
    });

    it("POST /mcp-servers accepts 172.15.x.x (below private range - public)", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/mcp-servers`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ name: "172-low", type: "http", url: "http://172.15.0.1/api" }),
        });
        expect(res.status).toBe(201);
      });
    });

    it("POST /mcp-servers accepts 172.32.x.x (above private range - public)", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/mcp-servers`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ name: "172-high", type: "http", url: "http://172.32.0.1/api" }),
        });
        expect(res.status).toBe(201);
      });
    });

    it("POST /mcp-servers accepts 192.169.x.x (not 192.168 private - public)", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/mcp-servers`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ name: "192-not-168", type: "http", url: "http://192.169.0.1/api" }),
        });
        expect(res.status).toBe(201);
      });
    });

    it("POST /mcp-servers accepts 169.255.x.x (not 169.254 link-local - public)", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/mcp-servers`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ name: "169-not-254", type: "http", url: "http://169.255.0.1/api" }),
        });
        expect(res.status).toBe(201);
      });
    });

    it("POST /mcp-servers returns 400 when name or type missing", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/mcp-servers`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ type: "stdio", command: "npx" }),
        });
        expect(res.status).toBe(400);
      });
    });

    it("POST /mcp-servers returns 400 when type is missing but name present", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/mcp-servers`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ name: "MyServer" }),
        });
        expect(res.status).toBe(400);
      });
    });
  });

  // ── Skills update/delete ──

  describe("skills update and delete", () => {
    it("GET /skills lists all skills", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/skills`, { headers: authHeaders });
        expect(res.status).toBe(200);
        const data = await json(res);
        expect(Array.isArray(data)).toBe(true);
      });
    });
    it("PUT /skills/:id updates skill content", async () => {
      await withServer(app, async (base) => {
        const createRes = await fetch(`${base}/api/admin/skills`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ name: "UpdateSkill", content: "Original content" }),
        });
        const skill = await json(createRes);
        const res = await fetch(`${base}/api/admin/skills/${skill.id as string}`, {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify({ content: "Updated content" }),
        });
        expect(res.status).toBe(200);
        const updated = await json(res);
        expect(updated.content).toBe("Updated content");
      });
    });

    it("PUT /skills/:id returns 404 for nonexistent", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/skills/nonexistent`, {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify({ content: "New content" }),
        });
        expect(res.status).toBe(404);
      });
    });

    it("DELETE /skills/:id returns 404 for nonexistent", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/skills/nonexistent`, {
          method: "DELETE",
          headers: authHeaders,
        });
        expect(res.status).toBe(404);
      });
    });
  });

  // ── Auth device and wait ──

  describe("auth device and wait", () => {
    it("POST /auth/device returns 503 when copilot not configured", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/auth/device`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({}),
        });
        expect(res.status).toBe(503);
      });
    });

    it("POST /auth/wait returns 503 when copilot not configured", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/auth/wait`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({}),
        });
        expect(res.status).toBe(503);
      });
    });
  });

  // ── Knowledge reindex ──

  describe("knowledge reindex", () => {
    it("POST /knowledge/reindex queues reindex", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/knowledge/reindex`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({}),
        });
        expect(res.status).toBe(200);
        const data = await json(res);
        expect(data.status).toBe("queued");
      });
    });

    it("POST /knowledge/reindex/:docId queues specific doc reindex", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/knowledge/reindex/doc-123`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({}),
        });
        expect(res.status).toBe(200);
        const data = await json(res);
        expect(data.docId).toBe("doc-123");
      });
    });
  });

  // ── Prompts additional ──

  describe("prompts additional", () => {
    it("GET /prompts with category filter", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/prompts?category=testing`, { headers: authHeaders });
        expect(res.status).toBe(200);
        const data = await json(res);
        expect(Array.isArray(data)).toBe(true);
      });
    });

    it("POST /prompts returns 400 when content missing", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/prompts`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ name: "NoContent" }),
        });
        expect(res.status).toBe(400);
      });
    });

    it("PUT /prompts/:id returns 404 for nonexistent prompt", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/prompts/nonexistent`, {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify({ name: "Updated" }),
        });
        expect(res.status).toBe(404);
      });
    });

    it("DELETE /prompts/:id returns 404 for nonexistent prompt", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/admin/prompts/nonexistent`, {
          method: "DELETE",
          headers: authHeaders,
        });
        expect(res.status).toBe(404);
      });
    });
  });
});
