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
