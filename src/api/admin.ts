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
import type { PlatformRepository } from "../platform/repository.js";
import type { CopilotWrapper } from "../copilot/copilot-wrapper.js";
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
};

export function createAdminRouter({ platformRepo, copilot }: AdminRouterDeps): Router {
  const router = Router();

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
    const { provider } = req.body as { provider?: unknown };
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
    const status = req.query.status as TaskStatus | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
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
    res.status(201).json(platformRepo.createMcpServer(input));
  });

  router.put("/mcp-servers/:id", (req, res) => {
    const updated = platformRepo.updateMcpServer(req.params.id, req.body as UpdateMcpServerInput);
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

  return router;
}
