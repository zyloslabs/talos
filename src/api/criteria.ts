/**
 * Criteria API Router — RESTful endpoints for acceptance criteria management.
 *
 * Mounts at /api/talos/criteria and provides:
 * - CRUD for acceptance criteria
 * - AI bulk generation and single-criterion suggestion
 * - Traceability report
 */

import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import type { TalosRepository } from "../talos/repository.js";
import type { CriteriaGenerator } from "../talos/knowledge/criteria-generator.js";

// ── Zod Schemas ───────────────────────────────────────────────────────────────

const ScenarioSchema = z.object({
  given: z.string().min(1),
  when: z.string().min(1),
  then: z.string().min(1),
});

const CreateCriteriaSchema = z.object({
  requirementChunkId: z.string().optional(),
  title: z.string().min(1).max(500),
  description: z.string().max(5000).default(""),
  scenarios: z.array(ScenarioSchema).default([]),
  preconditions: z.array(z.string()).default([]),
  dataRequirements: z.array(z.string()).default([]),
  nfrTags: z.array(z.string()).default([]),
  status: z.enum(["draft", "approved", "implemented", "deprecated"]).default("draft"),
  confidence: z.number().min(0).max(1).default(0),
  tags: z.array(z.string()).default([]),
});

const UpdateCriteriaSchema = z
  .object({
    requirementChunkId: z.string().optional(),
    title: z.string().min(1).max(500).optional(),
    description: z.string().max(5000).optional(),
    scenarios: z.array(ScenarioSchema).optional(),
    preconditions: z.array(z.string()).optional(),
    dataRequirements: z.array(z.string()).optional(),
    nfrTags: z.array(z.string()).optional(),
    status: z.enum(["draft", "approved", "implemented", "deprecated"]).optional(),
    confidence: z.number().min(0).max(1).optional(),
    tags: z.array(z.string()).optional(),
  })
  .strict();

const GenerateSchema = z.object({
  requirementFilter: z.string().optional(),
  maxCriteria: z.number().int().min(1).max(100).default(20),
});

const SuggestSchema = z.object({
  description: z.string().min(1).max(5000),
});

// ── Router ────────────────────────────────────────────────────────────────────

export type CriteriaRouterDeps = {
  repository: TalosRepository;
  getCriteriaGenerator: () => CriteriaGenerator | undefined;
};

export function createCriteriaRouter({ repository, getCriteriaGenerator }: CriteriaRouterDeps): Router {
  const router = Router();

  // ── List criteria for an app ────────────────────────────────────────────────

  router.get("/:appId", (req: Request, res: Response) => {
    const appId = String(req.params.appId);
    const status = req.query.status as string | undefined;
    const tags = req.query.tags ? String(req.query.tags).split(",") : undefined;

    const validStatuses = ["draft", "approved", "implemented", "deprecated"] as const;
    const statusFilter =
      status && validStatuses.includes(status as (typeof validStatuses)[number])
        ? (status as (typeof validStatuses)[number])
        : undefined;

    const criteria = repository.listAcceptanceCriteria(appId, {
      status: statusFilter,
      tags,
    });
    res.json({ criteria });
  });

  // ── Create a criterion manually ─────────────────────────────────────────────

  router.post("/:appId", (req: Request, res: Response) => {
    const appId = String(req.params.appId);
    const parsed = CreateCriteriaSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation error", details: parsed.error.flatten() });
      return;
    }

    const criterion = repository.createAcceptanceCriteria({
      ...parsed.data,
      applicationId: appId,
    });
    res.status(201).json(criterion);
  });

  // ── Update a criterion ──────────────────────────────────────────────────────

  router.put("/:id", (req: Request, res: Response) => {
    const id = String(req.params.id);
    const parsed = UpdateCriteriaSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation error", details: parsed.error.flatten() });
      return;
    }

    const updated = repository.updateAcceptanceCriteria(id, parsed.data);
    if (!updated) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(updated);
  });

  // ── Delete a criterion ──────────────────────────────────────────────────────

  router.delete("/:id", (req: Request, res: Response) => {
    const id = String(req.params.id);
    const deleted = repository.deleteAcceptanceCriteria(id);
    if (!deleted) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.status(204).end();
  });

  // ── Bulk AI generation ──────────────────────────────────────────────────────

  router.post("/:appId/generate", async (req: Request, res: Response) => {
    const criteriaGenerator = getCriteriaGenerator();
    if (!criteriaGenerator) {
      res
        .status(503)
        .json({
          error:
            "AI features require Copilot authentication. Please configure your Copilot token in Admin > Auth settings.",
        });
      return;
    }

    const appId = String(req.params.appId);
    const parsed = GenerateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation error", details: parsed.error.flatten() });
      return;
    }

    try {
      const result = await criteriaGenerator.generateCriteria(appId, parsed.data);
      res.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Generation failed";
      res.status(500).json({ error: msg });
    }
  });

  // ── AI suggest single criterion ─────────────────────────────────────────────

  router.post("/:appId/suggest", async (req: Request, res: Response) => {
    const criteriaGenerator = getCriteriaGenerator();
    if (!criteriaGenerator) {
      res
        .status(503)
        .json({
          error:
            "AI features require Copilot authentication. Please configure your Copilot token in Admin > Auth settings.",
        });
      return;
    }

    const appId = String(req.params.appId);
    const parsed = SuggestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation error", details: parsed.error.flatten() });
      return;
    }

    try {
      const criterion = await criteriaGenerator.suggestCriteria(parsed.data.description, appId);
      res.status(201).json(criterion);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Suggestion failed";
      res.status(500).json({ error: msg });
    }
  });

  // ── Traceability report ─────────────────────────────────────────────────────

  router.get("/traceability/:appId", (req: Request, res: Response) => {
    const appId = String(req.params.appId);
    const report = repository.getCoverageReport(appId);
    res.json(report);
  });

  return router;
}
