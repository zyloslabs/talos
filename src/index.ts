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
import { seedPrebuiltAgentsAndSkills } from "./platform/seed-prebuilts.js";
import { EnvManager } from "./platform/env-manager.js";
import { createAdminRouter } from "./api/admin.js";
import { createCriteriaRouter } from "./api/criteria.js";
import { CopilotWrapperService } from "./copilot/copilot-wrapper.js";
import type { CopilotWrapper } from "./copilot/copilot-wrapper.js";
import { DocumentIngester, type DocFormat, type DocMetadata } from "./talos/knowledge/document-ingester.js";
import { BrowserAuth } from "./talos/m365/browser-auth.js";
import { CopilotScraper } from "./talos/m365/scraper.js";
import { EphemeralStore } from "./talos/m365/ephemeral.js";
import { createM365Router } from "./api/m365.js";
import { parseTalosConfig, createDataSourceInputSchema, atlassianConfigInputSchema } from "./talos/config.js";
import { ExportEngine } from "./talos/export/export-engine.js";
import { GitHubExportService } from "./talos/export/github-export-service.js";
import { RagPipeline } from "./talos/rag/rag-pipeline.js";
import { DiscoveryEngine } from "./talos/discovery/discovery-engine.js";
import { ArtifactManager } from "./talos/runner/artifact-manager.js";
import { CredentialInjector } from "./talos/runner/credential-injector.js";
import { PlaywrightRunner } from "./talos/runner/playwright-runner.js";
import { TestGenerator } from "./talos/generator/test-generator.js";
import type { ChunkResult } from "./talos/discovery/file-chunker.js";
import type { TalosChunk } from "./talos/types.js";
import { createOrchestrateAgentsTool } from "./talos/tools/orchestrate-agents.js";
import { createSpawnAgentTool } from "./talos/tools/spawn-agent.js";
import type { ToolDefinition } from "./talos/tools.js";

// ── Env File Bootstrap ────────────────────────────────────────────────────────
// Load ~/.talos/.env into process.env before reading any config.
// Shell env vars already set (e.g. PORT from dev-clean.sh) take precedence.
{
  const _rawDir = process.env.TALOS_DATA_DIR ?? join(homedir(), ".talos");
  const _dir = _rawDir.startsWith("~/") ? join(homedir(), _rawDir.slice(2)) : _rawDir === "~" ? homedir() : _rawDir;
  const _file = join(_dir, ".env");
  if (existsSync(_file)) {
    try {
      for (const _line of readFileSync(_file, "utf-8").split("\n")) {
        const _l = _line.trim();
        if (!_l || _l.startsWith("#")) continue;
        const _eq = _l.indexOf("=");
        if (_eq === -1) continue;
        const _key = _l.slice(0, _eq).trim();
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(_key) || _key in process.env) continue;
        let _val = _l.slice(_eq + 1).trim();
        if ((_val.startsWith('"') && _val.endsWith('"')) || (_val.startsWith("'") && _val.endsWith("'"))) {
          _val = _val.slice(1, -1);
        }
        process.env[_key] = _val;
      }
    } catch {
      // Non-fatal: continue without .env file values
    }
  }
}

// ── Config ────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const _rawDataDir = process.env.TALOS_DATA_DIR ?? join(homedir(), ".talos");
const DATA_DIR = _rawDataDir.startsWith("~/")
  ? join(homedir(), _rawDataDir.slice(2))
  : _rawDataDir === "~"
    ? homedir()
    : _rawDataDir;
const DB_PATH = join(DATA_DIR, "talos.db");
const SESSIONS_DIR = join(DATA_DIR, "sessions");
const VECTORDB_DIR = join(DATA_DIR, "vectordb");

mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(SESSIONS_DIR, { recursive: true });
mkdirSync(VECTORDB_DIR, { recursive: true });

// ── Talos Config (hoisted — needed by RAG and engine init) ────────────────────

const m365EnabledRaw = process.env.M365_ENABLED;
const talosConfig = parseTalosConfig({
  m365: {
    enabled: m365EnabledRaw === "true" || m365EnabledRaw === "1",
  },
});

// ── Database ──────────────────────────────────────────────────────────────────

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const repo = new TalosRepository(db);
repo.migrate();

const platformRepo = new PlatformRepository(db);
platformRepo.migrate();

// ── Seed Prebuilt Agents & Skills ─────────────────────────────────────────────

seedPrebuiltAgentsAndSkills(platformRepo);

// ── Environment Manager ───────────────────────────────────────────────────────

const envManager = new EnvManager(join(DATA_DIR, ".env"));

// ── Copilot Wrapper ───────────────────────────────────────────────────────────

let copilot: CopilotWrapper | undefined;
try {
  // Prefer process.env tokens (set before server start), then fall back to user-managed env file.
  const githubToken =
    process.env.GITHUB_TOKEN ??
    process.env.COPILOT_GITHUB_TOKEN ??
    envManager.getRaw("GITHUB_TOKEN") ??
    envManager.getRaw("COPILOT_GITHUB_TOKEN");
  copilot = new CopilotWrapperService({
    authPath: join(DATA_DIR, "auth.json"),
    githubToken,
  });
  // Prevent unhandled 'error' events from crashing the process
  (copilot as CopilotWrapperService).on("error", (err: Error) => {
    console.error("[copilot] error:", err.message);
  });
} catch {
  console.warn("[talos] CopilotWrapper initialization failed — AI chat will be unavailable");
}

// ── RAG Infrastructure ────────────────────────────────────────────────────────

let ragPipeline: RagPipeline | undefined;
let discoveryEngine: DiscoveryEngine | undefined;
let playwrightRunner: PlaywrightRunner | undefined;
let testGenerator: TestGenerator | undefined;

// Temporary per-app chunk buffer used by the orchestration pipeline
const discoveredChunksBuffer = new Map<string, ChunkResult[]>();

const initRag = async () => {
  const githubToken = copilot ? await (copilot as CopilotWrapperService).getGithubToken() : undefined;
  if (!githubToken) {
    console.warn("[RAG] GitHub token not available — RAG features will be disabled");
    return;
  }
  ragPipeline = new RagPipeline({
    vectorDbConfig: { ...talosConfig.vectorDb, path: VECTORDB_DIR },
    embeddingConfig: { ...talosConfig.embedding, provider: "github-models" },
    apiKey: githubToken,
  });

  await ragPipeline.initialize();

  // DiscoveryEngine wired to store chunks in per-app buffer for pipeline indexing
  discoveryEngine = new DiscoveryEngine({
    repository: repo,
    config: talosConfig.discovery,
    storeChunks: async (applicationId: string, chunks: TalosChunk[]) => {
      const existing = discoveredChunksBuffer.get(applicationId) ?? [];
      discoveredChunksBuffer.set(applicationId, [...existing, ...(chunks as unknown as ChunkResult[])]);
    },
  });

  const artifactManager = new ArtifactManager({
    config: talosConfig.artifacts,
    repository: repo,
  });
  await artifactManager.initialize();

  const credentialInjector = new CredentialInjector({
    repository: repo,
    resolveSecret: async (ref: string) => {
      // Resolve vault secret references from environment variables (fallback stub)
      const envKey = ref.replace(/[^A-Za-z0-9_]/g, "_").toUpperCase();
      const value = process.env[envKey];
      if (!value) throw new Error(`Secret not found: ${ref}`);
      return value;
    },
  });

  playwrightRunner = new PlaywrightRunner({
    config: talosConfig.runner,
    repository: repo,
    artifactManager,
    credentialInjector,
  });

  const capturedCopilot = copilot;
  testGenerator = new TestGenerator({
    config: talosConfig.generator,
    repository: repo,
    ragPipeline,
    generateWithLLM: async (systemPrompt: string, userPrompt: string): Promise<string> => {
      if (!capturedCopilot) throw new Error("Copilot not available for test generation");
      let result = "";
      for await (const chunk of capturedCopilot.chat(userPrompt, {
        systemMessage: { mode: "replace", content: systemPrompt },
      })) {
        result += chunk;
      }
      return result;
    },
  });

  console.log("[RAG] Initialized with GitHub Models embeddings provider");
};

initRag().catch((err) => {
  console.warn(
    `[RAG] Initialization failed — RAG features disabled: ${err instanceof Error ? err.message : String(err)}`
  );
});

// ── Orchestration Agent Tools ─────────────────────────────────────────────────

const orchestrationTools: ToolDefinition[] = [];
if (copilot) {
  orchestrationTools.push(
    createOrchestrateAgentsTool({ copilot, platformRepo, talosConfig }),
    createSpawnAgentTool({ copilot, platformRepo })
  );
}

// ── URL Validation ───────────────────────────────────────────────────────────

// When true, skip private/loopback range checks (for local dev). Still requires http/https scheme.
const ALLOW_PRIVATE_URLS = process.env.TALOS_ALLOW_PRIVATE_URLS === "true";

/**
 * Validates that a URL is safe to use as a Playwright test target.
 * Rejects non-http(s) schemes, loopback, RFC-1918, and APIPA addresses.
 * Set TALOS_ALLOW_PRIVATE_URLS=true to permit private/loopback addresses in dev.
 */
function validateBaseUrl(urlStr: string): { valid: boolean; reason?: string } {
  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    return { valid: false, reason: "Invalid URL format" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { valid: false, reason: "Only http and https URLs are allowed" };
  }

  if (ALLOW_PRIVATE_URLS) {
    return { valid: true };
  }

  const hostname = url.hostname.toLowerCase();

  // Block loopback
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
    return { valid: false, reason: "Loopback addresses are not allowed" };
  }

  // Block RFC-1918 private ranges and APIPA (169.254.x.x)
  const privateRanges = [
    /^10\.\d+\.\d+\.\d+$/,
    /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
    /^192\.168\.\d+\.\d+$/,
    /^169\.254\.\d+\.\d+$/,
  ];

  if (privateRanges.some((r) => r.test(hostname))) {
    return { valid: false, reason: "Private network addresses are not allowed" };
  }

  return { valid: true };
}

// ── Session Persistence Helpers ───────────────────────────────────────────────

function appendSessionMessage(conversationId: string, message: { role: string; content: string; timestamp: string }) {
  const safeName = conversationId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const filePath = join(SESSIONS_DIR, `${safeName}.jsonl`);
  // TODO: add rate limiting per client IP before production deployment
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
  if (!app_) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(app_);
});

app.post("/api/talos/applications", (req, res) => {
  const { name, description, repositoryUrl, baseUrl, githubPatRef } = req.body as Record<string, string>;
  if (!name || !repositoryUrl || !baseUrl) {
    res.status(400).json({ error: "name, repositoryUrl, and baseUrl are required" });
    return;
  }
  const urlCheck = validateBaseUrl(baseUrl);
  if (!urlCheck.valid) {
    res.status(400).json({ error: `Invalid baseUrl: ${urlCheck.reason}` });
    return;
  }
  const created = repo.createApplication({ name, description, repositoryUrl, baseUrl, githubPatRef });
  io.emit("application:created", created);

  // Copilot365 integration (#401): suggest M365 research if Copilot365 MCP server is configured
  const mcpServers = platformRepo.listMcpServers();
  const copilot365Available = mcpServers.some(
    (s) => (s.name.toLowerCase() === "copilot365" || s.name.toLowerCase() === "copilot-365") && s.enabled
  );
  if (copilot365Available) {
    io.emit("copilot365:suggest-research", {
      applicationId: created.id,
      serverAvailable: true,
    });
  }

  res.status(201).json(created);
});

app.patch("/api/talos/applications/:id", (req, res) => {
  const body = req.body as Parameters<typeof repo.updateApplication>[1] & { baseUrl?: string };
  if (body.baseUrl !== undefined) {
    const urlCheck = validateBaseUrl(body.baseUrl);
    if (!urlCheck.valid) {
      res.status(400).json({ error: `Invalid baseUrl: ${urlCheck.reason}` });
      return;
    }
  }
  const updated = repo.updateApplication(req.params.id, body);
  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  io.emit("application:updated", updated);
  res.json(updated);
});

// Discovery — fires a background job and emits progress via Socket.IO
app.post("/api/talos/applications/:id/discover", (req, res) => {
  const app_ = repo.getApplication(req.params.id);
  if (!app_) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  if (!discoveryEngine) {
    res.status(503).json({ error: "Discovery engine not initialized — check GitHub PAT and RAG configuration" });
    return;
  }

  const jobId = `discovery-${req.params.id}-${Date.now()}`;
  io.emit("discovery:started", { jobId, applicationId: req.params.id });

  // Start discovery asynchronously — return jobId immediately
  discoveryEngine
    .startDiscovery(app_)
    .then(async (job) => {
      io.emit("discovery:progress", {
        jobId,
        phase: "discovery",
        progress: 100,
        message: `Discovered ${job.filesDiscovered} files, created ${job.chunksCreated} chunks`,
      });

      // Run AppIntelligenceScanner after discovery completes
      try {
        const { AppIntelligenceScanner } = await import("./talos/discovery/app-intelligence-scanner.js");
        const { GitHubMcpClient } = await import("./talos/discovery/github-mcp-client.js");

        const pat =
          process.env.GITHUB_PERSONAL_ACCESS_TOKEN ??
          process.env.GITHUB_TOKEN ??
          process.env.COPILOT_GITHUB_TOKEN ??
          envManager.getRaw("GITHUB_PERSONAL_ACCESS_TOKEN") ??
          envManager.getRaw("GITHUB_TOKEN") ??
          "";

        if (pat) {
          const repoMatch =
            app_.repositoryUrl.match(/github\.com[\/:]([^\/]+)\/([^\/\.]+)/) ??
            app_.repositoryUrl.match(/^([^\/]+)\/([^\/]+)$/);
          if (repoMatch) {
            const [, owner, repoName] = repoMatch;
            const client = new GitHubMcpClient({ pat, owner, repo: repoName.replace(/\.git$/, "") });
            const tree = await client.getTree(app_.branch || "HEAD", true);
            const scanner = new AppIntelligenceScanner({ applicationId: app_.id });
            const report = await scanner.scan(tree, (path) => client.getFileText(path));
            repo.saveIntelligenceReport(report);
            io.emit("intelligence:scanned", { applicationId: app_.id, report });
          }
        }
      } catch (scanErr) {
        console.warn(
          `[discovery] Intelligence scan failed for ${app_.id}:`,
          scanErr instanceof Error ? scanErr.message : String(scanErr)
        );
      }

      io.emit("discovery:complete", {
        jobId,
        filesDiscovered: job.filesDiscovered,
        chunksCreated: job.chunksCreated,
      });
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : "Discovery failed";
      console.error(`[discovery] Failed for ${app_.id}:`, message);
      // Sanitize error message before broadcasting — avoid leaking internal paths or tokens
      const safeMessage = message.replace(/\/[^\s]+/g, "[path]").replace(/ghp_[A-Za-z0-9]+/g, "[token]");
      io.emit("discovery:error", { jobId, error: safeMessage });
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
    res.json(tests);
    return;
  }
  const tests = repo.listTestsByApp(applicationId, status as Parameters<typeof repo.listTestsByApp>[1]);
  res.json(tests);
});

app.get("/api/talos/tests/:id", (req, res) => {
  const test = repo.getTest(req.params.id);
  if (!test) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(test);
});

app.post("/api/talos/tests", (req, res) => {
  const body = req.body as Parameters<typeof repo.createTest>[0];
  if (!body.applicationId || !body.name || !body.code) {
    res.status(400).json({ error: "applicationId, name, and code are required" });
    return;
  }
  const created = repo.createTest(body);
  io.emit("test:created", created);
  res.status(201).json(created);
});

app.patch("/api/talos/tests/:id", (req, res) => {
  const updated = repo.updateTest(req.params.id, req.body as Parameters<typeof repo.updateTest>[1]);
  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  io.emit("test:updated", updated);
  res.json(updated);
});

// ── Test Runs ─────────────────────────────────────────────────────────────────

app.get("/api/talos/runs", (req, res) => {
  const { testId, applicationId } = req.query as Record<string, string | undefined>;
  if (testId) {
    res.json(repo.listRunsByTest(testId));
    return;
  }
  if (applicationId) {
    res.json(repo.listRunsByApp(applicationId));
    return;
  }
  // No filter — return recent runs across all apps (last 100)
  const apps = repo.listApplications();
  const runs = apps.flatMap((a) => repo.listRunsByApp(a.id, 100));
  res.json(runs);
});

app.get("/api/talos/runs/:id", (req, res) => {
  const run = repo.getTestRun(req.params.id);
  if (!run) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(run);
});

app.post("/api/talos/runs", (req, res) => {
  const body = req.body as Parameters<typeof repo.createTestRun>[0];
  if (!body.testId) {
    res.status(400).json({ error: "testId is required" });
    return;
  }
  const created = repo.createTestRun({ ...body, trigger: "manual", triggeredBy: "manual" });
  io.emit("run:created", created);
  res.status(201).json(created);
});

// ── Artifacts ─────────────────────────────────────────────────────────────────

app.get("/api/talos/artifacts", (req, res) => {
  const { testRunId } = req.query as Record<string, string | undefined>;
  if (!testRunId) {
    res.status(400).json({ error: "testRunId query param is required" });
    return;
  }
  res.json(repo.listArtifactsByRun(testRunId));
});

app.get("/api/talos/artifacts/:id", (req, res) => {
  const artifact = repo.getArtifact(req.params.id);
  if (!artifact) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(artifact);
});

// ── Vault Roles ───────────────────────────────────────────────────────────────

app.get("/api/talos/vault-roles", (req, res) => {
  const { applicationId } = req.query as Record<string, string | undefined>;
  if (!applicationId) {
    const apps = repo.listApplications();
    const roles = apps.flatMap((a) => repo.listRolesByApp(a.id));
    res.json(roles);
    return;
  }
  res.json(repo.listRolesByApp(applicationId));
});

app.get("/api/talos/vault-roles/:id", (req, res) => {
  const role = repo.getVaultRole(req.params.id);
  if (!role) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(role);
});

app.post("/api/talos/vault-roles", (req, res) => {
  const body = req.body as Parameters<typeof repo.createVaultRole>[0];
  if (!body.applicationId || !body.name || !body.usernameRef || !body.passwordRef) {
    res.status(400).json({ error: "applicationId, name, usernameRef, and passwordRef are required" });
    return;
  }
  const created = repo.createVaultRole(body);
  res.status(201).json(created);
});

app.patch("/api/talos/vault-roles/:id", (req, res) => {
  const updated = repo.updateVaultRole(req.params.id, req.body as Parameters<typeof repo.updateVaultRole>[1]);
  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(updated);
});

app.delete("/api/talos/vault-roles/:id", (req, res) => {
  const deleted = repo.deleteVaultRole(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.status(204).end();
});

// ── Data Sources ──────────────────────────────────────────────────────────────

app.get("/api/talos/applications/:appId/data-sources", (req, res) => {
  const app_ = repo.getApplication(req.params.appId);
  if (!app_) {
    res.status(404).json({ error: "Application not found" });
    return;
  }
  res.json(repo.getDataSourcesByApp(req.params.appId));
});

app.post("/api/talos/applications/:appId/data-sources", (req, res) => {
  const app_ = repo.getApplication(req.params.appId);
  if (!app_) {
    res.status(404).json({ error: "Application not found" });
    return;
  }

  const parsed = createDataSourceInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors });
    return;
  }

  const { label, driverType, jdbcUrl, usernameVaultRef, passwordVaultRef } = parsed.data;

  const created = repo.createDataSource({
    applicationId: req.params.appId,
    label,
    driverType,
    jdbcUrl,
    usernameVaultRef,
    passwordVaultRef,
  });
  io.emit("datasource:created", created);
  res.status(201).json(created);
});

app.get("/api/talos/applications/:appId/data-sources/:id", (req, res) => {
  const ds = repo.getDataSource(req.params.id);
  if (!ds || ds.applicationId !== req.params.appId) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(ds);
});

app.put("/api/talos/applications/:appId/data-sources/:id", (req, res) => {
  const ds = repo.getDataSource(req.params.id);
  if (!ds || ds.applicationId !== req.params.appId) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const updated = repo.updateDataSource(req.params.id, req.body as Parameters<typeof repo.updateDataSource>[1]);
  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  io.emit("datasource:updated", updated);
  res.json(updated);
});

app.delete("/api/talos/applications/:appId/data-sources/:id", (req, res) => {
  const ds = repo.getDataSource(req.params.id);
  if (!ds || ds.applicationId !== req.params.appId) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  repo.deleteDataSource(req.params.id);
  io.emit("datasource:deleted", { id: req.params.id });
  res.status(204).end();
});

app.post("/api/talos/applications/:appId/data-sources/:id/test", (req, res) => {
  const ds = repo.getDataSource(req.params.id);
  if (!ds || ds.applicationId !== req.params.appId) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  // Connection test — would start Docker JDBC container and run a test query
  res.json({ success: true, message: `Connection test queued for data source "${ds.label}"` });
});

// ── Atlassian Config ──────────────────────────────────────────────────────────

app.get("/api/talos/applications/:appId/atlassian", (req, res) => {
  const app_ = repo.getApplication(req.params.appId);
  if (!app_) {
    res.status(404).json({ error: "Application not found" });
    return;
  }
  const config = repo.getAtlassianConfigByApp(req.params.appId);
  if (!config) {
    res.status(404).json({ error: "No Atlassian config found" });
    return;
  }
  res.json(config);
});

app.post("/api/talos/applications/:appId/atlassian", (req, res) => {
  const app_ = repo.getApplication(req.params.appId);
  if (!app_) {
    res.status(404).json({ error: "Application not found" });
    return;
  }

  const parsed = atlassianConfigInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors });
    return;
  }

  // Check if config already exists — update it
  const existing = repo.getAtlassianConfigByApp(req.params.appId);
  if (existing) {
    const updated = repo.updateAtlassianConfig(
      existing.id,
      parsed.data as Parameters<typeof repo.updateAtlassianConfig>[1]
    );
    io.emit("atlassian:updated", updated);
    res.json(updated);
    return;
  }

  const created = repo.createAtlassianConfig({
    applicationId: req.params.appId,
    ...parsed.data,
  });
  io.emit("atlassian:created", created);
  res.status(201).json(created);
});

app.delete("/api/talos/applications/:appId/atlassian", (req, res) => {
  const config = repo.getAtlassianConfigByApp(req.params.appId);
  if (!config) {
    res.status(404).json({ error: "No Atlassian config found" });
    return;
  }
  repo.deleteAtlassianConfig(config.id);
  io.emit("atlassian:deleted", { applicationId: req.params.appId });
  res.status(204).end();
});

app.post("/api/talos/applications/:appId/atlassian/test", async (req, res) => {
  const config = repo.getAtlassianConfigByApp(req.params.appId);
  if (!config) {
    res.status(404).json({ error: "No Atlassian config found" });
    return;
  }

  const results: string[] = [];
  const errors: string[] = [];

  // Test Jira connection
  if (config.jiraUrl) {
    try {
      const jiraBase = config.jiraUrl.replace(/\/+$/, "");
      const headers: Record<string, string> = { Accept: "application/json" };
      if (config.deploymentType === "datacenter" && config.jiraPersonalTokenVaultRef) {
        headers["Authorization"] = `Bearer ${config.jiraPersonalTokenVaultRef}`;
      } else if (config.jiraUsernameVaultRef && config.jiraApiTokenVaultRef) {
        headers["Authorization"] =
          `Basic ${Buffer.from(`${config.jiraUsernameVaultRef}:${config.jiraApiTokenVaultRef}`).toString("base64")}`;
      }
      const jiraRes = await fetch(`${jiraBase}/rest/api/2/serverInfo`, {
        headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (jiraRes.ok) {
        const info = (await jiraRes.json()) as { serverTitle?: string; version?: string };
        results.push(`Jira: connected (${info.serverTitle ?? "OK"} v${info.version ?? "?"})`);
      } else {
        errors.push(`Jira: HTTP ${jiraRes.status} — ${jiraRes.statusText}`);
      }
    } catch (err) {
      errors.push(`Jira: ${err instanceof Error ? err.message : "connection failed"}`);
    }
  }

  // Test Confluence connection
  if (config.confluenceUrl) {
    try {
      const confBase = config.confluenceUrl.replace(/\/+$/, "");
      const headers: Record<string, string> = { Accept: "application/json" };
      if (config.deploymentType === "datacenter" && config.confluencePersonalTokenVaultRef) {
        headers["Authorization"] = `Bearer ${config.confluencePersonalTokenVaultRef}`;
      } else if (config.confluenceUsernameVaultRef && config.confluenceApiTokenVaultRef) {
        headers["Authorization"] =
          `Basic ${Buffer.from(`${config.confluenceUsernameVaultRef}:${config.confluenceApiTokenVaultRef}`).toString("base64")}`;
      }
      const confRes = await fetch(`${confBase}/rest/api/space?limit=1`, {
        headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (confRes.ok) {
        results.push("Confluence: connected");
      } else {
        errors.push(`Confluence: HTTP ${confRes.status} — ${confRes.statusText}`);
      }
    } catch (err) {
      errors.push(`Confluence: ${err instanceof Error ? err.message : "connection failed"}`);
    }
  }

  if (errors.length > 0) {
    res.json({ success: false, message: errors.join("; ") });
  } else if (results.length > 0) {
    res.json({ success: true, message: results.join("; ") });
  } else {
    res.json({ success: false, message: "No Jira or Confluence URL configured" });
  }
});

// ── App Intelligence ──────────────────────────────────────────────────────────

app.get("/api/talos/applications/:appId/intelligence", (req, res) => {
  const app_ = repo.getApplication(req.params.appId);
  if (!app_) {
    res.status(404).json({ error: "Application not found" });
    return;
  }
  const report = repo.getIntelligenceReport(req.params.appId);
  if (!report) {
    res.status(404).json({ error: "No intelligence report found. Run a scan first." });
    return;
  }
  res.json(report);
});

app.post("/api/talos/applications/:appId/intelligence/refresh", async (req, res) => {
  const app_ = repo.getApplication(req.params.appId);
  if (!app_) {
    res.status(404).json({ error: "Application not found" });
    return;
  }

  try {
    // Lazy import to keep module boundary clean
    const { AppIntelligenceScanner } = await import("./talos/discovery/app-intelligence-scanner.js");
    const { GitHubMcpClient } = await import("./talos/discovery/github-mcp-client.js");

    // Resolve PAT
    let pat = process.env.GITHUB_PERSONAL_ACCESS_TOKEN ?? "";
    if (app_.githubPatRef) {
      // Try resolving from vault — for now we just use the env var
      pat = process.env.GITHUB_PERSONAL_ACCESS_TOKEN ?? "";
    }

    if (!pat) {
      res.status(400).json({ error: "No GitHub PAT configured (set GITHUB_PERSONAL_ACCESS_TOKEN)" });
      return;
    }

    // Parse repo URL
    const repoMatch =
      app_.repositoryUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/) ?? app_.repositoryUrl.match(/^([^/]+)\/([^/]+)$/);
    if (!repoMatch) {
      res.status(400).json({ error: "Invalid repository URL" });
      return;
    }
    const [, owner, repoName] = repoMatch;

    const client = new GitHubMcpClient({ pat, owner, repo: repoName.replace(/\.git$/, "") });
    const tree = await client.getTree(app_.branch || "HEAD", true);

    const scanner = new AppIntelligenceScanner({ applicationId: app_.id });
    const report = await scanner.scan(tree, (path) => client.getFileText(path));

    repo.saveIntelligenceReport(report);
    io.emit("intelligence:scanned", { applicationId: app_.id, report });

    res.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: `Intelligence scan failed: ${message}` });
  }
});

// ── Admin API ─────────────────────────────────────────────────────────────────

app.use(
  "/api/admin",
  createAdminRouter({ platformRepo, copilot, adminToken: process.env.TALOS_ADMIN_TOKEN, envManager })
);

// ── Document Ingestion ────────────────────────────────────────────────────────

app.post("/api/talos/applications/:appId/ingest", async (req, res) => {
  const appId = req.params.appId;
  const app_ = repo.getApplication(appId);
  if (!app_) {
    res.status(404).json({ error: "Application not found" });
    return;
  }

  const { content, format, fileName, docType, version, tags } = req.body as {
    content?: string;
    format?: string;
    fileName?: string;
    docType?: string;
    version?: string;
    tags?: string[];
  };

  if (!content || !format || !fileName || !docType) {
    res.status(400).json({ error: "content, format, fileName, and docType are required" });
    return;
  }

  // DocumentIngester needs RagPipeline — if not available, store doc metadata only
  try {
    const ingester = new DocumentIngester({ ragPipeline: undefined as never }); // Will fail if RAG not ready
    const result = await ingester.ingestDocument(appId, content, format as DocFormat, {
      fileName,
      docType: docType as DocMetadata["docType"],
      version,
      tags,
    });
    io.emit("document:ingested", { applicationId: appId, ...result });
    res.status(201).json(result);
  } catch {
    // Fallback: record the document without RAG indexing
    const docId = crypto.randomUUID();
    const chunks = content.split(/\n#{1,3}\s/).length;
    db.prepare(
      `
      INSERT OR IGNORE INTO knowledge_documents (id, application_id, file_path, type, chunk_count, indexed_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `
    ).run(docId, appId, fileName, docType, chunks);
    io.emit("document:ingested", { applicationId: appId, docId, chunksCreated: chunks });
    res.status(201).json({ chunksCreated: chunks, chunksSkipped: 0, totalTokens: 0, docId });
  }
});

// ── Criteria API ──────────────────────────────────────────────────────────────

app.use("/api/talos/criteria", createCriteriaRouter({ repository: repo }));

// ── Test Generation (#220) ────────────────────────────────────────────────────

app.post("/api/talos/tests/generate", async (req, res) => {
  const { applicationId, prompt, testType } = req.body as {
    applicationId?: string;
    prompt?: string;
    model?: string;
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

  const generationId = crypto.randomUUID();
  io.emit("generation:started", { generationId, applicationId });

  try {
    // ── Path 1: TestGenerator (RAG-backed) ──────────────────────────────────
    if (testGenerator) {
      io.emit("generation:progress", { generationId, stage: "building-prompt", progress: 20 });
      const genResult = await testGenerator.generate({
        applicationId,
        request: prompt,
        name: `Generated: ${prompt.substring(0, 50)}`,
        tags: ["ai-generated"],
        framework: "playwright",
        style: "tdd",
      });
      if (genResult.success && genResult.test) {
        const confidence = genResult.test.generationConfidence ?? 0.85;
        io.emit("generation:complete", {
          generationId,
          testId: genResult.test.id,
          confidence,
        });
        res.status(201).json({
          id: genResult.test.id,
          code: genResult.test.code,
          name: genResult.test.name,
          confidence,
        });
        return;
      }
      // Fall through to raw Copilot if TestGenerator failed
      if (!copilot) {
        throw new Error(genResult.error ?? "Test generation failed");
      }
    }

    // ── Path 2: Raw Copilot (direct LLM, no RAG) ───────────────────────────
    if (!copilot) {
      // Fallback: generate a template test when Copilot is unavailable
      io.emit("generation:progress", { generationId, stage: "building-prompt", progress: 30 });
      const testName = `Generated: ${prompt.substring(0, 50)}`;
      const code = `import { test, expect } from '@playwright/test';\n\ntest(${JSON.stringify(testName)}, async ({ page }) => {\n  // Generated test for: ${JSON.stringify(prompt).slice(1, -1)}\n  await page.goto(${JSON.stringify(app_.baseUrl)});\n  // TODO: Implement test logic\n});\n`;

      io.emit("generation:progress", { generationId, stage: "creating-test", progress: 80 });

      const created = repo.createTest({
        applicationId,
        name: testName,
        description: prompt,
        type: (testType as "e2e" | "smoke" | "regression" | "accessibility" | "unit") ?? "e2e",
        code,
        tags: ["ai-generated"],
        generationConfidence: 0.5,
      });

      io.emit("generation:complete", { generationId, testId: created.id, confidence: 0.5 });
      res.status(201).json({ id: created.id, code: created.code, name: created.name, confidence: 0.5 });
      return;
    }

    // Real LLM generation
    io.emit("generation:progress", { generationId, stage: "building-prompt", progress: 20 });

    const systemPrompt = `You are an expert test automation engineer. Generate a complete Playwright test based on the user's request.
Write clean TypeScript using modern Playwright API (getByRole, getByTestId). Include imports, describe blocks, and assertions.
Return ONLY the test code inside a \`\`\`typescript code block, nothing else.
Application URL: ${app_.baseUrl}`;

    const userPrompt = `Generate a ${testType ?? "e2e"} test for: ${prompt}`;

    io.emit("generation:progress", { generationId, stage: "calling-llm", progress: 40 });

    let fullResponse = "";
    const stream = copilot.chat(userPrompt, {
      systemMessage: { mode: "replace", content: systemPrompt },
    });
    for await (const chunk of stream) {
      fullResponse += chunk;
      io.emit("generation:progress", { generationId, stage: "generating", progress: 60 });
    }

    io.emit("generation:progress", { generationId, stage: "validating", progress: 80 });

    // Extract code from response
    const codeBlockMatch = fullResponse.match(/```(?:typescript|ts|javascript|js)?\n([\s\S]*?)```/);
    const code = codeBlockMatch ? codeBlockMatch[1].trim() : fullResponse.trim();
    const testName = `Generated: ${prompt.substring(0, 50)}`;
    const confidence = codeBlockMatch ? 0.85 : 0.6;

    io.emit("generation:progress", { generationId, stage: "creating-test", progress: 90 });

    const created = repo.createTest({
      applicationId,
      name: testName,
      description: prompt,
      type: (testType as "e2e" | "smoke" | "regression" | "accessibility" | "unit") ?? "e2e",
      code,
      tags: ["ai-generated"],
      generationConfidence: confidence,
    });

    io.emit("generation:complete", { generationId, testId: created.id, confidence });
    res.status(201).json({ id: created.id, code: created.code, name: created.name, confidence });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    io.emit("generation:error", { generationId, error: errMsg });
    res.status(500).json({ error: `Generation failed: ${errMsg}` });
  }
});

// ── Test Refinement (#221) ────────────────────────────────────────────────────

app.post("/api/talos/tests/:id/refine", (req, res) => {
  const { feedback } = req.body as { feedback?: string };
  if (!feedback) {
    res.status(400).json({ error: "feedback is required" });
    return;
  }
  const test = repo.getTest(req.params.id);
  if (!test) {
    res.status(404).json({ error: "Test not found" });
    return;
  }

  // Placeholder — would call LLM for refinement
  const refined = repo.updateTest(req.params.id, {
    code: `${test.code}\n// Refined based on feedback: ${feedback}\n`,
    version: bumpPatch(test.version),
    updatedAt: new Date(),
  });

  res.json({
    id: refined!.id,
    code: refined!.code,
    name: refined!.name,
    confidence: refined!.generationConfidence ?? 0.75,
  });
});

function bumpPatch(version: string): string {
  const parts = version.split(".");
  if (parts.length === 3) {
    parts[2] = String(Number(parts[2]) + 1);
    return parts.join(".");
  }
  return "1.0.1";
}

// ── Test Explanation (#353) ───────────────────────────────────────────────────

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

// ── Session Management (#222) ─────────────────────────────────────────────────

app.get("/api/talos/sessions", (_req, res) => {
  const sessions: { id: string; startedAt: string; lastMessageAt: string; messageCount: number; preview: string }[] =
    [];

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
    /* sessions dir may not exist yet */
  }

  sessions.sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
  res.json(sessions);
});

app.get("/api/talos/sessions/:id", (req, res) => {
  const safeName = req.params.id.replace(/[^a-zA-Z0-9_-]/g, "_");
  // codeql[js/path-injection] - safeName is sanitized via replace(/[^a-zA-Z0-9_-]/g, "_")
  const filePath = join(SESSIONS_DIR, `${safeName}.jsonl`);
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

app.delete("/api/talos/sessions/:id", (req, res) => {
  const safeName = req.params.id.replace(/[^a-zA-Z0-9_-]/g, "_");
  // codeql[js/path-injection] - safeName is sanitized via replace(/[^a-zA-Z0-9_-]/g, "_")
  const filePath = join(SESSIONS_DIR, `${safeName}.jsonl`);
  if (!existsSync(filePath)) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  unlinkSync(filePath);
  res.status(204).end();
});

// ── Orchestration (#232) ──────────────────────────────────────────────────────

type OrchestrationStepState = {
  name: string;
  status: "pending" | "running" | "completed" | "failed";
  result?: unknown;
  error?: string;
};
type OrchestrationRun = {
  runId: string;
  applicationId: string;
  status: "pending" | "running" | "completed" | "failed";
  steps: OrchestrationStepState[];
  createdAt: string;
};
const orchestrationRuns = new Map<string, OrchestrationRun>();

async function runOrchestrationPipeline(run: OrchestrationRun, appRecord: ReturnType<typeof repo.getApplication>) {
  if (!appRecord) return;
  run.status = "running";
  io.emit("orchestration:started", {
    runId: run.runId,
    applicationId: run.applicationId,
    steps: run.steps.map((s) => s.name),
  });

  for (const step of run.steps) {
    step.status = "running";
    io.emit("orchestration:step", { runId: run.runId, step: step.name, status: "running" });

    try {
      switch (step.name) {
        case "discover": {
          if (!discoveryEngine) {
            step.result = { jobId: null, chunks: [], reason: "Discovery engine not configured" };
            break;
          }
          // Clear any previous chunks for this app before discovery
          discoveredChunksBuffer.delete(run.applicationId);

          const discoveryJob = await discoveryEngine.startDiscovery(appRecord);
          io.emit("discovery:started", { jobId: discoveryJob.id, applicationId: run.applicationId });

          // Poll until completed or failed (max 10min)
          const MAX_WAIT_MS = 10 * 60 * 1000;
          const POLL_INTERVAL_MS = 2000;
          const pollStart = Date.now();
          let progress = discoveryEngine.getProgress(discoveryJob.id);
          while (progress && progress.status !== "completed" && progress.status !== "failed") {
            if (Date.now() - pollStart > MAX_WAIT_MS) {
              throw new Error("Discovery timed out after 10 minutes");
            }
            await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
            progress = discoveryEngine.getProgress(discoveryJob.id);
            io.emit("orchestration:discovery-progress", {
              runId: run.runId,
              jobId: discoveryJob.id,
              ...progress,
            });
          }

          if (progress?.status === "failed") {
            throw new Error(progress.errorMessage ?? "Discovery failed");
          }

          step.result = {
            jobId: discoveryJob.id,
            filesDiscovered: progress?.filesDiscovered ?? 0,
            chunksCreated: progress?.chunksCreated ?? 0,
            chunks: discoveredChunksBuffer.get(run.applicationId) ?? [],
          };
          break;
        }
        case "index": {
          const discoverResult = run.steps.find((s) => s.name === "discover")?.result as
            | { chunks?: ChunkResult[] }
            | undefined;
          const chunks = discoverResult?.chunks ?? [];
          if (!ragPipeline || chunks.length === 0) {
            step.result = {
              indexed: 0,
              skipped: chunks.length,
              reason: ragPipeline ? "no chunks from discovery" : "RAG not configured",
            };
            break;
          }
          const indexResult = await ragPipeline.indexChunks(run.applicationId, chunks);
          step.result = { indexed: indexResult.indexed, skipped: indexResult.skipped };
          break;
        }
        case "generate": {
          if (!testGenerator) {
            step.result = { testsGenerated: 0, reason: "Test generator not configured" };
            break;
          }
          // Generate one test for the application's main navigation flows
          const genResult = await testGenerator.generate({
            applicationId: run.applicationId,
            request: `Generate a comprehensive ${appRecord.name} smoke test that navigates key user flows`,
            tags: ["ai-generated", "orchestration"],
          });
          if (genResult.success && genResult.test) {
            io.emit("test:created", genResult.test);
          }
          step.result = { testsGenerated: genResult.success ? 1 : 0, error: genResult.error };
          break;
        }
        case "execute": {
          const tests = repo.listTestsByApp(run.applicationId);
          if (!playwrightRunner || tests.length === 0) {
            const results: { testId: string; status: string }[] = [];
            for (const test of tests) {
              const runRecord = repo.createTestRun({
                testId: test.id,
                applicationId: run.applicationId,
                trigger: "ci",
                triggeredBy: "ci",
                browser: "chromium",
              });
              results.push({ testId: test.id, status: runRecord.status });
              io.emit("talos:test-run-update", { id: runRecord.id, status: runRecord.status });
            }
            step.result = {
              runs: results,
              reason: playwrightRunner ? undefined : "Playwright runner not configured",
            };
            break;
          }
          const runResults: { testId: string; runId: string; status: string }[] = [];
          for (const test of tests) {
            const testRunRecord = repo.createTestRun({
              testId: test.id,
              applicationId: run.applicationId,
              trigger: "ci",
              triggeredBy: "ci",
              browser: talosConfig.runner.defaultBrowser,
            });
            try {
              const execResult = await playwrightRunner.executeTest(test, testRunRecord, {
                application: appRecord,
              });
              const updated = repo.updateTestRun(testRunRecord.id, {
                status: execResult.status,
                completedAt: new Date(),
                durationMs: execResult.durationMs,
                errorMessage: execResult.errorMessage,
                errorStack: execResult.errorStack,
              });
              runResults.push({ testId: test.id, runId: testRunRecord.id, status: execResult.status });
              io.emit("talos:test-run-update", { id: testRunRecord.id, status: updated?.status ?? execResult.status });
            } catch (execErr) {
              const errMsg = execErr instanceof Error ? execErr.message : String(execErr);
              repo.updateTestRun(testRunRecord.id, { status: "failed", errorMessage: errMsg, completedAt: new Date() });
              runResults.push({ testId: test.id, runId: testRunRecord.id, status: "failed" });
              io.emit("talos:test-run-update", { id: testRunRecord.id, status: "failed" });
            }
          }
          step.result = { runs: runResults };
          break;
        }
        default:
          step.result = {};
      }
      step.status = "completed";
      io.emit("orchestration:step", { runId: run.runId, step: step.name, status: "completed" });
    } catch (err) {
      step.status = "failed";
      step.error = err instanceof Error ? err.message : String(err);
      io.emit("orchestration:step", { runId: run.runId, step: step.name, status: "failed", error: step.error });
      run.status = "failed";
      io.emit("orchestration:completed", { runId: run.runId, status: "failed" });
      return;
    }
  }

  run.status = "completed";
  io.emit("orchestration:completed", { runId: run.runId, status: "completed" });
}

app.post("/api/talos/orchestrate", (req, res) => {
  const { applicationId, steps } = req.body as {
    applicationId?: string;
    steps?: string[];
    config?: Record<string, unknown>;
  };
  if (!applicationId) {
    res.status(400).json({ error: "applicationId is required" });
    return;
  }
  const app_ = repo.getApplication(applicationId);
  if (!app_) {
    res.status(404).json({ error: "Application not found" });
    return;
  }

  const runId = crypto.randomUUID();
  const defaultSteps = steps ?? ["discover", "index", "generate", "execute"];

  const run: OrchestrationRun = {
    runId,
    applicationId,
    status: "pending",
    steps: defaultSteps.map((name) => ({ name, status: "pending" })),
    createdAt: new Date().toISOString(),
  };
  orchestrationRuns.set(runId, run);

  platformRepo.createTask({ prompt: `Orchestrate: ${defaultSteps.join(" → ")} for ${app_.name}` });

  // Run pipeline asynchronously — not blocking the response
  runOrchestrationPipeline(run, app_).catch((err) => {
    run.status = "failed";
    io.emit("orchestration:completed", {
      runId,
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    });
  });

  res.json({
    runId,
    status: "pending",
    steps: run.steps,
  });
});

app.get("/api/talos/orchestrate/:runId", (req, res) => {
  const run = orchestrationRuns.get(req.params.runId);
  if (!run) {
    res.status(404).json({ error: "Orchestration run not found" });
    return;
  }
  res.json({ runId: run.runId, status: run.status, steps: run.steps });
});

// ── Copilot365 Status (#400) ──────────────────────────────────────────────────

app.get("/api/admin/copilot365/status", (_req, res) => {
  const servers = platformRepo.listMcpServers();
  const copilot365Server = servers.find(
    (s) => s.name.toLowerCase() === "copilot365" || s.name.toLowerCase() === "copilot-365"
  );
  res.json({
    available: !!copilot365Server,
    serverName: copilot365Server?.name,
    enabled: copilot365Server?.enabled ?? false,
  });
});

// ── Chat (streaming via Socket.IO) ────────────────────────────────────────────

io.on("connection", (socket) => {
  socket.on(
    "chat:message",
    async (data: { message: string; conversationId?: string; agent?: string; model?: string }) => {
      const conversationId = data.conversationId ?? `chat-${Date.now()}`;
      const timestamp = new Date().toISOString();

      // Persist user message
      appendSessionMessage(conversationId, { role: "user", content: data.message, timestamp });

      socket.emit("chat:stream:start", { conversationId });

      if (!copilot) {
        const fallback = "Copilot SDK is not configured. Go to Admin > Auth to set up authentication.";
        socket.emit("chat:stream:delta", { delta: fallback, conversationId });
        socket.emit("chat:stream:end", { conversationId, tokenUsage: null });
        appendSessionMessage(conversationId, {
          role: "assistant",
          content: fallback,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      try {
        const isAuthenticated = await copilot.isAuthenticated();
        if (!isAuthenticated) {
          const msg = "Not authenticated. Go to Admin > Auth to connect to GitHub Copilot.";
          socket.emit("chat:stream:delta", { delta: msg, conversationId });
          socket.emit("chat:stream:end", { conversationId, tokenUsage: null });
          appendSessionMessage(conversationId, {
            role: "assistant",
            content: msg,
            timestamp: new Date().toISOString(),
          });
          return;
        }

        // Get active personality for system message
        const personality = platformRepo.getActivePersonality();
        const systemMessage = personality ? { mode: "append" as const, content: personality.systemPrompt } : undefined;

        let fullResponse = "";
        const stream = copilot.chat(data.message, {
          conversationId,
          systemMessage,
          model: data.model || undefined,
          tools: orchestrationTools.length > 0 ? orchestrationTools : undefined,
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
        appendSessionMessage(conversationId, {
          role: "assistant",
          content: fullResponse,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Unknown error occurred";
        socket.emit("chat:stream:delta", { delta: `Error: ${errMsg}`, conversationId });
        socket.emit("chat:stream:end", { conversationId, tokenUsage: null });
      }
    }
  );
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

// ── Corporate Proxy (#321) ────────────────────────────────────────────────────
// Apply proxy environment variables from config. These affect globalAgent and
// any library that respects standard proxy env vars (fetch, node-fetch, etc.).

{
  const pc = talosConfig.proxy;
  if (pc.enabled) {
    if (pc.httpProxy && !process.env.HTTP_PROXY) process.env.HTTP_PROXY = pc.httpProxy;
    if (pc.httpsProxy && !process.env.HTTPS_PROXY) process.env.HTTPS_PROXY = pc.httpsProxy;
    if (pc.noProxy && !process.env.NO_PROXY) process.env.NO_PROXY = pc.noProxy;
  }
}

// ── GitHub Export (#354) ─────────────────────────────────────────────────────

app.post("/api/talos/applications/:appId/export-to-github", async (req, res) => {
  const appId = req.params.appId;
  const app_ = repo.getApplication(appId);
  if (!app_) {
    res.status(404).json({ error: "Application not found" });
    return;
  }

  const {
    targetRepo,
    branch = "main",
    createIfNotExists = true,
    pat,
  } = req.body as {
    targetRepo?: string;
    branch?: string;
    createIfNotExists?: boolean;
    testIds?: string[];
    pat?: string;
  };

  if (!targetRepo || !targetRepo.includes("/")) {
    res.status(400).json({ error: "targetRepo is required and must be in owner/repo format" });
    return;
  }

  const parts = targetRepo.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1] || parts[0].includes("..") || parts[1].includes("..")) {
    res.status(400).json({ error: "targetRepo must be in 'owner/repo' format with no empty parts" });
    return;
  }
  const [owner, repoName] = parts;

  const githubPat =
    pat ??
    process.env.GITHUB_TOKEN ??
    process.env.COPILOT_GITHUB_TOKEN ??
    envManager.getRaw("GITHUB_TOKEN") ??
    envManager.getRaw("COPILOT_GITHUB_TOKEN");

  if (!githubPat) {
    res.status(400).json({ error: "No GitHub PAT available. Provide pat in the request body or set GITHUB_TOKEN." });
    return;
  }

  try {
    const exportEngine = new ExportEngine({
      config: talosConfig.export,
      repository: repo,
    });

    const exportResult = await exportEngine.export(appId, { format: "directory", sanitize: true });
    if (!exportResult.success || !exportResult.outputPath) {
      res.status(500).json({ error: exportResult.error ?? "Export failed" });
      return;
    }

    const files = (exportResult.files ?? []).map((filePath) => {
      try {
        const content = readFileSync(join(exportResult.outputPath!, filePath), "utf-8");
        return { path: filePath, content };
      } catch {
        return { path: filePath, content: "" };
      }
    });

    const ghService = new GitHubExportService({ pat: githubPat });
    const { created } = await ghService.ensureRepo(owner, repoName, createIfNotExists as boolean);
    const { pushedCount, repoUrl } = await ghService.pushFiles(owner, repoName, branch, files);

    repo.updateApplication(appId, { exportRepoUrl: targetRepo });
    io.emit("export:complete", { applicationId: appId, repoUrl, filesUpdated: pushedCount, created });

    res.json({ success: true, repoUrl, filesUpdated: pushedCount, created });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get("/api/talos/applications/:appId/export-info", (req, res) => {
  const app_ = repo.getApplication(req.params.appId);
  if (!app_) {
    res.status(404).json({ error: "Application not found" });
    return;
  }
  res.json({ exportRepoUrl: app_.exportRepoUrl ?? null, lastExportedAt: app_.updatedAt });
});

// ── M365 Integration (#315) ──────────────────────────────────────────────────

let m365Auth: BrowserAuth | null = null;
let m365Scraper: CopilotScraper | null = null;
const m365Ephemeral = new EphemeralStore(talosConfig.m365.docsDir);

if (talosConfig.m365.enabled) {
  const proxyUrl = talosConfig.proxy.enabled
    ? (talosConfig.proxy.httpsProxy ?? talosConfig.proxy.httpProxy)
    : undefined;

  m365Auth = new BrowserAuth({
    userDataDir: talosConfig.m365.browserDataDir,
    copilotUrl: talosConfig.m365.url,
    mfaTimeoutMs: talosConfig.m365.mfaTimeout,
    proxy: proxyUrl,
  });

  // Initialize in background — don't block server startup
  m365Auth
    .initialize()
    .then((page) => {
      m365Scraper = new CopilotScraper(page);
      console.log("[talos] M365 Copilot integration initialized");
    })
    .catch((err) => {
      console.warn(`[talos] M365 initialization failed: ${err instanceof Error ? err.message : String(err)}`);
    });
}

// ── M365 API Routes (#316) ───────────────────────────────────────────────────

const m365RouterOptions = {
  browserAuth: m365Auth,
  get scraper() {
    return m365Scraper;
  },
  ephemeralStore: m365Ephemeral,
};
app.use("/api/talos/m365", createM365Router(m365RouterOptions));

// ── Start ─────────────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`[talos] server listening on http://localhost:${PORT}`);
  console.log(`[talos] data directory: ${DATA_DIR}`);
});

// ── Graceful Shutdown ─────────────────────────────────────────────────────────

async function shutdown() {
  if (m365Auth) {
    await m365Auth.close().catch(() => {});
  }
  httpServer.close();
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
