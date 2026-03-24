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
export interface AuthStatus { authenticated: boolean; authMode?: "token" | "device" }
export interface AuthTestResult { connected: boolean; models?: number; error?: string }
export const getAuthStatus = () => fetchApi<AuthStatus>("/api/admin/auth/status");
export const startDeviceAuth = () => fetchApi<{ verificationUri: string; userCode: string }>("/api/admin/auth/device", { method: "POST" });
export const waitForDeviceAuth = () => fetchApi<{ authenticated: boolean }>("/api/admin/auth/wait", { method: "POST" });
export const testAuthConnection = () => fetchApi<AuthTestResult>("/api/admin/auth/test");

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
  requiredTools: string[];
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
export const getSkillAgents = (skillId: string) =>
  fetchApi<SkillDef & { agents: Agent[] }>(`/api/admin/skills/${skillId}`).then((r) => r.agents);

// Environment Variables
export interface EnvEntry { key: string; value: string; masked: boolean; source?: "file" | "process"; _raw?: string }
export interface EnvListResponse { entries: EnvEntry[]; warnings?: { missingRequired: string[] } }
export const getEnvEntries = () => fetchApi<EnvListResponse>("/api/admin/env");
export const getEnvRaw = (key: string) => fetchApi<{ key: string; value: string }>(`/api/admin/env/${encodeURIComponent(key)}`);
export const setEnvEntry = (key: string, value: string) =>
  fetchApi<EnvEntry>("/api/admin/env", { method: "PUT", body: JSON.stringify({ key, value }) });
export const deleteEnvEntry = (key: string) =>
  fetchApi<void>(`/api/admin/env/${encodeURIComponent(key)}`, { method: "DELETE" });
export const validateEnv = () =>
  fetchApi<{ valid: boolean; missing: string[] }>("/api/admin/env/validate/required");

// Knowledge Base
export interface KnowledgeStats { documentCount: number; chunkCount: number; lastIndexedAt: string | null }
export interface KnowledgeDocument { id: string; applicationId: string; filePath: string; type: string; chunkCount: number; indexedAt: string }
export interface KnowledgeConfig { vectorDbPath: string; collectionName: string; searchMode: string; minScore: number }
export const getKnowledgeStats = () => fetchApi<KnowledgeStats>("/api/admin/knowledge/stats");
export const getKnowledgeDocuments = () => fetchApi<KnowledgeDocument[]>("/api/admin/knowledge/documents");
export const searchKnowledge = (query: string, limit?: number) =>
  fetchApi<{ results: { content: string; score: number; filePath: string }[] }>("/api/admin/knowledge/search", { method: "POST", body: JSON.stringify({ query, limit }) });
export const reindexKnowledge = () =>
  fetchApi<{ status: string }>("/api/admin/knowledge/reindex", { method: "POST" });
export const reindexDocument = (docId: string) =>
  fetchApi<{ status: string }>(`/api/admin/knowledge/reindex/${docId}`, { method: "POST" });
export const deleteKnowledgeDocument = (docId: string) =>
  fetchApi<void>(`/api/admin/knowledge/documents/${docId}`, { method: "DELETE" });
export const getKnowledgeConfig = () => fetchApi<KnowledgeConfig>("/api/admin/knowledge/config");
export const updateKnowledgeConfig = (config: Partial<KnowledgeConfig>) =>
  fetchApi<KnowledgeConfig>("/api/admin/knowledge/config", { method: "PUT", body: JSON.stringify(config) });

// Models (enhanced)
export const getModelsHealth = () => fetchApi<{ healthy: boolean; authenticated: boolean; latencyMs: number }>("/api/admin/models/health");

// Test Generation
export interface GenerateTestInput { applicationId: string; prompt: string; model?: string; testType?: string }
export interface GeneratedTest { id: string; code: string; name: string; confidence: number }
export const generateTest = (input: GenerateTestInput) =>
  fetchApi<GeneratedTest>("/api/talos/tests/generate", { method: "POST", body: JSON.stringify(input) });
export const refineTest = (testId: string, feedback: string) =>
  fetchApi<GeneratedTest>(`/api/talos/tests/${testId}/refine`, { method: "POST", body: JSON.stringify({ feedback }) });

// Sessions
export interface ChatSession { id: string; startedAt: string; lastMessageAt: string; messageCount: number; preview: string }
export const getChatSessions = () => fetchApi<ChatSession[]>("/api/talos/sessions");
export const getChatSession = (id: string) =>
  fetchApi<{ id: string; messages: { role: string; content: string; timestamp: string }[] }>(`/api/talos/sessions/${id}`);
export const deleteChatSession = (id: string) =>
  fetchApi<void>(`/api/talos/sessions/${id}`, { method: "DELETE" });

// Orchestration
export interface OrchestrateInput { applicationId: string; steps: string[]; config?: Record<string, unknown> }
export interface OrchestrateResult { runId: string; status: string; steps: { name: string; status: string; result?: unknown }[] }
export const startOrchestration = (input: OrchestrateInput) =>
  fetchApi<OrchestrateResult>("/api/talos/orchestrate", { method: "POST", body: JSON.stringify(input) });
export const getOrchestrationStatus = (runId: string) =>
  fetchApi<OrchestrateResult>(`/api/talos/orchestrate/${runId}`);

// AI Enhance
export interface EnhanceInput { text: string; model?: string; context?: string }
export interface EnhanceResult { enhanced: string }
export const enhanceText = (input: EnhanceInput) =>
  fetchApi<EnhanceResult>("/api/admin/ai/enhance", { method: "POST", body: JSON.stringify(input) });

// Agents
export interface Agent {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  toolsWhitelist: string[];
  parentAgentId: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}
export const getAgents = () => fetchApi<Agent[]>("/api/admin/agents");
export const getAgent = (id: string) => fetchApi<Agent>(`/api/admin/agents/${id}`);
export const createAgent = (data: Partial<Agent>) =>
  fetchApi<Agent>("/api/admin/agents", { method: "POST", body: JSON.stringify(data) });
export const updateAgent = (id: string, data: Partial<Agent>) =>
  fetchApi<Agent>(`/api/admin/agents/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteAgent = (id: string) =>
  fetchApi<void>(`/api/admin/agents/${id}`, { method: "DELETE" });
export const getAgentSkills = (agentId: string) =>
  fetchApi<string[]>(`/api/admin/agents/${agentId}/skills`);
export const setAgentSkills = (agentId: string, skillIds: string[]) =>
  fetchApi<string[]>(`/api/admin/agents/${agentId}/skills`, { method: "PUT", body: JSON.stringify({ skillIds }) });
