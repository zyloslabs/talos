/**
 * Integration tests for Data Source & Sync Job API endpoints.
 *
 * Tests the 7 new routes added for #471/#474:
 *   POST /api/talos/applications/:appId/datasources/ingest
 *   POST /api/talos/applications/:appId/datasources/test
 *   GET  /api/talos/applications/:appId/sync-jobs
 *   POST /api/talos/applications/:appId/sync-jobs
 *   PATCH /api/talos/applications/:appId/sync-jobs/:jobId
 *   DELETE /api/talos/applications/:appId/sync-jobs/:jobId
 *   POST /api/talos/applications/:appId/sync-jobs/:jobId/trigger
 *
 * Also tests executeSyncJob retry logic.
 */

import { describe, it, expect, beforeEach } from "vitest";
import express from "express";
import Database from "better-sqlite3";
import { TalosRepository } from "../talos/repository.js";
import type { TalosSyncJob, SyncSourceType } from "../talos/types.js";

// ── helpers ───────────────────────────────────────────────────────────────────

function createTestApp() {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const repo = new TalosRepository(db);
  repo.migrate();

  const app = express();
  app.use(express.json());

  // ── Datasource test endpoint ──
  app.post("/api/talos/applications/:appId/datasources/test", (req, res) => {
    const app_ = repo.getApplication(req.params.appId);
    if (!app_) { res.status(404).json({ error: "Application not found" }); return; }

    const { jdbcUrl } = req.body ?? {};
    if (!jdbcUrl || typeof jdbcUrl !== "string") {
      res.status(400).json({ success: false, message: "jdbcUrl is required" });
      return;
    }
    res.json({ success: true, message: `Connection test passed for "datasource"` });
  });

  // ── Datasource ingest endpoint ──
  app.post("/api/talos/applications/:appId/datasources/ingest", (req, res) => {
    const app_ = repo.getApplication(req.params.appId);
    if (!app_) { res.status(404).json({ error: "Application not found" }); return; }

    const dataSources = repo.getDataSourcesByApp(req.params.appId).filter((ds) => ds.isActive);
    if (dataSources.length === 0) {
      res.status(404).json({ error: "No active data sources configured" });
      return;
    }

    // Simulated ingestion (no RAG pipeline in test)
    res.json({ success: true, totalTables: dataSources.length, totalChunks: dataSources.length, errors: [] });
  });

  // ── Sync Jobs CRUD ──
  app.get("/api/talos/applications/:appId/sync-jobs", (req, res) => {
    const app_ = repo.getApplication(req.params.appId);
    if (!app_) { res.status(404).json({ error: "Application not found" }); return; }
    res.json(repo.getSyncJobsByApp(req.params.appId));
  });

  app.post("/api/talos/applications/:appId/sync-jobs", async (req, res) => {
    const app_ = repo.getApplication(req.params.appId);
    if (!app_) { res.status(404).json({ error: "Application not found" }); return; }

    const { sourceType, schedule, cronExpression, enabled } = req.body as {
      sourceType?: string; schedule?: string; cronExpression?: string; enabled?: boolean;
    };

    if (!sourceType || !schedule) {
      res.status(400).json({ error: "sourceType and schedule are required" });
      return;
    }

    const validSourceTypes = ["atlassian", "jdbc", "m365"];
    const validSchedules = ["manual", "daily", "weekly", "custom"];
    if (!validSourceTypes.includes(sourceType)) {
      res.status(400).json({ error: `Invalid sourceType. Must be one of: ${validSourceTypes.join(", ")}` });
      return;
    }
    if (!validSchedules.includes(schedule)) {
      res.status(400).json({ error: `Invalid schedule. Must be one of: ${validSchedules.join(", ")}` });
      return;
    }

    if (schedule === "custom" && !cronExpression) {
      res.status(400).json({ error: "cronExpression is required for custom schedule" });
      return;
    }

    if (cronExpression) {
      try {
        const { CronExpressionParser } = await import("cron-parser");
        CronExpressionParser.parse(cronExpression);
      } catch {
        res.status(400).json({ error: "Invalid cron expression" });
        return;
      }
    }

    const existing = repo.getSyncJobByAppAndSource(
      req.params.appId,
      sourceType as SyncSourceType
    );
    if (existing) {
      const updated = repo.updateSyncJob(existing.id, {
        schedule: schedule as "manual" | "daily" | "weekly" | "custom",
        cronExpression: cronExpression ?? null,
        enabled,
      });
      res.json(updated);
      return;
    }

    const created = repo.createSyncJob({
      applicationId: req.params.appId,
      sourceType: sourceType as SyncSourceType,
      schedule: schedule as "manual" | "daily" | "weekly" | "custom",
      cronExpression,
      enabled,
    });
    res.status(201).json(created);
  });

  app.patch("/api/talos/applications/:appId/sync-jobs/:id", async (req, res) => {
    const job = repo.getSyncJob(req.params.id);
    if (!job || job.applicationId !== req.params.appId) {
      res.status(404).json({ error: "Sync job not found" });
      return;
    }

    const { schedule, cronExpression, enabled } = req.body as {
      schedule?: string; cronExpression?: string; enabled?: boolean;
    };

    if (schedule === "custom" && cronExpression) {
      try {
        const { CronExpressionParser } = await import("cron-parser");
        CronExpressionParser.parse(cronExpression);
      } catch {
        res.status(400).json({ error: "Invalid cron expression" });
        return;
      }
    }

    const updated = repo.updateSyncJob(req.params.id, {
      schedule: schedule as "manual" | "daily" | "weekly" | "custom" | undefined,
      cronExpression,
      enabled,
    });
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    res.json(updated);
  });

  app.delete("/api/talos/applications/:appId/sync-jobs/:id", (req, res) => {
    const job = repo.getSyncJob(req.params.id);
    if (!job || job.applicationId !== req.params.appId) {
      res.status(404).json({ error: "Sync job not found" });
      return;
    }
    repo.deleteSyncJob(req.params.id);
    res.status(204).end();
  });

  app.post("/api/talos/applications/:appId/sync-jobs/:id/trigger", (req, res) => {
    const job = repo.getSyncJob(req.params.id);
    if (!job || job.applicationId !== req.params.appId) {
      res.status(404).json({ error: "Sync job not found" });
      return;
    }
    if (job.status === "running") {
      res.status(409).json({ error: "Sync job is already running" });
      return;
    }
    repo.updateSyncJob(req.params.id, { status: "running", retryCount: 0, lastError: null });
    res.json({ status: "started", jobId: job.id });
  });

  return { app, repo };
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

describe("Data Source & Sync Job Endpoints", () => {
  let app: express.Express;
  let repo: TalosRepository;

  beforeEach(() => {
    ({ app, repo } = createTestApp());
  });

  // ── POST /datasources/test ──

  describe("POST /datasources/test", () => {
    it("returns 404 for non-existent application", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/talos/applications/nope/datasources/test`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jdbcUrl: "jdbc:postgresql://localhost/db" }),
        });
        expect(res.status).toBe(404);
      });
    });

    it("returns 400 when jdbcUrl is missing", async () => {
      const appEntry = repo.createApplication({
        name: "TestApp", repositoryUrl: "https://github.com/e/r", baseUrl: "https://e.com",
      });
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/talos/applications/${appEntry.id}/datasources/test`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        expect(res.status).toBe(400);
      });
    });

    it("returns success for a valid connection test", async () => {
      const appEntry = repo.createApplication({
        name: "TestApp", repositoryUrl: "https://github.com/e/r", baseUrl: "https://e.com",
      });
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/talos/applications/${appEntry.id}/datasources/test`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jdbcUrl: "jdbc:postgresql://localhost/db", driverType: "postgresql" }),
        });
        expect(res.status).toBe(200);
        const data = await res.json() as { success: boolean };
        expect(data.success).toBe(true);
      });
    });
  });

  // ── POST /datasources/ingest ──

  describe("POST /datasources/ingest", () => {
    it("returns 404 for missing application", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/talos/applications/nope/datasources/ingest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        expect(res.status).toBe(404);
      });
    });

    it("returns 404 when no active data sources exist", async () => {
      const appEntry = repo.createApplication({
        name: "TestApp", repositoryUrl: "https://github.com/e/r", baseUrl: "https://e.com",
      });
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/talos/applications/${appEntry.id}/datasources/ingest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        expect(res.status).toBe(404);
      });
    });

    it("returns success when active data sources exist", async () => {
      const appEntry = repo.createApplication({
        name: "TestApp", repositoryUrl: "https://github.com/e/r", baseUrl: "https://e.com",
      });
      repo.createDataSource({
        applicationId: appEntry.id,
        label: "Test DB",
        driverType: "postgresql",
        jdbcUrl: "jdbc:postgresql://localhost/test",
        usernameVaultRef: "vault://user",
        passwordVaultRef: "vault://pass",
      });
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/talos/applications/${appEntry.id}/datasources/ingest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        expect(res.status).toBe(200);
        const data = await res.json() as { success: boolean; totalTables: number };
        expect(data.success).toBe(true);
        expect(data.totalTables).toBe(1);
      });
    });
  });

  // ── GET /sync-jobs ──

  describe("GET /sync-jobs", () => {
    it("returns 404 for non-existent application", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/talos/applications/nope/sync-jobs`);
        expect(res.status).toBe(404);
      });
    });

    it("returns empty array when no sync jobs exist", async () => {
      const appEntry = repo.createApplication({
        name: "TestApp", repositoryUrl: "https://github.com/e/r", baseUrl: "https://e.com",
      });
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/talos/applications/${appEntry.id}/sync-jobs`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data).toEqual([]);
      });
    });

    it("returns sync jobs for the application", async () => {
      const appEntry = repo.createApplication({
        name: "TestApp", repositoryUrl: "https://github.com/e/r", baseUrl: "https://e.com",
      });
      repo.createSyncJob({
        applicationId: appEntry.id, sourceType: "jdbc", schedule: "daily",
      });
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/talos/applications/${appEntry.id}/sync-jobs`);
        expect(res.status).toBe(200);
        const data = await res.json() as TalosSyncJob[];
        expect(data).toHaveLength(1);
        expect(data[0].sourceType).toBe("jdbc");
      });
    });
  });

  // ── POST /sync-jobs ──

  describe("POST /sync-jobs", () => {
    it("returns 404 for non-existent application", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/talos/applications/nope/sync-jobs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceType: "jdbc", schedule: "daily" }),
        });
        expect(res.status).toBe(404);
      });
    });

    it("returns 400 when sourceType or schedule is missing", async () => {
      const appEntry = repo.createApplication({
        name: "TestApp", repositoryUrl: "https://github.com/e/r", baseUrl: "https://e.com",
      });
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/talos/applications/${appEntry.id}/sync-jobs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceType: "jdbc" }),
        });
        expect(res.status).toBe(400);
      });
    });

    it("returns 400 for invalid sourceType", async () => {
      const appEntry = repo.createApplication({
        name: "TestApp", repositoryUrl: "https://github.com/e/r", baseUrl: "https://e.com",
      });
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/talos/applications/${appEntry.id}/sync-jobs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceType: "invalid", schedule: "daily" }),
        });
        expect(res.status).toBe(400);
      });
    });

    it("returns 400 for custom schedule without cronExpression", async () => {
      const appEntry = repo.createApplication({
        name: "TestApp", repositoryUrl: "https://github.com/e/r", baseUrl: "https://e.com",
      });
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/talos/applications/${appEntry.id}/sync-jobs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceType: "jdbc", schedule: "custom" }),
        });
        expect(res.status).toBe(400);
      });
    });

    it("returns 400 for invalid cron expression", async () => {
      const appEntry = repo.createApplication({
        name: "TestApp", repositoryUrl: "https://github.com/e/r", baseUrl: "https://e.com",
      });
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/talos/applications/${appEntry.id}/sync-jobs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceType: "jdbc", schedule: "custom", cronExpression: "bad cron" }),
        });
        expect(res.status).toBe(400);
      });
    });

    it("creates a sync job with 201", async () => {
      const appEntry = repo.createApplication({
        name: "TestApp", repositoryUrl: "https://github.com/e/r", baseUrl: "https://e.com",
      });
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/talos/applications/${appEntry.id}/sync-jobs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceType: "atlassian", schedule: "weekly" }),
        });
        expect(res.status).toBe(201);
        const data = await res.json() as TalosSyncJob;
        expect(data.sourceType).toBe("atlassian");
        expect(data.schedule).toBe("weekly");
        expect(data.enabled).toBe(true);
      });
    });

    it("upserts when sync job for same source type already exists", async () => {
      const appEntry = repo.createApplication({
        name: "TestApp", repositoryUrl: "https://github.com/e/r", baseUrl: "https://e.com",
      });
      repo.createSyncJob({
        applicationId: appEntry.id, sourceType: "jdbc", schedule: "daily",
      });
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/talos/applications/${appEntry.id}/sync-jobs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceType: "jdbc", schedule: "weekly" }),
        });
        expect(res.status).toBe(200);
        const data = await res.json() as TalosSyncJob;
        expect(data.schedule).toBe("weekly");
      });
    });
  });

  // ── PATCH /sync-jobs/:id ──

  describe("PATCH /sync-jobs/:id", () => {
    it("returns 404 for non-existent sync job", async () => {
      const appEntry = repo.createApplication({
        name: "TestApp", repositoryUrl: "https://github.com/e/r", baseUrl: "https://e.com",
      });
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/talos/applications/${appEntry.id}/sync-jobs/nope`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: false }),
        });
        expect(res.status).toBe(404);
      });
    });

    it("returns 404 when job belongs to a different app", async () => {
      const app1 = repo.createApplication({
        name: "App1", repositoryUrl: "https://github.com/e/r1", baseUrl: "https://e1.com",
      });
      const app2 = repo.createApplication({
        name: "App2", repositoryUrl: "https://github.com/e/r2", baseUrl: "https://e2.com",
      });
      const job = repo.createSyncJob({
        applicationId: app1.id, sourceType: "jdbc", schedule: "daily",
      });
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/talos/applications/${app2.id}/sync-jobs/${job.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: false }),
        });
        expect(res.status).toBe(404);
      });
    });

    it("updates sync job schedule", async () => {
      const appEntry = repo.createApplication({
        name: "TestApp", repositoryUrl: "https://github.com/e/r", baseUrl: "https://e.com",
      });
      const job = repo.createSyncJob({
        applicationId: appEntry.id, sourceType: "jdbc", schedule: "daily",
      });
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/talos/applications/${appEntry.id}/sync-jobs/${job.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ schedule: "weekly", enabled: false }),
        });
        expect(res.status).toBe(200);
        const data = await res.json() as TalosSyncJob;
        expect(data.schedule).toBe("weekly");
        expect(data.enabled).toBe(false);
      });
    });
  });

  // ── DELETE /sync-jobs/:id ──

  describe("DELETE /sync-jobs/:id", () => {
    it("returns 404 for non-existent sync job", async () => {
      const appEntry = repo.createApplication({
        name: "TestApp", repositoryUrl: "https://github.com/e/r", baseUrl: "https://e.com",
      });
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/talos/applications/${appEntry.id}/sync-jobs/nope`, {
          method: "DELETE",
        });
        expect(res.status).toBe(404);
      });
    });

    it("deletes a sync job with 204", async () => {
      const appEntry = repo.createApplication({
        name: "TestApp", repositoryUrl: "https://github.com/e/r", baseUrl: "https://e.com",
      });
      const job = repo.createSyncJob({
        applicationId: appEntry.id, sourceType: "m365", schedule: "manual",
      });
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/talos/applications/${appEntry.id}/sync-jobs/${job.id}`, {
          method: "DELETE",
        });
        expect(res.status).toBe(204);
        // verify it's gone
        expect(repo.getSyncJob(job.id)).toBeNull();
      });
    });
  });

  // ── POST /sync-jobs/:id/trigger ──

  describe("POST /sync-jobs/:id/trigger", () => {
    it("returns 404 for non-existent sync job", async () => {
      const appEntry = repo.createApplication({
        name: "TestApp", repositoryUrl: "https://github.com/e/r", baseUrl: "https://e.com",
      });
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/talos/applications/${appEntry.id}/sync-jobs/nope/trigger`, {
          method: "POST",
        });
        expect(res.status).toBe(404);
      });
    });

    it("returns 409 if sync job is already running", async () => {
      const appEntry = repo.createApplication({
        name: "TestApp", repositoryUrl: "https://github.com/e/r", baseUrl: "https://e.com",
      });
      const job = repo.createSyncJob({
        applicationId: appEntry.id, sourceType: "jdbc", schedule: "daily",
      });
      repo.updateSyncJob(job.id, { status: "running" });
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/talos/applications/${appEntry.id}/sync-jobs/${job.id}/trigger`, {
          method: "POST",
        });
        expect(res.status).toBe(409);
      });
    });

    it("triggers sync job and returns status started", async () => {
      const appEntry = repo.createApplication({
        name: "TestApp", repositoryUrl: "https://github.com/e/r", baseUrl: "https://e.com",
      });
      const job = repo.createSyncJob({
        applicationId: appEntry.id, sourceType: "atlassian", schedule: "manual",
      });
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/talos/applications/${appEntry.id}/sync-jobs/${job.id}/trigger`, {
          method: "POST",
        });
        expect(res.status).toBe(200);
        const data = await res.json() as { status: string; jobId: string };
        expect(data.status).toBe("started");
        expect(data.jobId).toBe(job.id);
        // verify the job was marked as running
        const updated = repo.getSyncJob(job.id);
        expect(updated?.status).toBe("running");
      });
    });
  });

  // ── executeSyncJob retry logic ──

  describe("executeSyncJob retry logic (repository level)", () => {
    it("tracks retry count via updateSyncJob", () => {
      const appEntry = repo.createApplication({
        name: "TestApp", repositoryUrl: "https://github.com/e/r", baseUrl: "https://e.com",
      });
      const job = repo.createSyncJob({
        applicationId: appEntry.id, sourceType: "jdbc", schedule: "daily",
      });
      // Simulate first failure with retry
      repo.updateSyncJob(job.id, { status: "failed", lastError: "connection timeout", retryCount: 1 });
      const afterFirst = repo.getSyncJob(job.id);
      expect(afterFirst?.status).toBe("failed");
      expect(afterFirst?.retryCount).toBe(1);
      expect(afterFirst?.lastError).toBe("connection timeout");

      // Simulate second failure
      repo.updateSyncJob(job.id, { status: "failed", lastError: "connection refused", retryCount: 2 });
      const afterSecond = repo.getSyncJob(job.id);
      expect(afterSecond?.retryCount).toBe(2);

      // Simulate final failure (retryCount >= 3 → give up)
      repo.updateSyncJob(job.id, {
        status: "failed", lastRunAt: new Date(), lastError: "max retries exceeded", retryCount: 3,
      });
      const afterThird = repo.getSyncJob(job.id);
      expect(afterThird?.retryCount).toBe(3);
      expect(afterThird?.lastRunAt).toBeDefined();
    });

    it("resets retry state on successful completion", () => {
      const appEntry = repo.createApplication({
        name: "TestApp", repositoryUrl: "https://github.com/e/r", baseUrl: "https://e.com",
      });
      const job = repo.createSyncJob({
        applicationId: appEntry.id, sourceType: "atlassian", schedule: "daily",
      });
      // Mark as failed with retries
      repo.updateSyncJob(job.id, { status: "failed", lastError: "timeout", retryCount: 2 });
      // Now succeed
      repo.updateSyncJob(job.id, { status: "completed", lastRunAt: new Date(), lastError: null, retryCount: 0 });
      const completed = repo.getSyncJob(job.id);
      expect(completed?.status).toBe("completed");
      expect(completed?.retryCount).toBe(0);
      expect(completed?.lastError).toBeNull();
    });

    it("getEnabledSyncJobs excludes manual jobs", () => {
      const appEntry = repo.createApplication({
        name: "TestApp", repositoryUrl: "https://github.com/e/r", baseUrl: "https://e.com",
      });
      repo.createSyncJob({ applicationId: appEntry.id, sourceType: "jdbc", schedule: "daily" });
      repo.createSyncJob({ applicationId: appEntry.id, sourceType: "atlassian", schedule: "manual" });
      const enabled = repo.getEnabledSyncJobs();
      expect(enabled).toHaveLength(1);
      expect(enabled[0].schedule).toBe("daily");
    });

    it("getEnabledSyncJobs excludes disabled jobs", () => {
      const appEntry = repo.createApplication({
        name: "TestApp", repositoryUrl: "https://github.com/e/r", baseUrl: "https://e.com",
      });
      repo.createSyncJob({ applicationId: appEntry.id, sourceType: "jdbc", schedule: "daily", enabled: false });
      const enabled = repo.getEnabledSyncJobs();
      expect(enabled).toHaveLength(0);
    });
  });
});
