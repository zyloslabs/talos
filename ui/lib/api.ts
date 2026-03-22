/**
 * Talos API client
 */

const API_BASE = process.env.NEXT_PUBLIC_TALOS_API_BASE || "";

export interface TalosApplication {
  id: string;
  name: string;
  description: string;
  repositoryUrl: string;
  githubPatRef: string | null;
  baseUrl: string;
  status: "active" | "archived" | "pending";
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface TalosTest {
  id: string;
  applicationId: string;
  name: string;
  description: string;
  type: "e2e" | "smoke" | "regression" | "accessibility" | "unit";
  code: string;
  version: string;
  status: "draft" | "active" | "disabled" | "archived";
  pomDependencies: string[];
  selectors: string[];
  embeddingId: string | null;
  generationConfidence: number | null;
  codeHash: string;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface TalosTestRun {
  id: string;
  applicationId: string;
  testId: string;
  status: "queued" | "running" | "passed" | "failed" | "skipped" | "cancelled";
  trigger: "manual" | "scheduled" | "ci" | "healing" | "test" | "healing-verification";
  browser: string;
  environment: string;
  durationMs: number | null;
  errorMessage: string | null;
  errorStack: string | null;
  retryAttempt: number;
  vaultRoleId: string | null;
  taskId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface TalosTestArtifact {
  id: string;
  testRunId: string;
  type: "screenshot" | "video" | "trace" | "log" | "report" | "diff";
  filePath: string;
  mimeType: string;
  sizeBytes: number;
  stepName: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface TalosVaultRole {
  id: string;
  applicationId: string;
  roleType: "admin" | "standard" | "guest" | "service" | "user";
  name: string;
  description: string;
  usernameRef: string;
  passwordRef: string;
  additionalRefs: Record<string, string>;
  isActive: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

// Applications
export const getApplications = () => fetchApi<TalosApplication[]>("/api/talos/applications");
export const getApplication = (id: string) => fetchApi<TalosApplication>(`/api/talos/applications/${id}`);
export const createApplication = (data: Partial<TalosApplication>) =>
  fetchApi<TalosApplication>("/api/talos/applications", {
    method: "POST",
    body: JSON.stringify(data),
  });
export const updateApplication = (id: string, data: Partial<TalosApplication>) =>
  fetchApi<TalosApplication>(`/api/talos/applications/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });

// Tests
export const getTests = (applicationId?: string) =>
  fetchApi<TalosTest[]>(applicationId ? `/api/talos/tests?applicationId=${applicationId}` : "/api/talos/tests");
export const getTest = (id: string) => fetchApi<TalosTest>(`/api/talos/tests/${id}`);
export const createTest = (data: Partial<TalosTest>) =>
  fetchApi<TalosTest>("/api/talos/tests", {
    method: "POST",
    body: JSON.stringify(data),
  });

// Test Runs
export const getTestRuns = (testId?: string) =>
  fetchApi<TalosTestRun[]>(testId ? `/api/talos/runs?testId=${testId}` : "/api/talos/runs");
export const getTestRun = (id: string) => fetchApi<TalosTestRun>(`/api/talos/runs/${id}`);
export const triggerTestRun = (testId: string, options?: { vaultRoleId?: string; environment?: string }) =>
  fetchApi<TalosTestRun>("/api/talos/runs", {
    method: "POST",
    body: JSON.stringify({ testId, ...options }),
  });

// Artifacts
export const getArtifacts = (testRunId: string) =>
  fetchApi<TalosTestArtifact[]>(`/api/talos/artifacts?testRunId=${testRunId}`);
export const getArtifact = (id: string) => fetchApi<TalosTestArtifact>(`/api/talos/artifacts/${id}`);

// Vault Roles
export const getVaultRoles = (applicationId?: string) =>
  fetchApi<TalosVaultRole[]>(
    applicationId ? `/api/talos/vault-roles?applicationId=${applicationId}` : "/api/talos/vault-roles"
  );
export const getVaultRole = (id: string) => fetchApi<TalosVaultRole>(`/api/talos/vault-roles/${id}`);
export const createVaultRole = (data: Partial<TalosVaultRole>) =>
  fetchApi<TalosVaultRole>("/api/talos/vault-roles", {
    method: "POST",
    body: JSON.stringify(data),
  });
export const updateVaultRole = (id: string, data: Partial<TalosVaultRole>) =>
  fetchApi<TalosVaultRole>(`/api/talos/vault-roles/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
export const deleteVaultRole = (id: string) =>
  fetchApi<void>(`/api/talos/vault-roles/${id}`, { method: "DELETE" });

// Discovery
export const triggerDiscovery = (applicationId: string) =>
  fetchApi<{ jobId: string }>(`/api/talos/applications/${applicationId}/discover`, { method: "POST" });

// Stats
export interface TalosStats {
  applications: number;
  tests: number;
  recentRuns: number;
  passRate: number;
}
export const getStats = () => fetchApi<TalosStats>("/api/talos/stats");

// ── Admin / Platform APIs ─────────────────────────────────────────────────────

// Auth
export interface AuthStatus { authenticated: boolean }
export const getAuthStatus = () => fetchApi<AuthStatus>("/api/admin/auth/status");
export const startDeviceAuth = () => fetchApi<{ verificationUri: string; userCode: string }>("/api/admin/auth/device", { method: "POST" });
export const waitForDeviceAuth = () => fetchApi<{ authenticated: boolean }>("/api/admin/auth/wait", { method: "POST" });

// Models
export interface ModelInfo {
  models: { id: string; capabilities?: Record<string, unknown> }[];
  selected: string;
  reasoningEffort: string;
  provider?: Record<string, unknown>;
}
export const getModels = () => fetchApi<ModelInfo>("/api/admin/models");
export const setSelectedModel = (model: string) => fetchApi<{ selected: string }>("/api/admin/models/selected", { method: "PUT", body: JSON.stringify({ model }) });
export const setReasoningEffort = (effort: string) => fetchApi<{ reasoningEffort: string }>("/api/admin/models/reasoning-effort", { method: "PUT", body: JSON.stringify({ effort }) });

// Personality
export interface Personality {
  id: string;
  name: string;
  systemPrompt: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
export const getPersonalities = () => fetchApi<{ personalities: Personality[]; activeId: string | null }>("/api/admin/personality");
export const createPersonality = (name: string, systemPrompt: string) =>
  fetchApi<Personality>("/api/admin/personality", { method: "POST", body: JSON.stringify({ name, systemPrompt }) });
export const updatePersonality = (id: string, systemPrompt: string) =>
  fetchApi<Personality>(`/api/admin/personality/${id}`, { method: "PUT", body: JSON.stringify({ systemPrompt }) });
export const activatePersonality = (id: string) =>
  fetchApi<{ activeId: string }>(`/api/admin/personality/${id}/activate`, { method: "PUT" });

// Saved Prompts
export interface SavedPrompt {
  id: string;
  name: string;
  description: string;
  content: string;
  category: string;
  tags: string[];
  stages: { name: string; prompt: string; tools?: string[] }[] | null;
  preferredTools: string[];
  createdAt: string;
  updatedAt: string;
}
export const getPrompts = (category?: string) =>
  fetchApi<SavedPrompt[]>(category ? `/api/admin/prompts?category=${category}` : "/api/admin/prompts");
export const getPrompt = (id: string) => fetchApi<SavedPrompt>(`/api/admin/prompts/${id}`);
export const createPrompt = (data: Partial<SavedPrompt>) =>
  fetchApi<SavedPrompt>("/api/admin/prompts", { method: "POST", body: JSON.stringify(data) });
export const updatePrompt = (id: string, data: Partial<SavedPrompt>) =>
  fetchApi<SavedPrompt>(`/api/admin/prompts/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deletePrompt = (id: string) =>
  fetchApi<void>(`/api/admin/prompts/${id}`, { method: "DELETE" });

// Scheduled Jobs
export interface ScheduledJob {
  id: string;
  name: string;
  description: string;
  cronExpression: string;
  prompt: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  runCount: number;
  createdAt: string;
  updatedAt: string;
}
export const getJobs = () => fetchApi<ScheduledJob[]>("/api/admin/scheduler/jobs");
export const createJob = (data: Partial<ScheduledJob>) =>
  fetchApi<ScheduledJob>("/api/admin/scheduler/jobs", { method: "POST", body: JSON.stringify(data) });
export const updateJob = (id: string, data: Partial<ScheduledJob>) =>
  fetchApi<ScheduledJob>(`/api/admin/scheduler/jobs/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteJob = (id: string) =>
  fetchApi<void>(`/api/admin/scheduler/jobs/${id}`, { method: "DELETE" });

// Agent Tasks
export interface AgentTask {
  id: string;
  prompt: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  result: string | null;
  error: string | null;
  parentId: string | null;
  depth: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}
export interface TaskStats { pending: number; running: number; completed: number; failed: number }
export const getTasks = (status?: string) =>
  fetchApi<AgentTask[]>(status ? `/api/admin/tasks?status=${status}` : "/api/admin/tasks");
export const getTaskStats = () => fetchApi<TaskStats>("/api/admin/tasks/stats");
export const createTask = (prompt: string) =>
  fetchApi<AgentTask>("/api/admin/tasks", { method: "POST", body: JSON.stringify({ prompt }) });

// MCP Servers
export interface McpServer {
  id: string;
  name: string;
  type: string;
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  enabled: boolean;
  tools: string[];
  createdAt: string;
  updatedAt: string;
}
export const getMcpServers = () => fetchApi<McpServer[]>("/api/admin/mcp-servers");
export const createMcpServer = (data: Partial<McpServer>) =>
  fetchApi<McpServer>("/api/admin/mcp-servers", { method: "POST", body: JSON.stringify(data) });
export const updateMcpServer = (id: string, data: Partial<McpServer>) =>
  fetchApi<McpServer>(`/api/admin/mcp-servers/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteMcpServer = (id: string) =>
  fetchApi<void>(`/api/admin/mcp-servers/${id}`, { method: "DELETE" });

// Skills
export interface SkillDef {
  id: string;
  name: string;
  description: string;
  content: string;
  enabled: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}
export const getSkills = () => fetchApi<SkillDef[]>("/api/admin/skills");
export const createSkill = (data: Partial<SkillDef>) =>
  fetchApi<SkillDef>("/api/admin/skills", { method: "POST", body: JSON.stringify(data) });
export const updateSkill = (id: string, data: Partial<SkillDef>) =>
  fetchApi<SkillDef>(`/api/admin/skills/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteSkill = (id: string) =>
  fetchApi<void>(`/api/admin/skills/${id}`, { method: "DELETE" });
