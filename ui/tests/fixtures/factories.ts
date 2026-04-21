/**
 * Typed test fixtures + factory helpers (epic #537 / sub-issue #541).
 *
 * Every `make*()` helper returns a fully-populated object that matches the
 * UI-side TypeScript type. Tests pass a `Partial<T>` override to vary only
 * the fields they care about. If the upstream type changes, these factories
 * fail to compile — guaranteeing fixtures stay in lock-step with reality.
 */
import type {
  TalosApplication,
  TalosTest,
  TalosTestRun,
  TalosTestArtifact,
  TalosVaultRole,
  GeneratedTest,
  KnowledgeDocument,
  KnowledgeStats,
  ChatSession,
} from "@/lib/api";

// ── Generic helpers ──────────────────────────────────────────────────────────

let counter = 0;
const nextId = (prefix: string) => `${prefix}-${(++counter).toString().padStart(4, "0")}`;
const isoNow = () => new Date("2026-04-21T12:00:00.000Z").toISOString();

function merge<T extends object>(base: T, overrides?: Partial<T>): T {
  return overrides ? { ...base, ...overrides } : base;
}

// ── Application ──────────────────────────────────────────────────────────────

export function makeApplication(overrides?: Partial<TalosApplication>): TalosApplication {
  const id = overrides?.id ?? nextId("app");
  return merge<TalosApplication>(
    {
      id,
      name: `Test App ${id}`,
      description: "Sample application used in e2e tests",
      repositoryUrl: "https://github.com/example/test-app",
      branch: "main",
      githubPatRef: null,
      baseUrl: "https://app.example.com",
      status: "active",
      exportRepoUrl: null,
      metadata: {},
      createdAt: isoNow(),
      updatedAt: isoNow(),
    },
    overrides
  );
}

// ── Vault Role ───────────────────────────────────────────────────────────────

export function makeVaultRole(overrides?: Partial<TalosVaultRole>): TalosVaultRole {
  const id = overrides?.id ?? nextId("vault");
  return merge<TalosVaultRole>(
    {
      id,
      applicationId: "app-0001",
      roleType: "standard",
      name: `Vault Role ${id}`,
      description: "Test vault role",
      usernameRef: "secret://username",
      passwordRef: "secret://password",
      additionalRefs: {},
      isActive: true,
      metadata: {},
      createdAt: isoNow(),
      updatedAt: isoNow(),
    },
    overrides
  );
}

// ── Test ─────────────────────────────────────────────────────────────────────

export function makeTest(overrides?: Partial<TalosTest>): TalosTest {
  const id = overrides?.id ?? nextId("test");
  return merge<TalosTest>(
    {
      id,
      applicationId: "app-0001",
      name: `Test ${id}`,
      description: "Sample test for e2e",
      type: "e2e",
      code: "// test code\nimport { test } from '@playwright/test';\ntest('demo', async () => {});\n",
      version: "1.0.0",
      status: "active",
      pomDependencies: [],
      selectors: [],
      embeddingId: null,
      generationConfidence: 0.85,
      codeHash: "deadbeef",
      tags: ["sample"],
      metadata: {},
      createdAt: isoNow(),
      updatedAt: isoNow(),
    },
    overrides
  );
}

// ── Test Run ─────────────────────────────────────────────────────────────────

export function makeTestRun(overrides?: Partial<TalosTestRun>): TalosTestRun {
  const id = overrides?.id ?? nextId("run");
  return merge<TalosTestRun>(
    {
      id,
      applicationId: "app-0001",
      testId: "test-0001",
      status: "passed",
      trigger: "manual",
      browser: "chromium",
      environment: "ci",
      durationMs: 1234,
      errorMessage: null,
      errorStack: null,
      retryAttempt: 0,
      vaultRoleId: null,
      taskId: null,
      metadata: {},
      createdAt: isoNow(),
      startedAt: isoNow(),
      completedAt: isoNow(),
    },
    overrides
  );
}

// ── Artifact ─────────────────────────────────────────────────────────────────

export function makeArtifact(overrides?: Partial<TalosTestArtifact>): TalosTestArtifact {
  const id = overrides?.id ?? nextId("art");
  return merge<TalosTestArtifact>(
    {
      id,
      testRunId: "run-0001",
      type: "screenshot",
      filePath: `/artifacts/${id}.png`,
      mimeType: "image/png",
      sizeBytes: 1024,
      stepName: null,
      metadata: {},
      createdAt: isoNow(),
    },
    overrides
  );
}

// ── Generated Test ───────────────────────────────────────────────────────────

export type GenerationPath = "raw" | "raw-copilot" | "rag-backed" | "skeleton";

export interface GeneratedTestWithPath extends GeneratedTest {
  generationPath?: GenerationPath;
  chunkCount?: number;
}

export function makeGeneratedTest(overrides?: Partial<GeneratedTestWithPath>): GeneratedTestWithPath {
  const id = overrides?.id ?? nextId("gentest");
  return merge<GeneratedTestWithPath>(
    {
      id,
      code: "import { test } from '@playwright/test';\ntest('generated', async () => {});\n",
      name: "Generated Test",
      confidence: 0.9,
      generationPath: "rag-backed",
      chunkCount: 7,
    },
    overrides
  );
}

// ── Knowledge ────────────────────────────────────────────────────────────────

export function makeKnowledgeStats(overrides?: Partial<KnowledgeStats>): KnowledgeStats {
  return merge<KnowledgeStats>(
    {
      documentCount: 12,
      chunkCount: 87,
      lastIndexedAt: isoNow(),
    },
    overrides
  );
}

export function makeKnowledgeDocument(overrides?: Partial<KnowledgeDocument>): KnowledgeDocument {
  const id = overrides?.id ?? nextId("doc");
  return merge<KnowledgeDocument>(
    {
      id,
      applicationId: "app-0001",
      filePath: `/docs/${id}.md`,
      type: "markdown",
      chunkCount: 5,
      indexedAt: isoNow(),
    },
    overrides
  );
}

// ── Chunks (RAG) ─────────────────────────────────────────────────────────────

export interface FixtureChunk {
  id: string;
  content: string;
  filePath: string;
  score: number;
  snippet?: string;
}

export function makeChunk(overrides?: Partial<FixtureChunk>): FixtureChunk {
  const id = overrides?.id ?? nextId("chunk");
  return merge<FixtureChunk>(
    {
      id,
      content: "Sample chunk text retrieved from the vector store.",
      filePath: `/docs/${id}.md`,
      score: 0.87,
      snippet: "Sample chunk text retrieved from the vector store.",
    },
    overrides
  );
}

// ── Chat session ─────────────────────────────────────────────────────────────

export function makeChatSession(overrides?: Partial<ChatSession>): ChatSession {
  const id = overrides?.id ?? nextId("session");
  return merge<ChatSession>(
    {
      id,
      startedAt: isoNow(),
      lastMessageAt: isoNow(),
      messageCount: 4,
      preview: "Hello, how can I generate tests?",
    },
    overrides
  );
}

// ── Agent / Skill / Prompt — these types are not exported from ui/lib/api ────
// Use lightweight structural types so factories remain useful without coupling
// to backend internal shapes.

export interface FixtureAgent {
  id: string;
  name: string;
  description: string;
  model: string;
  skills: string[];
  systemPrompt?: string;
  createdAt: string;
  updatedAt: string;
}

export function makeAgent(overrides?: Partial<FixtureAgent>): FixtureAgent {
  const id = overrides?.id ?? nextId("agent");
  return merge<FixtureAgent>(
    {
      id,
      name: `Agent ${id}`,
      description: "Test agent",
      model: "gpt-4o",
      skills: [],
      systemPrompt: "You are a test agent.",
      createdAt: isoNow(),
      updatedAt: isoNow(),
    },
    overrides
  );
}

export interface FixtureSkill {
  id: string;
  name: string;
  description: string;
  instructions: string;
  category?: string;
  createdAt: string;
  updatedAt: string;
}

export function makeSkill(overrides?: Partial<FixtureSkill>): FixtureSkill {
  const id = overrides?.id ?? nextId("skill");
  return merge<FixtureSkill>(
    {
      id,
      name: `Skill ${id}`,
      description: "Test skill",
      instructions: "Do the thing.",
      category: "general",
      createdAt: isoNow(),
      updatedAt: isoNow(),
    },
    overrides
  );
}

export interface FixturePrompt {
  id: string;
  name: string;
  body: string;
  category: string;
  variables: { key: string; value: string }[];
  createdAt: string;
  updatedAt: string;
}

export function makePrompt(overrides?: Partial<FixturePrompt>): FixturePrompt {
  const id = overrides?.id ?? nextId("prompt");
  return merge<FixturePrompt>(
    {
      id,
      name: `Prompt ${id}`,
      body: "Sample prompt body with {{variable}}",
      category: "general",
      variables: [{ key: "variable", value: "default" }],
      createdAt: isoNow(),
      updatedAt: isoNow(),
    },
    overrides
  );
}

// ── Schedule (cron) ──────────────────────────────────────────────────────────

export interface FixtureSchedule {
  id: string;
  name: string;
  cronExpression: string;
  enabled: boolean;
  testId?: string;
  applicationId?: string;
  nextRunAt?: string;
  lastRunAt?: string;
  createdAt: string;
  updatedAt: string;
}

export function makeSchedule(overrides?: Partial<FixtureSchedule>): FixtureSchedule {
  const id = overrides?.id ?? nextId("sched");
  return merge<FixtureSchedule>(
    {
      id,
      name: `Schedule ${id}`,
      cronExpression: "0 9 * * 1-5",
      enabled: true,
      testId: "test-0001",
      applicationId: "app-0001",
      nextRunAt: new Date(Date.now() + 60_000).toISOString(),
      lastRunAt: new Date(Date.now() - 60_000).toISOString(),
      createdAt: isoNow(),
      updatedAt: isoNow(),
    },
    overrides
  );
}

// ── Task ─────────────────────────────────────────────────────────────────────

export interface FixtureTask {
  id: string;
  type: string;
  status: "pending" | "running" | "completed" | "failed";
  applicationId?: string;
  payload?: Record<string, unknown>;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}

export function makeTask(overrides?: Partial<FixtureTask>): FixtureTask {
  const id = overrides?.id ?? nextId("task");
  return merge<FixtureTask>(
    {
      id,
      type: "test-run",
      status: "pending",
      applicationId: "app-0001",
      payload: { testId: "test-0001" },
      errorMessage: null,
      createdAt: isoNow(),
      updatedAt: isoNow(),
    },
    overrides
  );
}

// ── API Key ──────────────────────────────────────────────────────────────────

export interface FixtureApiKey {
  id: string;
  name: string;
  maskedKey: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export function makeApiKey(overrides?: Partial<FixtureApiKey>): FixtureApiKey {
  const id = overrides?.id ?? nextId("key");
  return merge<FixtureApiKey>(
    {
      id,
      name: `Key ${id}`,
      maskedKey: "sk-...abcd",
      createdAt: isoNow(),
      lastUsedAt: null,
    },
    overrides
  );
}

// Reset the internal counter so two specs that both rely on `nextId()` order
// remain deterministic.
export function resetFactoryCounter(): void {
  counter = 0;
}
