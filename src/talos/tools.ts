/**
 * Talos MCP Tools Factory
 *
 * Creates MCP tool definitions for the Talos module.
 * Follows OpenZigs ToolDefinition pattern with Zod schemas.
 */

import * as z from "zod";
import type { TalosRepository } from "./repository.js";
import type { TalosConfig } from "./config.js";

// ── Tool Definition Type ──────────────────────────────────────────────────────

export type RiskLevel = "low" | "medium" | "high";
export type ToolCategory =
  | "filesystem"
  | "search"
  | "browser"
  | "shell"
  | "productivity"
  | "social"
  | "documents"
  | "personal"
  | "data"
  | "developer"
  | "knowledge"
  | "testing";

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
  };
  zodSchema: z.ZodSchema;
  handler: (args: Record<string, unknown>) => Promise<{ text: string; isError?: boolean }>;
  category: ToolCategory;
  riskLevel: RiskLevel;
  source?: string;
};

// ── Tool Schemas ──────────────────────────────────────────────────────────────

const listApplicationsSchema = z.object({
  status: z.enum(["active", "archived", "pending"]).optional(),
});

const getApplicationSchema = z.object({
  id: z.string().uuid(),
});

const createApplicationSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  repositoryUrl: z.string().url(),
  baseUrl: z.string().url(),
  githubPatRef: z.string().optional(),
});

const listTestsSchema = z.object({
  applicationId: z.string().uuid(),
  status: z.enum(["draft", "active", "disabled", "archived"]).optional(),
});

const runTestSchema = z.object({
  testId: z.string().uuid(),
  browser: z.enum(["chromium", "firefox", "webkit"]).optional(),
  vaultRoleType: z.enum(["admin", "standard", "guest", "service"]).optional(),
});

const generateTestSchema = z.object({
  applicationId: z.string().uuid(),
  prompt: z.string().min(10),
  testType: z.enum(["e2e", "smoke", "regression", "accessibility"]).optional(),
});

const discoverRepositorySchema = z.object({
  applicationId: z.string().uuid(),
  force: z.boolean().optional(),
});

const getTestRunSchema = z.object({
  runId: z.string().uuid(),
});

const listTestRunsSchema = z.object({
  applicationId: z.string().uuid().optional(),
  testId: z.string().uuid().optional(),
  limit: z.number().min(1).max(100).optional(),
});

const healTestSchema = z.object({
  testRunId: z.string().uuid(),
  autoApply: z.boolean().optional(),
});

const exportTestsSchema = z.object({
  applicationId: z.string().uuid(),
  testIds: z.array(z.string().uuid()).optional(),
  format: z.enum(["playwright", "standalone"]).optional(),
  platform: z.enum(["macos", "windows", "linux"]).optional(),
});

// ── Tool Factory ──────────────────────────────────────────────────────────────

export type TalosToolsOptions = {
  repository: TalosRepository;
  config: TalosConfig;
};

export function createTalosTools(options: TalosToolsOptions): ToolDefinition[] {
  const { repository } = options;

  return [
    // ── Application Management ────────────────────────────────────────────────
    {
      name: "talos-list-applications",
      description: "List all Talos test applications, optionally filtered by status",
      inputSchema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["active", "archived", "pending"],
            description: "Filter by application status",
          },
        },
      },
      zodSchema: listApplicationsSchema,
      category: "testing",
      riskLevel: "low",
      source: "talos",
      handler: async (args) => {
        const parsed = listApplicationsSchema.parse(args);
        const apps = repository.listApplications(parsed.status);
        return {
          text: JSON.stringify(
            apps.map((a) => ({
              id: a.id,
              name: a.name,
              repositoryUrl: a.repositoryUrl,
              baseUrl: a.baseUrl,
              status: a.status,
            })),
            null,
            2
          ),
        };
      },
    },

    {
      name: "talos-get-application",
      description: "Get details of a specific Talos application by ID",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Application UUID" },
        },
        required: ["id"],
      },
      zodSchema: getApplicationSchema,
      category: "testing",
      riskLevel: "low",
      source: "talos",
      handler: async (args) => {
        const parsed = getApplicationSchema.parse(args);
        const app = repository.getApplication(parsed.id);
        if (!app) {
          return { text: `Application not found: ${parsed.id}`, isError: true };
        }
        const stats = repository.getApplicationStats(parsed.id);
        return {
          text: JSON.stringify({ ...app, stats }, null, 2),
        };
      },
    },

    {
      name: "talos-create-application",
      description: "Create a new Talos test application for a repository",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Application name" },
          description: { type: "string", description: "Application description" },
          repositoryUrl: { type: "string", description: "GitHub repository URL" },
          baseUrl: { type: "string", description: "Base URL for testing" },
          githubPatRef: { type: "string", description: "Vault reference for GitHub PAT" },
        },
        required: ["name", "repositoryUrl", "baseUrl"],
      },
      zodSchema: createApplicationSchema,
      category: "testing",
      riskLevel: "medium",
      source: "talos",
      handler: async (args) => {
        const parsed = createApplicationSchema.parse(args);
        const app = repository.createApplication(parsed);
        return {
          text: `Created application "${app.name}" with ID: ${app.id}`,
        };
      },
    },

    // ── Test Management ───────────────────────────────────────────────────────
    {
      name: "talos-list-tests",
      description: "List tests for a Talos application",
      inputSchema: {
        type: "object",
        properties: {
          applicationId: { type: "string", description: "Application UUID" },
          status: {
            type: "string",
            enum: ["draft", "active", "disabled", "archived"],
            description: "Filter by test status",
          },
        },
        required: ["applicationId"],
      },
      zodSchema: listTestsSchema,
      category: "testing",
      riskLevel: "low",
      source: "talos",
      handler: async (args) => {
        const parsed = listTestsSchema.parse(args);
        const tests = repository.listTestsByApp(parsed.applicationId, parsed.status);
        return {
          text: JSON.stringify(
            tests.map((t) => ({
              id: t.id,
              name: t.name,
              type: t.type,
              status: t.status,
              version: t.version,
              confidence: t.generationConfidence,
            })),
            null,
            2
          ),
        };
      },
    },

    {
      name: "talos-run-test",
      description: "Execute a Talos test and return results",
      inputSchema: {
        type: "object",
        properties: {
          testId: { type: "string", description: "Test UUID to run" },
          browser: {
            type: "string",
            enum: ["chromium", "firefox", "webkit"],
            description: "Browser to use",
          },
          vaultRoleType: {
            type: "string",
            enum: ["admin", "standard", "guest", "service"],
            description: "Vault role for credentials",
          },
        },
        required: ["testId"],
      },
      zodSchema: runTestSchema,
      category: "testing",
      riskLevel: "medium",
      source: "talos",
      handler: async (args) => {
        const parsed = runTestSchema.parse(args);
        const test = repository.getTest(parsed.testId);
        if (!test) {
          return { text: `Test not found: ${parsed.testId}`, isError: true };
        }

        // Create a test run record
        const run = repository.createTestRun({
          applicationId: test.applicationId,
          testId: test.id,
          trigger: "manual",
          browser: parsed.browser,
        });

        // TODO: Integrate with PlaywrightRunner for actual execution
        return {
          text: `Created test run ${run.id} for test "${test.name}". Status: ${run.status}`,
        };
      },
    },

    // ── Test Generation ───────────────────────────────────────────────────────
    {
      name: "talos-generate-test",
      description: "Generate a new E2E test using AI based on application context",
      inputSchema: {
        type: "object",
        properties: {
          applicationId: { type: "string", description: "Application UUID" },
          prompt: { type: "string", description: "Description of what the test should verify" },
          testType: {
            type: "string",
            enum: ["e2e", "smoke", "regression", "accessibility"],
            description: "Type of test to generate",
          },
        },
        required: ["applicationId", "prompt"],
      },
      zodSchema: generateTestSchema,
      category: "testing",
      riskLevel: "medium",
      source: "talos",
      handler: async (args) => {
        const parsed = generateTestSchema.parse(args);
        const app = repository.getApplication(parsed.applicationId);
        if (!app) {
          return { text: `Application not found: ${parsed.applicationId}`, isError: true };
        }

        // TODO: Integrate with TestGenerator for AI-powered generation
        return {
          text: `Test generation queued for application "${app.name}". Prompt: "${parsed.prompt}"`,
        };
      },
    },

    // ── Discovery ─────────────────────────────────────────────────────────────
    {
      name: "talos-discover-repository",
      description: "Discover and index a repository's codebase for RAG context",
      inputSchema: {
        type: "object",
        properties: {
          applicationId: { type: "string", description: "Application UUID" },
          force: { type: "boolean", description: "Force re-index even if already indexed" },
        },
        required: ["applicationId"],
      },
      zodSchema: discoverRepositorySchema,
      category: "testing",
      riskLevel: "medium",
      source: "talos",
      handler: async (args) => {
        const parsed = discoverRepositorySchema.parse(args);
        const app = repository.getApplication(parsed.applicationId);
        if (!app) {
          return { text: `Application not found: ${parsed.applicationId}`, isError: true };
        }

        // TODO: Integrate with DiscoveryEngine for GitHub MCP discovery
        return {
          text: `Discovery job queued for "${app.name}" (${app.repositoryUrl})`,
        };
      },
    },

    // ── Test Runs ─────────────────────────────────────────────────────────────
    {
      name: "talos-get-test-run",
      description: "Get details of a specific test run including artifacts",
      inputSchema: {
        type: "object",
        properties: {
          runId: { type: "string", description: "Test run UUID" },
        },
        required: ["runId"],
      },
      zodSchema: getTestRunSchema,
      category: "testing",
      riskLevel: "low",
      source: "talos",
      handler: async (args) => {
        const parsed = getTestRunSchema.parse(args);
        const run = repository.getTestRun(parsed.runId);
        if (!run) {
          return { text: `Test run not found: ${parsed.runId}`, isError: true };
        }
        const artifacts = repository.listArtifactsByRun(run.id);
        return {
          text: JSON.stringify({ ...run, artifacts }, null, 2),
        };
      },
    },

    {
      name: "talos-list-test-runs",
      description: "List recent test runs for an application or specific test",
      inputSchema: {
        type: "object",
        properties: {
          applicationId: { type: "string", description: "Filter by application UUID" },
          testId: { type: "string", description: "Filter by test UUID" },
          limit: { type: "number", description: "Maximum results (default 50)" },
        },
      },
      zodSchema: listTestRunsSchema,
      category: "testing",
      riskLevel: "low",
      source: "talos",
      handler: async (args) => {
        const parsed = listTestRunsSchema.parse(args);
        let runs;
        if (parsed.testId) {
          runs = repository.listRunsByTest(parsed.testId, parsed.limit ?? 20);
        } else if (parsed.applicationId) {
          runs = repository.listRunsByApp(parsed.applicationId, parsed.limit ?? 50);
        } else {
          return { text: "Either applicationId or testId is required", isError: true };
        }
        return {
          text: JSON.stringify(
            runs.map((r) => ({
              id: r.id,
              testId: r.testId,
              status: r.status,
              trigger: r.trigger,
              browser: r.browser,
              durationMs: r.durationMs,
              createdAt: r.createdAt,
            })),
            null,
            2
          ),
        };
      },
    },

    // ── Self-Healing ──────────────────────────────────────────────────────────
    {
      name: "talos-heal-test",
      description: "Attempt to automatically heal a failed test using AI analysis",
      inputSchema: {
        type: "object",
        properties: {
          testRunId: { type: "string", description: "Failed test run UUID to heal" },
          autoApply: { type: "boolean", description: "Auto-apply fix if confidence is high" },
        },
        required: ["testRunId"],
      },
      zodSchema: healTestSchema,
      category: "testing",
      riskLevel: "high",
      source: "talos",
      handler: async (args) => {
        const parsed = healTestSchema.parse(args);
        const run = repository.getTestRun(parsed.testRunId);
        if (!run) {
          return { text: `Test run not found: ${parsed.testRunId}`, isError: true };
        }
        if (run.status !== "failed") {
          return { text: `Test run is not failed (status: ${run.status})`, isError: true };
        }

        // TODO: Integrate with HealingEngine for AI-powered fix generation
        return {
          text: `Healing analysis queued for test run ${run.id}`,
        };
      },
    },

    // ── Export ────────────────────────────────────────────────────────────────
    {
      name: "talos-export-tests",
      description: "Export tests as standalone Playwright scripts for local execution",
      inputSchema: {
        type: "object",
        properties: {
          applicationId: { type: "string", description: "Application UUID" },
          testIds: {
            type: "array",
            items: { type: "string" },
            description: "Specific test UUIDs to export (all if omitted)",
          },
          format: {
            type: "string",
            enum: ["playwright", "standalone"],
            description: "Export format",
          },
          platform: {
            type: "string",
            enum: ["macos", "windows", "linux"],
            description: "Target platform",
          },
        },
        required: ["applicationId"],
      },
      zodSchema: exportTestsSchema,
      category: "testing",
      riskLevel: "medium",
      source: "talos",
      handler: async (args) => {
        const parsed = exportTestsSchema.parse(args);
        const app = repository.getApplication(parsed.applicationId);
        if (!app) {
          return { text: `Application not found: ${parsed.applicationId}`, isError: true };
        }

        // TODO: Integrate with ExportEngine for packaged test export
        return {
          text: `Export queued for "${app.name}" (format: ${parsed.format ?? "playwright"}, platform: ${parsed.platform ?? "current"})`,
        };
      },
    },
  ];
}
