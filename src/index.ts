/**
 * Talos — Backend Server Entry Point
 *
 * Express + Socket.IO server that exposes the Talos REST API and real-time
 * event stream used by the Next.js UI.
 */

import crypto from "node:crypto";
import { createServer } from "node:http";
import { mkdirSync, appendFileSync, readdirSync, readFileSync, statSync, existsSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import express from "express";
import { Server as SocketIOServer } from "socket.io";
import Database from "better-sqlite3";
import { TalosRepository } from "./talos/repository.js";
import { PlatformRepository } from "./platform/repository.js";
import { EnvManager } from "./platform/env-manager.js";
import { createAdminRouter } from "./api/admin.js";
import { CopilotWrapperService } from "./copilot/copilot-wrapper.js";
import type { CopilotWrapper } from "./copilot/copilot-wrapper.js";

// ── Config ────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const DATA_DIR = process.env.TALOS_DATA_DIR ?? join(homedir(), ".talos");
const DB_PATH = join(DATA_DIR, "talos.db");
const SESSIONS_DIR = join(DATA_DIR, "sessions");

mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(SESSIONS_DIR, { recursive: true });

// ── Database ──────────────────────────────────────────────────────────────────

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const repo = new TalosRepository(db);
repo.migrate();

const platformRepo = new PlatformRepository(db);
platformRepo.migrate();

// ── Environment Manager ───────────────────────────────────────────────────────

const envManager = new EnvManager(join(DATA_DIR, ".env"));

// ── Copilot Wrapper ───────────────────────────────────────────────────────────

let copilot: CopilotWrapper | undefined;
try {
  copilot = new CopilotWrapperService({ authPath: join(DATA_DIR, "auth.json") });
} catch {
  console.warn("[talos] CopilotWrapper initialization failed — AI chat will be unavailable");
}

// ── Session Persistence Helpers ───────────────────────────────────────────────

function appendSessionMessage(conversationId: string, message: { role: string; content: string; timestamp: string }) {
  const safeName = conversationId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const filePath = join(SESSIONS_DIR, `${safeName}.jsonl`);
  appendFileSync(filePath, JSON.stringify(message) + "\n", "utf-8");
}

// ── Express ───────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// ── Socket.IO ─────────────────────────────────────────────────────────────────

const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

io.on("connection", (socket) => {
  console.log(`[socket] client connected: ${socket.id}`);
  socket.on("disconnect", () => {
    console.log(`[socket] client disconnected: ${socket.id}`);
  });
});

// ── Health ────────────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// ── Applications ──────────────────────────────────────────────────────────────

app.get("/api/talos/applications", (req, res) => {
  const status = req.query.status as string | undefined;
  const apps = repo.listApplications(status as Parameters<typeof repo.listApplications>[0]);
  res.json(apps);
});

app.get("/api/talos/applications/:id", (req, res) => {
  const app_ = repo.getApplication(req.params.id);
  if (!app_) { res.status(404).json({ error: "Not found" }); return; }
  res.json(app_);
});

app.post("/api/talos/applications", (req, res) => {
  const { name, description, repositoryUrl, baseUrl, githubPatRef } = req.body as Record<string, string>;
  if (!name || !repositoryUrl || !baseUrl) {
    res.status(400).json({ error: "name, repositoryUrl, and baseUrl are required" }); return;
  }
  const created = repo.createApplication({ name, description, repositoryUrl, baseUrl, githubPatRef });
  io.emit("application:created", created);
  res.status(201).json(created);
});

app.patch("/api/talos/applications/:id", (req, res) => {
  const updated = repo.updateApplication(req.params.id, req.body as Parameters<typeof repo.updateApplication>[1]);
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  io.emit("application:updated", updated);
  res.json(updated);
});

// Discovery — fires a background job and emits progress via Socket.IO
app.post("/api/talos/applications/:id/discover", (req, res) => {
  const app_ = repo.getApplication(req.params.id);
  if (!app_) { res.status(404).json({ error: "Not found" }); return; }

  const jobId = `discovery-${req.params.id}-${Date.now()}`;

  // Emit initial queued event; the real discovery engine integration
  // can be wired in here when the DiscoveryEngine is configured.
  setImmediate(() => {
    io.emit("discovery:started", { jobId, applicationId: req.params.id });
    io.emit("discovery:completed", {
      jobId,
      applicationId: req.params.id,
      status: "completed",
      filesDiscovered: 0,
      filesIndexed: 0,
      chunksCreated: 0,
    });
  });

  res.json({ jobId });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

app.get("/api/talos/tests", (req, res) => {
  const { applicationId, status } = req.query as Record<string, string | undefined>;
  if (!applicationId) {
    // Return all tests across all applications
    const apps = repo.listApplications();
    const tests = apps.flatMap((a) => repo.listTestsByApp(a.id));
    res.json(tests); return;
  }
  const tests = repo.listTestsByApp(
    applicationId,
    status as Parameters<typeof repo.listTestsByApp>[1]
  );
  res.json(tests);
});

app.get("/api/talos/tests/:id", (req, res) => {
  const test = repo.getTest(req.params.id);
  if (!test) { res.status(404).json({ error: "Not found" }); return; }
  res.json(test);
});

app.post("/api/talos/tests", (req, res) => {
  const body = req.body as Parameters<typeof repo.createTest>[0];
  if (!body.applicationId || !body.name || !body.code) {
    res.status(400).json({ error: "applicationId, name, and code are required" }); return;
  }
  const created = repo.createTest(body);
  io.emit("test:created", created);
  res.status(201).json(created);
});

app.patch("/api/talos/tests/:id", (req, res) => {
  const updated = repo.updateTest(req.params.id, req.body as Parameters<typeof repo.updateTest>[1]);
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  io.emit("test:updated", updated);
  res.json(updated);
});

// ── Test Runs ─────────────────────────────────────────────────────────────────

app.get("/api/talos/runs", (req, res) => {
  const { testId, applicationId } = req.query as Record<string, string | undefined>;
  if (testId) { res.json(repo.listRunsByTest(testId)); return; }
  if (applicationId) { res.json(repo.listRunsByApp(applicationId)); return; }
  // No filter — return recent runs across all apps (last 100)
  const apps = repo.listApplications();
  const runs = apps.flatMap((a) => repo.listRunsByApp(a.id, 100));
  res.json(runs);
});

app.get("/api/talos/runs/:id", (req, res) => {
  const run = repo.getTestRun(req.params.id);
  if (!run) { res.status(404).json({ error: "Not found" }); return; }
  res.json(run);
});

app.post("/api/talos/runs", (req, res) => {
  const body = req.body as Parameters<typeof repo.createTestRun>[0];
  if (!body.testId) { res.status(400).json({ error: "testId is required" }); return; }
  const created = repo.createTestRun({ ...body, trigger: "manual", triggeredBy: "manual" });
  io.emit("run:created", created);
  res.status(201).json(created);
});

// ── Artifacts ─────────────────────────────────────────────────────────────────

app.get("/api/talos/artifacts", (req, res) => {
  const { testRunId } = req.query as Record<string, string | undefined>;
  if (!testRunId) { res.status(400).json({ error: "testRunId query param is required" }); return; }
  res.json(repo.listArtifactsByRun(testRunId));
});

app.get("/api/talos/artifacts/:id", (req, res) => {
  const artifact = repo.getArtifact(req.params.id);
  if (!artifact) { res.status(404).json({ error: "Not found" }); return; }
  res.json(artifact);
});

// ── Vault Roles ───────────────────────────────────────────────────────────────

app.get("/api/talos/vault-roles", (req, res) => {
  const { applicationId } = req.query as Record<string, string | undefined>;
  if (!applicationId) {
    const apps = repo.listApplications();
    const roles = apps.flatMap((a) => repo.listRolesByApp(a.id));
    res.json(roles); return;
  }
  res.json(repo.listRolesByApp(applicationId));
});

app.get("/api/talos/vault-roles/:id", (req, res) => {
  const role = repo.getVaultRole(req.params.id);
  if (!role) { res.status(404).json({ error: "Not found" }); return; }
  res.json(role);
});

app.post("/api/talos/vault-roles", (req, res) => {
  const body = req.body as Parameters<typeof repo.createVaultRole>[0];
  if (!body.applicationId || !body.name || !body.usernameRef || !body.passwordRef) {
    res.status(400).json({ error: "applicationId, name, usernameRef, and passwordRef are required" }); return;
  }
  const created = repo.createVaultRole(body);
  res.status(201).json(created);
});

app.patch("/api/talos/vault-roles/:id", (req, res) => {
  const updated = repo.updateVaultRole(req.params.id, req.body as Parameters<typeof repo.updateVaultRole>[1]);
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

app.delete("/api/talos/vault-roles/:id", (req, res) => {
  const deleted = repo.deleteVaultRole(req.params.id);
  if (!deleted) { res.status(404).json({ error: "Not found" }); return; }
  res.status(204).end();
});

// ── Admin API ─────────────────────────────────────────────────────────────────

app.use("/api/admin", createAdminRouter({ platformRepo, copilot, adminToken: process.env.TALOS_ADMIN_TOKEN, envManager }));

// ── Test Generation (#220) ────────────────────────────────────────────────────

app.post("/api/talos/tests/generate", async (req, res) => {
  const { applicationId, prompt, testType } = req.body as {
    applicationId?: string; prompt?: string; model?: string; testType?: string;
  };
  if (!applicationId || !prompt) {
    res.status(400).json({ error: "applicationId and prompt are required" }); return;
  }
  const app_ = repo.getApplication(applicationId);
  if (!app_) { res.status(404).json({ error: "Application not found" }); return; }

  // Generate a draft test — in a full implementation this would call the LLM
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

  io.emit("test:generated", { testId: created.id, applicationId });
  res.status(201).json({ id: created.id, code: created.code, name: created.name, confidence: created.generationConfidence ?? 0.75 });
});

// ── Test Refinement (#221) ────────────────────────────────────────────────────

app.post("/api/talos/tests/:id/refine", (req, res) => {
  const { feedback } = req.body as { feedback?: string };
  if (!feedback) { res.status(400).json({ error: "feedback is required" }); return; }
  const test = repo.getTest(req.params.id);
  if (!test) { res.status(404).json({ error: "Test not found" }); return; }

  // Placeholder — would call LLM for refinement
  const refined = repo.updateTest(req.params.id, {
    code: `${test.code}\n// Refined based on feedback: ${feedback}\n`,
    version: bumpPatch(test.version),
    updatedAt: new Date(),
  });

  res.json({ id: refined!.id, code: refined!.code, name: refined!.name, confidence: refined!.generationConfidence ?? 0.75 });
});

function bumpPatch(version: string): string {
  const parts = version.split(".");
  if (parts.length === 3) {
    parts[2] = String(Number(parts[2]) + 1);
    return parts.join(".");
  }
  return "1.0.1";
}

// ── Session Management (#222) ─────────────────────────────────────────────────

app.get("/api/talos/sessions", (_req, res) => {
  const sessions: { id: string; startedAt: string; lastMessageAt: string; messageCount: number; preview: string }[] = [];

  try {
    const files = readdirSync(SESSIONS_DIR) as string[];
    for (const file of files) {
      if (!file.endsWith(".jsonl")) continue;
      const id = file.replace(".jsonl", "");
      const filePath = join(SESSIONS_DIR, file);
      const stat = statSync(filePath);
      const content = readFileSync(filePath, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      if (lines.length === 0) continue;

      const firstMsg = JSON.parse(lines[0]);
      const lastMsg = JSON.parse(lines[lines.length - 1]);
      const userMessages = lines.filter((l: string) => { try { return JSON.parse(l).role === "user"; } catch { return false; } });
      const preview = userMessages.length > 0 ? JSON.parse(userMessages[0]).content.substring(0, 100) : "";

      sessions.push({
        id,
        startedAt: firstMsg.timestamp ?? stat.birthtime.toISOString(),
        lastMessageAt: lastMsg.timestamp ?? stat.mtime.toISOString(),
        messageCount: lines.length,
        preview,
      });
    }
  } catch { /* sessions dir may not exist yet */ }

  sessions.sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
  res.json(sessions);
});

app.get("/api/talos/sessions/:id", (req, res) => {
  const safeName = req.params.id.replace(/[^a-zA-Z0-9_-]/g, "_");
  const filePath = join(SESSIONS_DIR, `${safeName}.jsonl`);
  if (!existsSync(filePath)) { res.status(404).json({ error: "Session not found" }); return; }

  const content = readFileSync(filePath, "utf-8");
  const messages = content.trim().split("\n").filter(Boolean).map((line: string) => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);

  res.json({ id: req.params.id, messages });
});

app.delete("/api/talos/sessions/:id", (req, res) => {
  const safeName = req.params.id.replace(/[^a-zA-Z0-9_-]/g, "_");
  const filePath = join(SESSIONS_DIR, `${safeName}.jsonl`);
  if (!existsSync(filePath)) { res.status(404).json({ error: "Session not found" }); return; }
  unlinkSync(filePath);
  res.status(204).end();
});

// ── Orchestration (#232) ──────────────────────────────────────────────────────

app.post("/api/talos/orchestrate", (req, res) => {
  const { applicationId, steps } = req.body as {
    applicationId?: string; steps?: string[]; config?: Record<string, unknown>;
  };
  if (!applicationId) { res.status(400).json({ error: "applicationId is required" }); return; }
  const app_ = repo.getApplication(applicationId);
  if (!app_) { res.status(404).json({ error: "Application not found" }); return; }

  const runId = crypto.randomUUID();
  const defaultSteps = steps ?? ["discover", "index", "generate", "execute"];

  // Create a task for orchestration
  platformRepo.createTask({ prompt: `Orchestrate: ${defaultSteps.join(" → ")} for ${app_.name}` });

  io.emit("orchestration:started", { runId, applicationId, steps: defaultSteps });

  // Simulate step progression
  setImmediate(() => {
    for (const step of defaultSteps) {
      io.emit("orchestration:step", { runId, step, status: "completed" });
    }
    io.emit("orchestration:completed", { runId, status: "completed" });
  });

  res.json({
    runId,
    status: "started",
    steps: defaultSteps.map((name) => ({ name, status: "pending" })),
  });
});

app.get("/api/talos/orchestrate/:runId", (req, res) => {
  // Placeholder — would look up orchestration state
  res.json({ runId: req.params.runId, status: "completed", steps: [] });
});

// ── Chat (streaming via Socket.IO) ────────────────────────────────────────────

io.on("connection", (socket) => {
  socket.on("chat:message", async (data: { message: string; conversationId?: string; agent?: string }) => {
    const conversationId = data.conversationId ?? `chat-${Date.now()}`;
    const timestamp = new Date().toISOString();

    // Persist user message
    appendSessionMessage(conversationId, { role: "user", content: data.message, timestamp });

    socket.emit("chat:stream:start", { conversationId });

    if (!copilot) {
      const fallback = "Copilot SDK is not configured. Go to Admin > Auth to set up authentication.";
      socket.emit("chat:stream:delta", { delta: fallback, conversationId });
      socket.emit("chat:stream:end", { conversationId, tokenUsage: null });
      appendSessionMessage(conversationId, { role: "assistant", content: fallback, timestamp: new Date().toISOString() });
      return;
    }

    try {
      const isAuthenticated = await copilot.isAuthenticated();
      if (!isAuthenticated) {
        const msg = "Not authenticated. Go to Admin > Auth to connect to GitHub Copilot.";
        socket.emit("chat:stream:delta", { delta: msg, conversationId });
        socket.emit("chat:stream:end", { conversationId, tokenUsage: null });
        appendSessionMessage(conversationId, { role: "assistant", content: msg, timestamp: new Date().toISOString() });
        return;
      }

      // Get active personality for system message
      const personality = platformRepo.getActivePersonality();
      const systemMessage = personality
        ? { mode: "append" as const, content: personality.systemPrompt }
        : undefined;

      let fullResponse = "";
      const stream = copilot.chat(data.message, {
        conversationId,
        systemMessage,
        onToolCall: (tool, args) => {
          socket.emit("chat:stream:tool", { tool, args, conversationId });
        },
      });

      for await (const chunk of stream) {
        fullResponse += chunk;
        socket.emit("chat:stream:delta", { delta: chunk, conversationId });
      }

      const tokenUsage = copilot.getSessionUsage(conversationId);
      socket.emit("chat:stream:end", { conversationId, tokenUsage });

      // Persist assistant message
      appendSessionMessage(conversationId, { role: "assistant", content: fullResponse, timestamp: new Date().toISOString() });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Unknown error occurred";
      socket.emit("chat:stream:delta", { delta: `Error: ${errMsg}`, conversationId });
      socket.emit("chat:stream:end", { conversationId, tokenUsage: null });
    }
  });
});

// ── Stats ─────────────────────────────────────────────────────────────────────

app.get("/api/talos/stats", (_req, res) => {
  const apps = repo.listApplications();
  const allTests = apps.flatMap((a) => repo.listTestsByApp(a.id));
  const recentRuns = apps.flatMap((a) => repo.listRunsByApp(a.id, 100));

  const passed = recentRuns.filter((r) => r.status === "passed").length;
  const passRate = recentRuns.length > 0 ? passed / recentRuns.length : 0;

  res.json({
    applications: apps.length,
    tests: allTests.length,
    recentRuns: recentRuns.length,
    passRate: Math.round(passRate * 100) / 100,
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`[talos] server listening on http://localhost:${PORT}`);
  console.log(`[talos] data directory: ${DATA_DIR}`);
});
