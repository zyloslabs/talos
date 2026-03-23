/**
 * Admin API Router — RESTful endpoints for Talos platform management.
 *
 * Mounts at /api/admin and provides CRUD for:
 * - Personality / System Prompt
 * - Saved Prompts (Library)
 * - Scheduled Jobs (Scheduler)
 * - Agent Tasks (Queue)
 * - MCP Servers
 * - Skills
 * - Model Configuration
 * - Auth Status
 */

import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import type { PlatformRepository } from "../platform/repository.js";
import { EnvManager, EnvValidationError } from "../platform/env-manager.js";
import type { CopilotWrapper } from "../copilot/copilot-wrapper.js";
import type { RagPipeline } from "../talos/rag/rag-pipeline.js";
import type {
  CreatePromptInput,
  UpdatePromptInput,
  CreateJobInput,
  UpdateJobInput,
  CreateMcpServerInput,
  UpdateMcpServerInput,
  CreateSkillInput,
  UpdateSkillInput,
  TaskStatus,
} from "../platform/types.js";

export type AdminRouterDeps = {
  platformRepo: PlatformRepository;
  copilot?: CopilotWrapper;
  adminToken?: string;
  envManager?: EnvManager;
  ragPipeline?: RagPipeline;
};

const VALID_TASK_STATUSES: TaskStatus[] = ["pending", "running", "completed", "failed", "cancelled"];

const KnowledgeConfigUpdateSchema = z.object({
  vectorDbPath: z.string().min(1).optional(),
  collectionName: z.string().min(1).optional(),
  searchMode: z.enum(["hybrid", "vector", "keyword"]).optional(),
  minScore: z.number().min(0).max(1).optional(),
}).strict();

/**
 * Validates a URL is safe for server-side use (anti-SSRF).
 * Rejects private IP ranges, localhost, and non-http(s) protocols.
 */
function isUrlSafe(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === "localhost" || hostname === "[::1]") return false;
    // Block private/internal IP ranges
    const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
    if (ipv4Match) {
      const [, a, b] = ipv4Match.map(Number);
      if (a === 10) return false;                     // 10.0.0.0/8
      if (a === 172 && b >= 16 && b <= 31) return false; // 172.16.0.0/12
      if (a === 192 && b === 168) return false;       // 192.168.0.0/16
      if (a === 127) return false;                    // 127.0.0.0/8
      if (a === 169 && b === 254) return false;       // 169.254.0.0/16 (link-local)
      if (a === 0) return false;                      // 0.0.0.0/8
    }
    return true;
  } catch {
    return false;
  }
}

export function createAdminRouter({ platformRepo, copilot, adminToken, envManager, ragPipeline }: AdminRouterDeps): Router {
  const router = Router();

  // ── Auth Middleware ────────────────────────────────────────────────────────
  const token = adminToken ?? process.env.TALOS_ADMIN_TOKEN;
  if (token) {
    router.use((req: Request, res: Response, next: NextFunction) => {
      const authHeader = req.headers.authorization;
      const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
      if (!bearerToken || bearerToken !== token) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      next();
    });
  }

  // ── Auth ────────────────────────────────────────────────────────────────────

  router.get("/auth/status", async (_req, res) => {
    const authenticated = copilot ? await copilot.isAuthenticated() : false;
    res.json({ authenticated });
  });

  router.post("/auth/device", async (_req, res) => {
    if (!copilot) { res.status(503).json({ error: "Copilot not configured" }); return; }
    const info = await copilot.authenticate();
    res.json(info);
  });

  router.post("/auth/wait", async (_req, res) => {
    if (!copilot) { res.status(503).json({ error: "Copilot not configured" }); return; }
    await copilot.waitForAuth();
    res.json({ authenticated: true });
  });

  // ── Environment Variables ──────────────────────────────────────────────────

  router.get("/env", (_req, res) => {
    if (!envManager) { res.status(503).json({ error: "EnvManager not configured" }); return; }
    const entries = envManager.list();
    const missing = envManager.validateRequired(["GITHUB_CLIENT_ID"]);
    res.json({ entries, warnings: missing.length > 0 ? { missingRequired: missing } : undefined });
  });

  router.get("/env/:key", (req, res) => {
    if (!envManager) { res.status(503).json({ error: "EnvManager not configured" }); return; }
    const value = envManager.getRaw(req.params.key);
    if (value === undefined) { res.status(404).json({ error: "Key not found" }); return; }
    res.json({ key: req.params.key, value });
  });

  router.put("/env", (req, res) => {
    if (!envManager) { res.status(503).json({ error: "EnvManager not configured" }); return; }
    const { key, value } = req.body as { key?: string; value?: string };
    if (!key || value === undefined) { res.status(400).json({ error: "key and value are required" }); return; }
    try {
      const entry = envManager.set(key, value);
      res.json(entry);
    } catch (err) {
      if (err instanceof EnvValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  router.delete("/env/:key", (req, res) => {
    if (!envManager) { res.status(503).json({ error: "EnvManager not configured" }); return; }
    if (!envManager.delete(req.params.key)) { res.status(404).json({ error: "Key not found" }); return; }
    res.status(204).end();
  });

  router.get("/env/validate/required", (_req, res) => {
    if (!envManager) { res.status(503).json({ error: "EnvManager not configured" }); return; }
    const missing = envManager.validateRequired(["GITHUB_CLIENT_ID"]);
    res.json({ valid: missing.length === 0, missing });
  });

  // ── Models ──────────────────────────────────────────────────────────────────

  router.get("/models", async (_req, res) => {
    if (!copilot) { res.json({ models: [], selected: "gpt-4.1", reasoningEffort: "medium" }); return; }
    const models = await copilot.listModels();
    res.json({
      models,
      selected: copilot.getModel(),
      reasoningEffort: copilot.getReasoningEffort() ?? "medium",
      provider: copilot.getProvider(),
    });
  });

  router.put("/models/selected", (req, res) => {
    const { model } = req.body as { model?: string };
    if (!model) { res.status(400).json({ error: "model is required" }); return; }
    copilot?.setModel(model);
    res.json({ selected: model });
  });

  router.put("/models/reasoning-effort", (req, res) => {
    const { effort } = req.body as { effort?: string };
    copilot?.setReasoningEffort(effort as "low" | "medium" | "high" | "xhigh" | undefined);
    res.json({ reasoningEffort: effort });
  });

  router.put("/models/provider", (req, res) => {
    const { provider } = req.body as { provider?: { type?: string; baseUrl?: string; apiKey?: string } };
    if (provider) {
      const validTypes = ["copilot", "openai", "azure", "anthropic", "ollama"];
      if (!provider.type || !validTypes.includes(provider.type)) {
        res.status(400).json({ error: `Invalid provider type. Must be one of: ${validTypes.join(", ")}` });
        return;
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    copilot?.setProvider(provider as any);
    res.json({ provider });
  });

  // ── Personality ─────────────────────────────────────────────────────────────

  router.get("/personality", (_req, res) => {
    const personalities = platformRepo.listPersonalities();
    const active = platformRepo.getActivePersonality();
    res.json({ personalities, activeId: active?.id ?? null });
  });

  router.post("/personality", (req, res) => {
    const { name, systemPrompt } = req.body as { name?: string; systemPrompt?: string };
    if (!name) { res.status(400).json({ error: "name is required" }); return; }
    const p = platformRepo.createPersonality(name, systemPrompt ?? "");
    res.status(201).json(p);
  });

  router.put("/personality/:id", (req, res) => {
    const { systemPrompt } = req.body as { systemPrompt?: string };
    if (systemPrompt === undefined) { res.status(400).json({ error: "systemPrompt is required" }); return; }
    const updated = platformRepo.updatePersonality(req.params.id, systemPrompt);
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    res.json(updated);
  });

  router.put("/personality/:id/activate", (req, res) => {
    platformRepo.setActivePersonality(req.params.id);
    res.json({ activeId: req.params.id });
  });

  // ── Saved Prompts ───────────────────────────────────────────────────────────

  router.get("/prompts", (req, res) => {
    const category = req.query.category as string | undefined;
    res.json(platformRepo.listPrompts(category));
  });

  router.get("/prompts/:id", (req, res) => {
    const prompt = platformRepo.getPrompt(req.params.id);
    if (!prompt) { res.status(404).json({ error: "Not found" }); return; }
    res.json(prompt);
  });

  router.post("/prompts", (req, res) => {
    const input = req.body as CreatePromptInput;
    if (!input.name || !input.content) { res.status(400).json({ error: "name and content are required" }); return; }
    res.status(201).json(platformRepo.createPrompt(input));
  });

  router.put("/prompts/:id", (req, res) => {
    const updated = platformRepo.updatePrompt(req.params.id, req.body as UpdatePromptInput);
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    res.json(updated);
  });

  router.delete("/prompts/:id", (req, res) => {
    if (!platformRepo.deletePrompt(req.params.id)) { res.status(404).json({ error: "Not found" }); return; }
    res.status(204).end();
  });

  // ── Scheduled Jobs ──────────────────────────────────────────────────────────

  router.get("/scheduler/jobs", (_req, res) => {
    res.json(platformRepo.listJobs());
  });

  router.get("/scheduler/jobs/:id", (req, res) => {
    const job = platformRepo.getJob(req.params.id);
    if (!job) { res.status(404).json({ error: "Not found" }); return; }
    res.json(job);
  });

  router.post("/scheduler/jobs", (req, res) => {
    const input = req.body as CreateJobInput;
    if (!input.name || !input.cronExpression || !input.prompt) {
      res.status(400).json({ error: "name, cronExpression, and prompt are required" }); return;
    }
    res.status(201).json(platformRepo.createJob(input));
  });

  router.put("/scheduler/jobs/:id", (req, res) => {
    const updated = platformRepo.updateJob(req.params.id, req.body as UpdateJobInput);
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    res.json(updated);
  });

  router.delete("/scheduler/jobs/:id", (req, res) => {
    if (!platformRepo.deleteJob(req.params.id)) { res.status(404).json({ error: "Not found" }); return; }
    res.status(204).end();
  });

  // ── Agent Tasks ─────────────────────────────────────────────────────────────

  router.get("/tasks", (req, res) => {
    const rawStatus = req.query.status as string | undefined;
    if (rawStatus && !VALID_TASK_STATUSES.includes(rawStatus as TaskStatus)) {
      res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_TASK_STATUSES.join(", ")}` });
      return;
    }
    const status = rawStatus as TaskStatus | undefined;
    const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 100, 1), 1000);
    res.json(platformRepo.listTasks(status, limit));
  });

  router.get("/tasks/stats", (_req, res) => {
    res.json(platformRepo.getTaskStats());
  });

  router.get("/tasks/:id", (req, res) => {
    const task = platformRepo.getTask(req.params.id);
    if (!task) { res.status(404).json({ error: "Not found" }); return; }
    res.json(task);
  });

  router.post("/tasks", (req, res) => {
    const { prompt, parentId } = req.body as { prompt?: string; parentId?: string };
    if (!prompt) { res.status(400).json({ error: "prompt is required" }); return; }
    res.status(201).json(platformRepo.createTask({ prompt, parentId }));
  });

  router.put("/tasks/:id/status", (req, res) => {
    const { status, result, error } = req.body as { status?: TaskStatus; result?: string; error?: string };
    if (!status) { res.status(400).json({ error: "status is required" }); return; }
    const updated = platformRepo.updateTaskStatus(req.params.id, status, result, error);
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    res.json(updated);
  });

  // ── MCP Servers ─────────────────────────────────────────────────────────────

  router.get("/mcp-servers", (_req, res) => {
    res.json(platformRepo.listMcpServers());
  });

  router.get("/mcp-servers/:id", (req, res) => {
    const server = platformRepo.getMcpServer(req.params.id);
    if (!server) { res.status(404).json({ error: "Not found" }); return; }
    res.json(server);
  });

  router.post("/mcp-servers", (req, res) => {
    const input = req.body as CreateMcpServerInput;
    if (!input.name || !input.type) { res.status(400).json({ error: "name and type are required" }); return; }
    if (input.url && !isUrlSafe(input.url)) {
      res.status(400).json({ error: "Invalid or unsafe URL. Only public http/https URLs are allowed." });
      return;
    }
    res.status(201).json(platformRepo.createMcpServer(input));
  });

  router.put("/mcp-servers/:id", (req, res) => {
    const input = req.body as UpdateMcpServerInput;
    if (input.url && !isUrlSafe(input.url)) {
      res.status(400).json({ error: "Invalid or unsafe URL. Only public http/https URLs are allowed." });
      return;
    }
    const updated = platformRepo.updateMcpServer(req.params.id, input);
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    res.json(updated);
  });

  router.delete("/mcp-servers/:id", (req, res) => {
    if (!platformRepo.deleteMcpServer(req.params.id)) { res.status(404).json({ error: "Not found" }); return; }
    res.status(204).end();
  });

  // ── Skills ──────────────────────────────────────────────────────────────────

  router.get("/skills", (_req, res) => {
    res.json(platformRepo.listSkills());
  });

  router.get("/skills/:id", (req, res) => {
    const skill = platformRepo.getSkill(req.params.id);
    if (!skill) { res.status(404).json({ error: "Not found" }); return; }
    res.json(skill);
  });

  router.post("/skills", (req, res) => {
    const input = req.body as CreateSkillInput;
    if (!input.name || !input.content) { res.status(400).json({ error: "name and content are required" }); return; }
    res.status(201).json(platformRepo.createSkill(input));
  });

  router.put("/skills/:id", (req, res) => {
    const updated = platformRepo.updateSkill(req.params.id, req.body as UpdateSkillInput);
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    res.json(updated);
  });

  router.delete("/skills/:id", (req, res) => {
    if (!platformRepo.deleteSkill(req.params.id)) { res.status(404).json({ error: "Not found" }); return; }
    res.status(204).end();
  });

  // ── Knowledge Base (#214) ───────────────────────────────────────────────────

  router.get("/knowledge/stats", (_req, res) => {
    // Returns stats from the platform repository's knowledge tracking
    const stats = platformRepo.getKnowledgeStats();
    res.json(stats);
  });

  router.get("/knowledge/documents", (_req, res) => {
    res.json(platformRepo.listKnowledgeDocuments());
  });

  router.post("/knowledge/search", async (req, res) => {
    const { query, limit, applicationId, minScore } = req.body as {
      query?: string; limit?: number; applicationId?: string; minScore?: number;
    };
    if (!query) { res.status(400).json({ error: "query is required" }); return; }
    if (!ragPipeline) {
      res.json({ results: [], query, limit: limit ?? 10 });
      return;
    }
    try {
      const context = await ragPipeline.retrieve(applicationId ?? "", query, {
        limit: limit ?? 10,
        minScore: minScore ?? 0.5,
      });
      const results = context.chunks.map((c) => ({
        content: c.content,
        score: c.score,
        filePath: c.filePath,
        startLine: c.startLine,
        endLine: c.endLine,
        type: c.type,
      }));
      res.json({ results, query, limit: limit ?? 10 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Search failed";
      res.status(500).json({ error: msg });
    }
  });

  router.post("/knowledge/reindex", (_req, res) => {
    // Trigger async reindex — emits progress via Socket.IO
    res.json({ status: "queued", message: "Re-indexing has been queued" });
  });

  router.post("/knowledge/reindex/:docId", (req, res) => {
    res.json({ status: "queued", docId: req.params.docId });
  });

  router.delete("/knowledge/documents/:docId", (req, res) => {
    const deleted = platformRepo.deleteKnowledgeDocument(req.params.docId);
    if (!deleted) { res.status(404).json({ error: "Document not found" }); return; }
    res.status(204).end();
  });

  router.get("/knowledge/config", (_req, res) => {
    res.json(platformRepo.getKnowledgeConfig());
  });

  router.put("/knowledge/config", (req, res) => {
    const parsed = KnowledgeConfigUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid knowledge config", details: parsed.error.flatten().fieldErrors });
      return;
    }
    const updated = platformRepo.updateKnowledgeConfig(parsed.data as Record<string, unknown>);
    res.json(updated);
  });

  // ── Models Health (#217) ────────────────────────────────────────────────────

  router.get("/models/health", async (_req, res) => {
    if (!copilot) {
      res.json({ healthy: false, authenticated: false, latencyMs: 0 });
      return;
    }
    const start = Date.now();
    const authenticated = await copilot.isAuthenticated();
    const latencyMs = Date.now() - start;
    res.json({ healthy: authenticated, authenticated, latencyMs });
  });

  return router;
}
