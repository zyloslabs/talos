/**
 * Talos MCP Tools Factory
 *
 * Creates MCP tool definitions for the Talos module.
 * Follows Talos ToolDefinition pattern with Zod schemas.
 */

import * as z from "zod";
import type { TalosRepository } from "./repository.js";
import type { TalosConfig } from "./config.js";
import type { DocumentIngester } from "./knowledge/document-ingester.js";
import type { CriteriaGenerator } from "./knowledge/criteria-generator.js";
import type { PlaywrightRunner } from "./runner/playwright-runner.js";
import type { TestGenerator } from "./generator/test-generator.js";
import type { DiscoveryEngine } from "./discovery/discovery-engine.js";
import type { HealingEngine } from "./healing/healing-engine.js";
import { WebCrawler } from "./crawler/web-crawler.js";
import { InterviewEngine } from "./interview/interview-engine.js";
import { PomGenerator } from "./generator/pom-generator.js";
import { DataSeeder } from "./generator/data-seeder.js";
import { TotpGenerator, EmailProvider } from "./tools/email-otp.js";
import { SecurityScanner } from "./security/index.js";
import { AccessibilityScanner } from "./accessibility/index.js";
import type { WcagLevel } from "./accessibility/index.js";
import { VisualRegressionEngine } from "./visual/index.js";
import { PerformanceCollector } from "./performance/index.js";

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

// ── New Tool Schemas (#469) ───────────────────────────────────────────────────

const crawlAppSchema = z.object({
  applicationId: z.string().uuid(),
  maxDepth: z.number().min(1).max(10).optional(),
  maxPages: z.number().min(1).max(200).optional(),
});

const interviewSchema = z.object({
  applicationId: z.string().uuid(),
  request: z.string().min(5),
});

const interviewAnswerSchema = z.object({
  sessionId: z.string().uuid(),
  answers: z.array(
    z.object({
      questionId: z.string().uuid(),
      answer: z.string().min(1),
    })
  ),
});

const generatePomSchema = z.object({
  applicationId: z.string().uuid(),
});

const seedTestDataSchema = z.object({
  strategy: z.enum(["api", "sql", "fixture"]).optional(),
  setupScript: z.string().optional(),
  cleanupScript: z.string().optional(),
  fixtures: z.array(z.record(z.string(), z.unknown())).optional(),
  parameters: z.record(z.string(), z.string()).optional(),
});

const createTempEmailSchema = z.object({});

const waitForOtpSchema = z.object({
  emailId: z.string(),
  maxWaitMs: z.number().optional(),
});

const generateTotpSchema = z.object({
  secret: z.string().min(1),
  digits: z.number().min(4).max(8).optional(),
  period: z.number().min(15).max(120).optional(),
  algorithm: z.enum(["SHA1", "SHA256", "SHA512"]).optional(),
});

const exportTestsSchema = z.object({
  applicationId: z.string().uuid(),
  testIds: z.array(z.string().uuid()).optional(),
  format: z.enum(["playwright", "standalone"]).optional(),
  platform: z.enum(["macos", "windows", "linux"]).optional(),
});

// ── Knowledge & Criteria Schemas ──────────────────────────────────────────────

const ingestDocumentSchema = z.object({
  applicationId: z.string(),
  content: z.string().min(1),
  format: z.enum(["markdown", "openapi_yaml", "openapi_json"]),
  fileName: z.string().min(1),
  docType: z.enum(["prd", "user_story", "api_spec", "functional_spec"]),
  version: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const generateCriteriaSchema = z.object({
  applicationId: z.string(),
  requirementFilter: z.string().optional(),
  maxCriteria: z.number().min(1).max(100).optional(),
});

const getTraceabilitySchema = z.object({
  applicationId: z.string(),
});

const scenarioSchema = z.object({
  given: z.string(),
  when: z.string(),
  then: z.string(),
});

const createCriteriaSchema = z.object({
  applicationId: z.string(),
  requirementChunkId: z.string().optional(),
  title: z.string().min(1),
  description: z.string(),
  scenarios: z.array(scenarioSchema).optional(),
  preconditions: z.array(z.string()).optional(),
  dataRequirements: z.array(z.string()).optional(),
  nfrTags: z.array(z.string()).optional(),
  status: z.enum(["draft", "approved", "implemented", "deprecated"]).optional(),
  confidence: z.number().min(0).max(1).optional(),
  tags: z.array(z.string()).optional(),
});

const updateCriteriaSchema = z.object({
  id: z.string(),
  requirementChunkId: z.string().optional(),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  scenarios: z.array(scenarioSchema).optional(),
  preconditions: z.array(z.string()).optional(),
  dataRequirements: z.array(z.string()).optional(),
  nfrTags: z.array(z.string()).optional(),
  status: z.enum(["draft", "approved", "implemented", "deprecated"]).optional(),
  confidence: z.number().min(0).max(1).optional(),
  tags: z.array(z.string()).optional(),
});

const listCriteriaSchema = z.object({
  applicationId: z.string(),
  status: z.enum(["draft", "approved", "implemented", "deprecated"]).optional(),
  tags: z.array(z.string()).optional(),
  nfrTags: z.array(z.string()).optional(),
});

const deleteCriteriaSchema = z.object({
  id: z.string(),
});

// ── Non-Functional Testing Schemas (#490) ─────────────────────────────────────

const securityScanSchema = z.object({
  url: z.string().url(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.string().optional(),
  statusCode: z.number().optional(),
});

const accessibilityScanSchema = z.object({
  url: z.string().url(),
  htmlContent: z.string().min(1),
  targetLevel: z.enum(["A", "AA", "AAA"]).optional(),
});

const visualCompareSchema = z.object({
  appId: z.string(),
  pageId: z.string(),
  screenshotBase64: z.string().min(1),
  mode: z.enum(["baseline", "compare"]).optional(),
  threshold: z.number().min(0).max(100).optional(),
});

const performanceCaptureSchema = z.object({
  rawEntries: z.array(z.record(z.string(), z.unknown())),
  baselineUrl: z.string().url().optional(),
  baselineMetrics: z.record(z.string(), z.unknown()).optional(),
});

// ── Tool Factory ──────────────────────────────────────────────────────────────

export type TalosToolsOptions = {
  repository: TalosRepository;
  config: TalosConfig;
  documentIngester?: DocumentIngester;
  criteriaGenerator?: CriteriaGenerator;
  playwrightRunner?: PlaywrightRunner;
  testGenerator?: TestGenerator;
  discoveryEngine?: DiscoveryEngine;
  healingEngine?: HealingEngine;
};

export function createTalosTools(options: TalosToolsOptions): ToolDefinition[] {
  const {
    repository,
    documentIngester,
    criteriaGenerator,
    playwrightRunner,
    testGenerator,
    discoveryEngine,
    healingEngine,
  } = options;

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

        // If no PlaywrightRunner is wired, surface the queued status (#526)
        if (!playwrightRunner) {
          return {
            text: `Created test run ${run.id} for test "${test.name}". Status: ${run.status} (runner not configured)`,
          };
        }

        // Execute via PlaywrightRunner (#526)
        try {
          const application = repository.getApplication(test.applicationId) ?? undefined;
          const result = await playwrightRunner.executeTest(test, run, {
            browser: parsed.browser,
            application,
          });
          return {
            text: JSON.stringify(
              {
                runId: run.id,
                testId: test.id,
                status: result.status,
                durationMs: result.durationMs,
                errorMessage: result.errorMessage,
                artifactCounts: {
                  screenshots: result.artifacts.screenshots.length,
                  videos: result.artifacts.videos.length,
                  traces: result.artifacts.traces.length,
                  logs: result.artifacts.logs.length,
                },
              },
              null,
              2
            ),
            isError: result.status === "failed",
          };
        } catch (error) {
          return {
            text: `Test execution failed: ${error instanceof Error ? error.message : String(error)}`,
            isError: true,
          };
        }
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

        // If no TestGenerator is wired, surface queued status (#527)
        if (!testGenerator) {
          return {
            text: `Test generation queued for application "${app.name}". Prompt: "${parsed.prompt}" (generator not configured)`,
          };
        }

        // Invoke TestGenerator (#527)
        try {
          const result = await testGenerator.generate({
            applicationId: parsed.applicationId,
            request: parsed.prompt,
            tags: ["mcp-generated"],
          });
          if (!result.success || !result.test) {
            return {
              text: `Generation failed after ${result.attempts} attempt(s): ${result.error ?? "unknown error"}`,
              isError: true,
            };
          }
          return {
            text: JSON.stringify(
              {
                testId: result.test.id,
                name: result.test.name,
                code: result.test.code,
                attempts: result.attempts,
                confidence: result.test.generationConfidence,
              },
              null,
              2
            ),
          };
        } catch (error) {
          return {
            text: `Test generation failed: ${error instanceof Error ? error.message : String(error)}`,
            isError: true,
          };
        }
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

        // If no DiscoveryEngine is wired, surface queued status (#528)
        if (!discoveryEngine) {
          return {
            text: `Discovery job queued for "${app.name}" (${app.repositoryUrl}) — engine not configured`,
          };
        }

        // Invoke DiscoveryEngine (#528)
        try {
          const job = await discoveryEngine.startDiscovery(app, parsed.force ?? false);
          return {
            text: JSON.stringify(
              {
                jobId: job.id,
                applicationId: job.applicationId,
                status: job.status,
                filesDiscovered: job.filesDiscovered,
                filesIndexed: job.filesIndexed,
                chunksCreated: job.chunksCreated,
                errorMessage: job.errorMessage,
              },
              null,
              2
            ),
            isError: job.status === "failed",
          };
        } catch (error) {
          return {
            text: `Discovery failed: ${error instanceof Error ? error.message : String(error)}`,
            isError: true,
          };
        }
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

        // If no HealingEngine is wired, surface queued status (#529)
        if (!healingEngine) {
          return {
            text: `Healing analysis queued for test run ${run.id} (engine not configured)`,
          };
        }

        // Invoke HealingEngine (#529)
        try {
          const result = await healingEngine.heal(run);
          return {
            text: JSON.stringify(
              {
                runId: run.id,
                success: result.success,
                attemptStatus: result.attempt.status,
                analysis: result.analysis
                  ? {
                      rootCause: result.analysis.rootCause,
                      category: result.analysis.category,
                      confidence: result.analysis.confidence,
                    }
                  : null,
                fixApplied: result.fixResult?.selectedFix?.changeDescription ?? null,
                verificationStatus: result.verificationRun?.status ?? null,
                error: result.error,
              },
              null,
              2
            ),
            isError: !result.success,
          };
        } catch (error) {
          return {
            text: `Healing failed: ${error instanceof Error ? error.message : String(error)}`,
            isError: true,
          };
        }
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

    // ── Knowledge & Criteria ───────────────────────────────────────────────────
    {
      name: "talos_ingest_document",
      description:
        "Ingest a requirements document (Markdown, OpenAPI) into the Talos knowledge base for RAG-powered test generation",
      inputSchema: {
        type: "object",
        properties: {
          applicationId: { type: "string", description: "Application identifier" },
          content: { type: "string", description: "Raw document content" },
          format: {
            type: "string",
            enum: ["markdown", "openapi_yaml", "openapi_json"],
            description: "Document format",
          },
          fileName: { type: "string", description: "Source file name" },
          docType: {
            type: "string",
            enum: ["prd", "user_story", "api_spec", "functional_spec"],
            description: "Type of document",
          },
          version: { type: "string", description: "Document version tag" },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Additional tags",
          },
        },
        required: ["applicationId", "content", "format", "fileName", "docType"],
      },
      zodSchema: ingestDocumentSchema,
      category: "knowledge",
      riskLevel: "medium",
      source: "talos",
      handler: async (args) => {
        if (!documentIngester) {
          return {
            text: "Knowledge module not configured. Provide a DocumentIngester in TalosToolsOptions.",
            isError: true,
          };
        }
        const parsed = ingestDocumentSchema.parse(args);
        const result = await documentIngester.ingestDocument(parsed.applicationId, parsed.content, parsed.format, {
          fileName: parsed.fileName,
          docType: parsed.docType,
          version: parsed.version,
          tags: parsed.tags,
        });
        return {
          text: JSON.stringify(
            {
              chunksCreated: result.chunksCreated,
              chunksSkipped: result.chunksSkipped,
              totalTokens: result.totalTokens,
              docId: result.docId,
            },
            null,
            2
          ),
        };
      },
    },

    {
      name: "talos_generate_criteria",
      description: "Generate acceptance criteria from requirements in the knowledge base using AI/RAG",
      inputSchema: {
        type: "object",
        properties: {
          applicationId: { type: "string", description: "Application identifier" },
          requirementFilter: {
            type: "string",
            description: "Filter query for which requirements to generate criteria from",
          },
          maxCriteria: {
            type: "number",
            description: "Maximum number of criteria to generate (1-100)",
          },
        },
        required: ["applicationId"],
      },
      zodSchema: generateCriteriaSchema,
      category: "knowledge",
      riskLevel: "medium",
      source: "talos",
      handler: async (args) => {
        if (!criteriaGenerator) {
          return {
            text: "Knowledge module not configured. Provide a CriteriaGenerator in TalosToolsOptions.",
            isError: true,
          };
        }
        const parsed = generateCriteriaSchema.parse(args);
        const result = await criteriaGenerator.generateCriteria(parsed.applicationId, {
          requirementFilter: parsed.requirementFilter,
          maxCriteria: parsed.maxCriteria,
        });
        return {
          text: JSON.stringify(
            {
              criteriaCreated: result.criteriaCreated,
              averageConfidence: result.averageConfidence,
            },
            null,
            2
          ),
        };
      },
    },

    {
      name: "talos_get_traceability",
      description:
        "Get the requirements traceability report for an application, showing coverage of requirements to criteria to tests",
      inputSchema: {
        type: "object",
        properties: {
          applicationId: { type: "string", description: "Application identifier" },
        },
        required: ["applicationId"],
      },
      zodSchema: getTraceabilitySchema,
      category: "knowledge",
      riskLevel: "low",
      source: "talos",
      handler: async (args) => {
        const parsed = getTraceabilitySchema.parse(args);
        const report = repository.getCoverageReport(parsed.applicationId);
        const lines: string[] = [
          `Traceability Report for ${parsed.applicationId}`,
          `──────────────────────────────────────`,
          `Requirements: ${report.coveredRequirements}/${report.totalRequirements} covered (${report.coveragePercentage}%)`,
          `Criteria: ${report.implementedCriteria}/${report.totalCriteria} implemented`,
          `Unmapped requirements: ${report.unmappedRequirements.length}`,
          `Untested criteria: ${report.untestedCriteria.length}`,
        ];
        if (report.unmappedRequirements.length > 0) {
          lines.push(`\nUnmapped requirement IDs: ${report.unmappedRequirements.join(", ")}`);
        }
        if (report.untestedCriteria.length > 0) {
          lines.push(`Untested criteria IDs: ${report.untestedCriteria.join(", ")}`);
        }
        return { text: lines.join("\n") };
      },
    },

    {
      name: "talos_create_criteria",
      description: "Create a new acceptance criterion for an application",
      inputSchema: {
        type: "object",
        properties: {
          applicationId: { type: "string", description: "Application identifier" },
          requirementChunkId: { type: "string", description: "Linked requirement chunk ID" },
          title: { type: "string", description: "Criterion title" },
          description: { type: "string", description: "Detailed description" },
          scenarios: {
            type: "array",
            items: {
              type: "object",
              properties: {
                given: { type: "string" },
                when: { type: "string" },
                then: { type: "string" },
              },
              required: ["given", "when", "then"],
            },
            description: "Given/When/Then scenarios",
          },
          preconditions: { type: "array", items: { type: "string" } },
          dataRequirements: { type: "array", items: { type: "string" } },
          nfrTags: { type: "array", items: { type: "string" } },
          status: {
            type: "string",
            enum: ["draft", "approved", "implemented", "deprecated"],
          },
          confidence: { type: "number", description: "Confidence score 0-1" },
          tags: { type: "array", items: { type: "string" } },
        },
        required: ["applicationId", "title", "description"],
      },
      zodSchema: createCriteriaSchema,
      category: "knowledge",
      riskLevel: "medium",
      source: "talos",
      handler: async (args) => {
        const parsed = createCriteriaSchema.parse(args);
        const criteria = repository.createAcceptanceCriteria(parsed);
        return {
          text: JSON.stringify(
            {
              id: criteria.id,
              title: criteria.title,
              status: criteria.status,
              confidence: criteria.confidence,
            },
            null,
            2
          ),
        };
      },
    },

    {
      name: "talos_update_criteria",
      description: "Update an existing acceptance criterion by ID",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Criterion UUID" },
          requirementChunkId: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          scenarios: {
            type: "array",
            items: {
              type: "object",
              properties: {
                given: { type: "string" },
                when: { type: "string" },
                then: { type: "string" },
              },
              required: ["given", "when", "then"],
            },
          },
          preconditions: { type: "array", items: { type: "string" } },
          dataRequirements: { type: "array", items: { type: "string" } },
          nfrTags: { type: "array", items: { type: "string" } },
          status: {
            type: "string",
            enum: ["draft", "approved", "implemented", "deprecated"],
          },
          confidence: { type: "number" },
          tags: { type: "array", items: { type: "string" } },
        },
        required: ["id"],
      },
      zodSchema: updateCriteriaSchema,
      category: "knowledge",
      riskLevel: "medium",
      source: "talos",
      handler: async (args) => {
        const parsed = updateCriteriaSchema.parse(args);
        const { id, ...updates } = parsed;
        const criteria = repository.updateAcceptanceCriteria(id, updates);
        if (!criteria) {
          return { text: `Acceptance criteria not found: ${id}`, isError: true };
        }
        return {
          text: JSON.stringify(
            {
              id: criteria.id,
              title: criteria.title,
              status: criteria.status,
              confidence: criteria.confidence,
              updatedAt: criteria.updatedAt.toISOString(),
            },
            null,
            2
          ),
        };
      },
    },

    {
      name: "talos_list_criteria",
      description: "List acceptance criteria for an application with optional filters",
      inputSchema: {
        type: "object",
        properties: {
          applicationId: { type: "string", description: "Application identifier" },
          status: {
            type: "string",
            enum: ["draft", "approved", "implemented", "deprecated"],
            description: "Filter by status",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Filter by tags",
          },
          nfrTags: {
            type: "array",
            items: { type: "string" },
            description: "Filter by NFR tags",
          },
        },
        required: ["applicationId"],
      },
      zodSchema: listCriteriaSchema,
      category: "knowledge",
      riskLevel: "low",
      source: "talos",
      handler: async (args) => {
        const parsed = listCriteriaSchema.parse(args);
        const { applicationId, ...filters } = parsed;
        const criteria = repository.listAcceptanceCriteria(applicationId, filters);
        return {
          text: JSON.stringify(
            criteria.map((c) => ({
              id: c.id,
              title: c.title,
              status: c.status,
              confidence: c.confidence,
              tags: c.tags,
              nfrTags: c.nfrTags,
            })),
            null,
            2
          ),
        };
      },
    },

    {
      name: "talos_delete_criteria",
      description: "Permanently delete an acceptance criterion by ID",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Criterion UUID to delete" },
        },
        required: ["id"],
      },
      zodSchema: deleteCriteriaSchema,
      category: "knowledge",
      riskLevel: "high",
      source: "talos",
      handler: async (args) => {
        const parsed = deleteCriteriaSchema.parse(args);
        const deleted = repository.deleteAcceptanceCriteria(parsed.id);
        if (!deleted) {
          return { text: `Acceptance criteria not found: ${parsed.id}`, isError: true };
        }
        return { text: `Deleted acceptance criteria ${parsed.id}` };
      },
    },

    // ── Web Crawler (#477, #486) ──────────────────────────────────────────────
    {
      name: "talos_crawl_app",
      description:
        "Crawl a web application using Playwright, discovering pages, forms, and interactive elements via the accessibility tree. Stores crawled data in RAG.",
      inputSchema: {
        type: "object",
        properties: {
          applicationId: { type: "string", description: "Application UUID" },
          maxDepth: { type: "number", description: "Maximum crawl depth (1-10, default 3)" },
          maxPages: { type: "number", description: "Maximum pages to crawl (1-200, default 50)" },
        },
        required: ["applicationId"],
      },
      zodSchema: crawlAppSchema,
      category: "testing",
      riskLevel: "medium",
      source: "talos",
      handler: async (args) => {
        const parsed = crawlAppSchema.parse(args);
        const app = repository.getApplication(parsed.applicationId);
        if (!app) {
          return { text: `Application not found: ${parsed.applicationId}`, isError: true };
        }
        if (!app.baseUrl) {
          return { text: `Application has no baseUrl configured`, isError: true };
        }

        const crawler = new WebCrawler({
          maxDepth: parsed.maxDepth,
          maxPages: parsed.maxPages,
        });

        const result = await crawler.crawl(parsed.applicationId, app.baseUrl);
        return {
          text: JSON.stringify(
            {
              status: result.status,
              totalPagesCrawled: result.totalPagesCrawled,
              totalPagesDiscovered: result.totalPagesDiscovered,
              errors: result.errors.length,
              pages: result.pages.map((p) => ({
                url: p.url,
                title: p.title,
                forms: p.forms.length,
                interactiveElements: p.interactiveElements.length,
              })),
            },
            null,
            2
          ),
        };
      },
    },

    // ── Interview / Clarifying Questions (#478) ────────────────────────────────
    {
      name: "talos_interview",
      description:
        "Start an AI interview: analyze the user's test request + RAG context and generate clarifying questions about roles, auth, data, edge cases.",
      inputSchema: {
        type: "object",
        properties: {
          applicationId: { type: "string", description: "Application UUID" },
          request: { type: "string", description: "The test generation request to analyze" },
        },
        required: ["applicationId", "request"],
      },
      zodSchema: interviewSchema,
      category: "testing",
      riskLevel: "low",
      source: "talos",
      handler: async (args) => {
        const parsed = interviewSchema.parse(args);
        const app = repository.getApplication(parsed.applicationId);
        if (!app) {
          return { text: `Application not found: ${parsed.applicationId}`, isError: true };
        }

        const engine = new InterviewEngine({ repository });
        const result = await engine.generateQuestions(parsed.applicationId, parsed.request);
        return {
          text: JSON.stringify(
            {
              sessionId: result.session.id,
              questionCount: result.questionCount,
              questions: result.session.questions.map((q) => ({
                id: q.id,
                category: q.category,
                question: q.question,
                required: q.required,
                suggestedAnswers: q.suggestedAnswers,
              })),
            },
            null,
            2
          ),
        };
      },
    },

    {
      name: "talos_interview_answer",
      description: "Submit answers to interview questions and receive enriched context for test generation.",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string", description: "Interview session UUID" },
          answers: {
            type: "array",
            items: {
              type: "object",
              properties: {
                questionId: { type: "string" },
                answer: { type: "string" },
              },
              required: ["questionId", "answer"],
            },
            description: "Array of question answers",
          },
        },
        required: ["sessionId", "answers"],
      },
      zodSchema: interviewAnswerSchema,
      category: "testing",
      riskLevel: "low",
      source: "talos",
      handler: async (args) => {
        const parsed = interviewAnswerSchema.parse(args);
        const engine = new InterviewEngine({ repository });
        try {
          const result = engine.processAnswers(parsed.sessionId, parsed.answers);
          return {
            text: JSON.stringify(
              {
                allAnswered: result.allAnswered,
                status: result.session.status,
                enrichedContext: result.enrichedContext,
              },
              null,
              2
            ),
          };
        } catch (err) {
          return { text: err instanceof Error ? err.message : String(err), isError: true };
        }
      },
    },

    // ── POM Generation (#479) ─────────────────────────────────────────────────
    {
      name: "talos_generate_pom",
      description: "Auto-generate Page Object Model files from crawled web pages with accessibility-based locators.",
      inputSchema: {
        type: "object",
        properties: {
          applicationId: { type: "string", description: "Application UUID" },
        },
        required: ["applicationId"],
      },
      zodSchema: generatePomSchema,
      category: "testing",
      riskLevel: "medium",
      source: "talos",
      handler: async (args) => {
        const parsed = generatePomSchema.parse(args);
        const app = repository.getApplication(parsed.applicationId);
        if (!app) {
          return { text: `Application not found: ${parsed.applicationId}`, isError: true };
        }
        if (!app.baseUrl) {
          return { text: `Application has no baseUrl configured. Run talos_crawl_app first.`, isError: true };
        }

        // Crawl the app first to get page data
        const crawler = new WebCrawler({ maxDepth: 2, maxPages: 20 });
        const crawlResult = await crawler.crawl(parsed.applicationId, app.baseUrl);

        if (crawlResult.pages.length === 0) {
          return { text: `No pages found at ${app.baseUrl}. Check the URL.`, isError: true };
        }

        const pomGenerator = new PomGenerator();
        const result = pomGenerator.generate(parsed.applicationId, crawlResult.pages);

        return {
          text: JSON.stringify(
            {
              totalPages: result.totalPages,
              pageObjects: result.pageObjects.map((po) => ({
                className: po.className,
                filePath: po.filePath,
                url: po.url,
                locators: po.locators.length,
                methods: po.methods.length,
              })),
            },
            null,
            2
          ),
        };
      },
    },

    // ── Test Data Preparation (#480) ──────────────────────────────────────────
    {
      name: "talos_seed_test_data",
      description: "Generate test data seeding hooks (beforeAll/afterAll) for generated tests with API, SQL, or fixture strategies.",
      inputSchema: {
        type: "object",
        properties: {
          strategy: {
            type: "string",
            enum: ["api", "sql", "fixture"],
            description: "Seed strategy",
          },
          setupScript: { type: "string", description: "Custom setup script" },
          cleanupScript: { type: "string", description: "Custom cleanup script" },
          fixtures: {
            type: "array",
            items: { type: "object" },
            description: "Fixture data records",
          },
          parameters: {
            type: "object",
            description: "Parameterization values",
          },
        },
      },
      zodSchema: seedTestDataSchema,
      category: "testing",
      riskLevel: "low",
      source: "talos",
      handler: async (args) => {
        const parsed = seedTestDataSchema.parse(args);
        const seeder = new DataSeeder();
        const config = seeder.buildSeedConfig(
          parsed.strategy,
          parsed.setupScript,
          parsed.cleanupScript,
          parsed.fixtures,
          parsed.parameters
        );
        const hooks = seeder.generateSeedHooks(config);
        return {
          text: JSON.stringify(hooks, null, 2),
        };
      },
    },

    // ── Email/OTP Verification (#487) ─────────────────────────────────────────
    {
      name: "talos_create_temp_email",
      description: "Create a disposable temporary email address for testing email verification flows.",
      inputSchema: { type: "object", properties: {} },
      zodSchema: createTempEmailSchema,
      category: "testing",
      riskLevel: "low",
      source: "talos",
      handler: async () => {
        const provider = new EmailProvider();
        const account = await provider.createTempEmail();
        return {
          text: JSON.stringify(account, null, 2),
        };
      },
    },

    {
      name: "talos_wait_for_otp",
      description: "Poll a temporary email inbox for a verification/OTP code.",
      inputSchema: {
        type: "object",
        properties: {
          emailId: { type: "string", description: "Temporary email account ID" },
          maxWaitMs: { type: "number", description: "Maximum wait time in ms (default 60000)" },
        },
        required: ["emailId"],
      },
      zodSchema: waitForOtpSchema,
      category: "testing",
      riskLevel: "low",
      source: "talos",
      handler: async (args) => {
        const parsed = waitForOtpSchema.parse(args);
        const provider = new EmailProvider();
        try {
          const result = await provider.waitForOtp(parsed.emailId, {
            maxWaitMs: parsed.maxWaitMs,
          });
          return { text: JSON.stringify(result, null, 2) };
        } catch (err) {
          return { text: err instanceof Error ? err.message : String(err), isError: true };
        }
      },
    },

    {
      name: "talos_generate_totp",
      description: "Generate a TOTP (Time-based One-Time Password) code from a secret for MFA testing.",
      inputSchema: {
        type: "object",
        properties: {
          secret: { type: "string", description: "Base32-encoded TOTP secret" },
          digits: { type: "number", description: "Number of digits (default 6)" },
          period: { type: "number", description: "Time period in seconds (default 30)" },
          algorithm: {
            type: "string",
            enum: ["SHA1", "SHA256", "SHA512"],
            description: "HMAC algorithm",
          },
        },
        required: ["secret"],
      },
      zodSchema: generateTotpSchema,
      category: "testing",
      riskLevel: "low",
      source: "talos",
      handler: async (args) => {
        const parsed = generateTotpSchema.parse(args);
        const generator = new TotpGenerator();
        const code = generator.generate(parsed);
        return {
          text: JSON.stringify({ code, expiresInSeconds: parsed.period ?? 30 }, null, 2),
        };
      },
    },

    // ── Security Scanning (#492) ──────────────────────────────────────────────
    {
      name: "talos_security_scan",
      description:
        "Run passive security checks on a page response — checks headers, mixed content, exposed secrets, and misconfigurations. Maps findings to OWASP Top 10.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "Page URL" },
          headers: { type: "object", description: "HTTP response headers" },
          body: { type: "string", description: "HTML body content" },
          statusCode: { type: "number", description: "HTTP status code" },
        },
        required: ["url"],
      },
      zodSchema: securityScanSchema,
      category: "testing",
      riskLevel: "low",
      source: "talos",
      handler: async (args) => {
        const parsed = securityScanSchema.parse(args);
        const scanner = new SecurityScanner();
        const result = scanner.scan({
          url: parsed.url,
          headers: parsed.headers ?? {},
          body: parsed.body ?? "",
          statusCode: parsed.statusCode ?? 200,
        });
        return { text: JSON.stringify(result, null, 2) };
      },
    },

    // ── Accessibility Scanning (#493) ─────────────────────────────────────────
    {
      name: "talos_accessibility_scan",
      description:
        "Run WCAG accessibility checks on HTML content — checks images, forms, headings, keyboard, contrast, and ARIA. Returns violations with WCAG criteria and score.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "Page URL" },
          htmlContent: { type: "string", description: "Full HTML content of the page" },
          targetLevel: {
            type: "string",
            enum: ["A", "AA", "AAA"],
            description: "WCAG conformance level (default AA)",
          },
        },
        required: ["url", "htmlContent"],
      },
      zodSchema: accessibilityScanSchema,
      category: "testing",
      riskLevel: "low",
      source: "talos",
      handler: async (args) => {
        const parsed = accessibilityScanSchema.parse(args);
        const scanner = new AccessibilityScanner();
        const result = scanner.scan(
          parsed.htmlContent,
          parsed.url,
          (parsed.targetLevel as WcagLevel) ?? "AA"
        );
        return { text: JSON.stringify(result, null, 2) };
      },
    },

    // ── Visual Regression (#494) ──────────────────────────────────────────────
    {
      name: "talos_visual_compare",
      description:
        "Capture a visual baseline or compare a screenshot against an existing baseline. Uses pixel-level comparison with configurable threshold.",
      inputSchema: {
        type: "object",
        properties: {
          appId: { type: "string", description: "Application identifier" },
          pageId: { type: "string", description: "Page identifier" },
          screenshotBase64: { type: "string", description: "Base64-encoded PNG screenshot" },
          mode: {
            type: "string",
            enum: ["baseline", "compare"],
            description: "Mode: 'baseline' to store, 'compare' to diff (default: compare)",
          },
          threshold: {
            type: "number",
            description: "Diff threshold percentage (0-100, default 0.1)",
          },
        },
        required: ["appId", "pageId", "screenshotBase64"],
      },
      zodSchema: visualCompareSchema,
      category: "testing",
      riskLevel: "low",
      source: "talos",
      handler: async (args) => {
        const parsed = visualCompareSchema.parse(args);
        const engine = new VisualRegressionEngine({ threshold: parsed.threshold });
        const buffer = Buffer.from(parsed.screenshotBase64, "base64");

        if (parsed.mode === "baseline") {
          const baseline = engine.captureBaseline(parsed.appId, parsed.pageId, buffer);
          return { text: JSON.stringify(baseline, null, 2) };
        }

        try {
          const result = engine.compare(parsed.appId, parsed.pageId, buffer, {
            threshold: parsed.threshold,
          });
          return { text: JSON.stringify(result, null, 2) };
        } catch (err) {
          return {
            text: err instanceof Error ? err.message : String(err),
            isError: true,
          };
        }
      },
    },

    // ── Performance Capture (#495) ────────────────────────────────────────────
    {
      name: "talos_performance_capture",
      description:
        "Process raw Performance API entries into structured Web Vitals metrics (LCP, INP, CLS, TTFB, TBT). Optionally compare against a baseline.",
      inputSchema: {
        type: "object",
        properties: {
          rawEntries: {
            type: "array",
            items: { type: "object" },
            description: "Raw Performance API entries from the browser",
          },
          baselineUrl: {
            type: "string",
            description: "URL of the baseline page (for comparison)",
          },
          baselineMetrics: {
            type: "object",
            description: "Previous baseline metrics to compare against",
          },
        },
        required: ["rawEntries"],
      },
      zodSchema: performanceCaptureSchema,
      category: "testing",
      riskLevel: "low",
      source: "talos",
      handler: async (args) => {
        const parsed = performanceCaptureSchema.parse(args);
        const collector = new PerformanceCollector();
        const entries = parsed.rawEntries as Array<{
          name: string;
          entryType: string;
          startTime: number;
          duration: number;
          [key: string]: unknown;
        }>;
        const metrics = collector.captureMetrics(entries);

        if (parsed.baselineMetrics && parsed.baselineUrl) {
          const baseline = {
            url: parsed.baselineUrl,
            metrics: parsed.baselineMetrics as unknown as import("./performance/types.js").PerformanceMetrics,
            capturedAt: new Date().toISOString(),
          };
          const comparison = collector.compareWithBaseline(metrics, baseline);
          return {
            text: JSON.stringify({ metrics, comparison }, null, 2),
          };
        }

        return { text: JSON.stringify({ metrics }, null, 2) };
      },
    },
  ];
}
