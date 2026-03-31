/**
 * Criteria API Router unit tests.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import Database from "better-sqlite3";
import { TalosRepository } from "../talos/repository.js";
import { createCriteriaRouter } from "./criteria.js";
import type { CriteriaGenerator } from "../talos/knowledge/criteria-generator.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function json(res: Response): Promise<any> {
  return res.json();
}

function createTestApp(criteriaGenerator?: CriteriaGenerator) {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const repository = new TalosRepository(db, { clock: () => new Date("2025-01-15T12:00:00Z") });
  repository.migrate();
  const app = express();
  app.use(express.json());
  app.use("/api/talos/criteria", createCriteriaRouter({ repository, getCriteriaGenerator: () => criteriaGenerator }));
  return { app, repository, db };
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

describe("Criteria API", () => {
  let app: express.Express;
  let repository: TalosRepository;
  let appId: string;

  beforeEach(() => {
    ({ app, repository } = createTestApp());
    const created = repository.createApplication({ name: "Test App" });
    appId = created.id;
  });

  describe("POST /api/talos/criteria/:appId", () => {
    it("should create a criterion", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/talos/criteria/${appId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Login test",
            description: "Verify login flow",
            scenarios: [{ given: "user exists", when: "user logs in", then: "dashboard shown" }],
            tags: ["auth"],
          }),
        });
        expect(res.status).toBe(201);
        const data = await json(res);
        expect(data.title).toBe("Login test");
        expect(data.scenarios).toHaveLength(1);
        expect(data.applicationId).toBe(appId);
      });
    });

    it("should reject invalid input", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/talos/criteria/${appId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "" }),
        });
        expect(res.status).toBe(400);
      });
    });

    it("should reject scenario with missing fields", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/talos/criteria/${appId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Bad scenario",
            scenarios: [{ given: "a", when: "" }],
          }),
        });
        expect(res.status).toBe(400);
      });
    });
  });

  describe("GET /api/talos/criteria/:appId", () => {
    it("should list criteria for an app", async () => {
      repository.createAcceptanceCriteria({ applicationId: appId, title: "AC1", description: "" });
      repository.createAcceptanceCriteria({ applicationId: appId, title: "AC2", description: "" });

      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/talos/criteria/${appId}`);
        expect(res.status).toBe(200);
        const data = await json(res);
        expect(data.criteria).toHaveLength(2);
      });
    });

    it("should filter by status", async () => {
      repository.createAcceptanceCriteria({ applicationId: appId, title: "Draft", description: "", status: "draft" });
      repository.createAcceptanceCriteria({ applicationId: appId, title: "Approved", description: "", status: "approved" });

      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/talos/criteria/${appId}?status=draft`);
        const data = await json(res);
        expect(data.criteria).toHaveLength(1);
        expect(data.criteria[0].title).toBe("Draft");
      });
    });

    it("should filter by tags", async () => {
      repository.createAcceptanceCriteria({ applicationId: appId, title: "Auth", description: "", tags: ["auth"] });
      repository.createAcceptanceCriteria({ applicationId: appId, title: "Other", description: "", tags: ["other"] });

      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/talos/criteria/${appId}?tags=auth`);
        const data = await json(res);
        expect(data.criteria).toHaveLength(1);
        expect(data.criteria[0].title).toBe("Auth");
      });
    });
  });

  describe("PUT /api/talos/criteria/:id", () => {
    it("should update a criterion", async () => {
      const ac = repository.createAcceptanceCriteria({ applicationId: appId, title: "Original", description: "d" });

      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/talos/criteria/${ac.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Updated", status: "approved" }),
        });
        expect(res.status).toBe(200);
        const data = await json(res);
        expect(data.title).toBe("Updated");
        expect(data.status).toBe("approved");
      });
    });

    it("should return 404 for non-existent criterion", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/talos/criteria/fake-id`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Nope" }),
        });
        expect(res.status).toBe(404);
      });
    });

    it("should reject unknown fields", async () => {
      const ac = repository.createAcceptanceCriteria({ applicationId: appId, title: "AC", description: "" });

      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/talos/criteria/${ac.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "OK", unknownField: true }),
        });
        expect(res.status).toBe(400);
      });
    });
  });

  describe("DELETE /api/talos/criteria/:id", () => {
    it("should delete a criterion", async () => {
      const ac = repository.createAcceptanceCriteria({ applicationId: appId, title: "Del", description: "" });

      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/talos/criteria/${ac.id}`, { method: "DELETE" });
        expect(res.status).toBe(204);
      });
    });

    it("should return 404 when deleting non-existent", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/talos/criteria/fake-id`, { method: "DELETE" });
        expect(res.status).toBe(404);
      });
    });
  });

  describe("POST /api/talos/criteria/:appId/generate", () => {
    it("should return 503 when generator not configured", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/talos/criteria/${appId}/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        expect(res.status).toBe(503);
      });
    });

    it("should call generator and return result", async () => {
      const mockGenerator = {
        generateCriteria: vi.fn().mockResolvedValue({
          criteriaCreated: 3,
          totalChunksAnalyzed: 10,
          averageConfidence: 0.85,
        }),
        suggestCriteria: vi.fn(),
      } as unknown as CriteriaGenerator;

      const { app: appWithGen } = createTestApp(mockGenerator);

      await withServer(appWithGen, async (base) => {
        const res = await fetch(`${base}/api/talos/criteria/${appId}/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ maxCriteria: 5 }),
        });
        expect(res.status).toBe(200);
        const data = await json(res);
        expect(data.criteriaCreated).toBe(3);
      });
    });

    it("should handle generator errors", async () => {
      const mockGenerator = {
        generateCriteria: vi.fn().mockRejectedValue(new Error("LLM timeout")),
        suggestCriteria: vi.fn(),
      } as unknown as CriteriaGenerator;

      const { app: appWithGen } = createTestApp(mockGenerator);

      await withServer(appWithGen, async (base) => {
        const res = await fetch(`${base}/api/talos/criteria/${appId}/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        expect(res.status).toBe(500);
        const data = await json(res);
        expect(data.error).toBe("LLM timeout");
      });
    });
  });

  describe("POST /api/talos/criteria/:appId/suggest", () => {
    it("should return 503 when generator not configured", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/talos/criteria/${appId}/suggest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description: "test" }),
        });
        expect(res.status).toBe(503);
      });
    });

    it("should reject empty description", async () => {
      const mockGenerator = {
        generateCriteria: vi.fn(),
        suggestCriteria: vi.fn(),
      } as unknown as CriteriaGenerator;

      const { app: appWithGen } = createTestApp(mockGenerator);

      await withServer(appWithGen, async (base) => {
        const res = await fetch(`${base}/api/talos/criteria/${appId}/suggest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description: "" }),
        });
        expect(res.status).toBe(400);
      });
    });

    it("should return suggested criterion", async () => {
      const mockCriterion = {
        id: "ac-1",
        applicationId: appId,
        title: "Suggested",
        description: "AI-generated",
        scenarios: [],
        preconditions: [],
        dataRequirements: [],
        nfrTags: [],
        status: "draft",
        confidence: 0.8,
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockGenerator = {
        generateCriteria: vi.fn(),
        suggestCriteria: vi.fn().mockResolvedValue(mockCriterion),
      } as unknown as CriteriaGenerator;

      const { app: appWithGen } = createTestApp(mockGenerator);

      await withServer(appWithGen, async (base) => {
        const res = await fetch(`${base}/api/talos/criteria/${appId}/suggest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description: "User should see a dashboard" }),
        });
        expect(res.status).toBe(201);
        const data = await json(res);
        expect(data.title).toBe("Suggested");
      });
    });
  });

  describe("GET /api/talos/criteria/traceability/:appId", () => {
    it("should return traceability report", async () => {
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/talos/criteria/traceability/${appId}`);
        expect(res.status).toBe(200);
        const data = await json(res);
        expect(data).toHaveProperty("totalRequirements");
        expect(data).toHaveProperty("coveragePercentage");
        expect(data).toHaveProperty("unmappedRequirements");
        expect(data).toHaveProperty("untestedCriteria");
      });
    });
  });
});
