/**
 * TalosRepository — SQLite data access layer for Talos tables.
 *
 * Tables:
 * - talos_applications: Test target applications
 * - talos_tests: Generated/managed test cases
 * - talos_test_runs: Test execution records
 * - talos_test_artifacts: Screenshots, traces, videos, logs
 * - talos_vault_roles: Credential references for multi-role testing
 */

import type Database from "better-sqlite3";
import { createHash, randomUUID } from "node:crypto";
import type {
  TalosApplication,
  MtlsApplicationConfig,
  TalosTest,
  TalosTestRun,
  TalosTestArtifact,
  TalosVaultRole,
  TalosAcceptanceCriteria,
  TraceabilityLink,
  TraceabilityReport,
  TalosDataSource,
  TalosAtlassianConfig,
  CreateApplicationInput,
  UpdateApplicationInput,
  CreateTestInput,
  UpdateTestInput,
  CreateTestRunInput,
  UpdateTestRunInput,
  CreateArtifactInput,
  CreateVaultRoleInput,
  UpdateVaultRoleInput,
  CreateAcceptanceCriteriaInput,
  UpdateAcceptanceCriteriaInput,
  CreateTraceabilityLinkInput,
  CreateDataSourceInput,
  UpdateDataSourceInput,
  CreateAtlassianConfigInput,
  UpdateAtlassianConfigInput,
  StoredApplication,
  StoredTest,
  StoredTestRun,
  StoredArtifact,
  StoredVaultRole,
  StoredAcceptanceCriteria,
  StoredTraceabilityLink,
  StoredDataSource,
  StoredAtlassianConfig,
  TalosApplicationStatus,
  TalosTestStatus,
  TalosTestType,
  TalosTestRunStatus,
  TalosTestRunTrigger,
  TalosArtifactType,
  TalosVaultRoleType,
  AcceptanceCriteriaStatus,
  CoverageStatus,
  AcceptanceCriteriaScenario,
  JdbcDriverType,
  AtlassianDeploymentType,
} from "./types.js";

// ── Row Converters ────────────────────────────────────────────────────────────

const toApplication = (row: StoredApplication): TalosApplication => ({
  id: row.id,
  name: row.name,
  description: row.description,
  repositoryUrl: row.repository_url,
  githubPatRef: row.github_pat_ref,
  baseUrl: row.base_url,
  status: row.status as TalosApplicationStatus,
  mtlsEnabled: row.mtls_enabled === 1,
  mtlsConfig: row.mtls_config_json ? (JSON.parse(row.mtls_config_json) as MtlsApplicationConfig) : null,
  exportRepoUrl: row.export_repo_url ?? null,
  metadata: JSON.parse(row.metadata_json) as Record<string, unknown>,
  createdAt: new Date(row.created_at),
  updatedAt: new Date(row.updated_at),
});

const toTest = (row: StoredTest): TalosTest => ({
  id: row.id,
  applicationId: row.application_id,
  name: row.name,
  description: row.description,
  type: row.type as TalosTestType,
  code: row.code,
  version: row.version,
  status: row.status as TalosTestStatus,
  pomDependencies: JSON.parse(row.pom_dependencies_json) as string[],
  selectors: JSON.parse(row.selectors_json) as string[],
  embeddingId: row.embedding_id,
  generationConfidence: row.generation_confidence,
  codeHash: row.code_hash,
  tags: row.tags_json ? (JSON.parse(row.tags_json) as string[]) : [],
  metadata: JSON.parse(row.metadata_json) as Record<string, unknown>,
  createdAt: new Date(row.created_at),
  updatedAt: new Date(row.updated_at),
});

const toTestRun = (row: StoredTestRun): TalosTestRun => ({
  id: row.id,
  applicationId: row.application_id,
  testId: row.test_id,
  status: row.status as TalosTestRunStatus,
  trigger: row.trigger as TalosTestRunTrigger,
  triggeredBy: row.trigger as TalosTestRunTrigger,
  browser: row.browser,
  environment: row.environment ?? "local",
  durationMs: row.duration_ms,
  errorMessage: row.error_message,
  errorStack: row.error_stack,
  retryAttempt: row.retry_attempt,
  vaultRoleId: row.vault_role_id,
  taskId: row.task_id,
  metadata: JSON.parse(row.metadata_json) as Record<string, unknown>,
  createdAt: new Date(row.created_at),
  startedAt: row.started_at ? new Date(row.started_at) : null,
  completedAt: row.completed_at ? new Date(row.completed_at) : null,
});

const toArtifact = (row: StoredArtifact): TalosTestArtifact => ({
  id: row.id,
  testRunId: row.test_run_id,
  type: row.type as TalosArtifactType,
  filePath: row.file_path,
  mimeType: row.mime_type,
  sizeBytes: row.size_bytes,
  stepName: row.step_name,
  metadata: JSON.parse(row.metadata_json) as Record<string, unknown>,
  createdAt: new Date(row.created_at),
});

const toVaultRole = (row: StoredVaultRole): TalosVaultRole => ({
  id: row.id,
  applicationId: row.application_id,
  roleType: row.role_type as TalosVaultRoleType,
  name: row.name,
  description: row.description,
  usernameRef: row.username_ref,
  passwordRef: row.password_ref,
  additionalRefs: JSON.parse(row.additional_refs_json) as Record<string, string>,
  isActive: row.is_active === 1,
  metadata: JSON.parse(row.metadata_json) as Record<string, unknown>,
  createdAt: new Date(row.created_at),
  updatedAt: new Date(row.updated_at),
});

const toAcceptanceCriteria = (row: StoredAcceptanceCriteria): TalosAcceptanceCriteria => ({
  id: row.id,
  applicationId: row.application_id,
  requirementChunkId: row.requirement_chunk_id ?? undefined,
  title: row.title,
  description: row.description,
  scenarios: JSON.parse(row.scenarios_json) as AcceptanceCriteriaScenario[],
  preconditions: JSON.parse(row.preconditions_json) as string[],
  dataRequirements: JSON.parse(row.data_requirements_json) as string[],
  nfrTags: JSON.parse(row.nfr_tags_json) as string[],
  status: row.status as AcceptanceCriteriaStatus,
  confidence: row.confidence,
  tags: JSON.parse(row.tags_json) as string[],
  createdAt: new Date(row.created_at),
  updatedAt: new Date(row.updated_at),
});

const toTraceabilityLink = (row: StoredTraceabilityLink): TraceabilityLink => ({
  id: row.id,
  applicationId: row.application_id,
  requirementChunkId: row.requirement_chunk_id,
  acceptanceCriteriaId: row.acceptance_criteria_id,
  testId: row.test_id,
  coverageStatus: row.coverage_status as CoverageStatus,
  createdAt: new Date(row.created_at),
  updatedAt: new Date(row.updated_at),
});

const toDataSource = (row: StoredDataSource): TalosDataSource => ({
  id: row.id,
  applicationId: row.application_id,
  label: row.label,
  driverType: row.driver_type as JdbcDriverType,
  jdbcUrl: row.jdbc_url,
  usernameVaultRef: row.username_vault_ref,
  passwordVaultRef: row.password_vault_ref,
  isActive: row.is_active === 1,
  createdAt: new Date(row.created_at),
  updatedAt: new Date(row.updated_at),
});

const toAtlassianConfig = (row: StoredAtlassianConfig): TalosAtlassianConfig => ({
  id: row.id,
  applicationId: row.application_id,
  deploymentType: row.deployment_type as AtlassianDeploymentType,
  jiraUrl: row.jira_url,
  jiraProject: row.jira_project,
  jiraUsernameVaultRef: row.jira_username_vault_ref,
  jiraApiTokenVaultRef: row.jira_api_token_vault_ref,
  jiraPersonalTokenVaultRef: row.jira_personal_token_vault_ref,
  jiraSslVerify: row.jira_ssl_verify === 1,
  confluenceUrl: row.confluence_url,
  confluenceSpaces: JSON.parse(row.confluence_spaces_json) as string[],
  confluenceUsernameVaultRef: row.confluence_username_vault_ref,
  confluenceApiTokenVaultRef: row.confluence_api_token_vault_ref,
  confluencePersonalTokenVaultRef: row.confluence_personal_token_vault_ref,
  confluenceSslVerify: row.confluence_ssl_verify === 1,
  isActive: row.is_active === 1,
  createdAt: new Date(row.created_at),
  updatedAt: new Date(row.updated_at),
});

// ── Helper Functions ──────────────────────────────────────────────────────────

const hashCode = (code: string): string => {
  return createHash("sha256").update(code).digest("hex").slice(0, 16);
};

// ── Repository Class ──────────────────────────────────────────────────────────

export type TalosRepositoryOptions = {
  clock?: () => Date;
};

export class TalosRepository {
  private db: Database.Database;
  private clock: () => Date;

  constructor(db: Database.Database, options: TalosRepositoryOptions = {}) {
    this.db = db;
    this.clock = options.clock ?? (() => new Date());
  }

  // ── Schema Migration ────────────────────────────────────────────────────────

  /** Idempotent table creation. Safe to call on every boot. */
  migrate(): void {
    this.db.exec(`
      -- Applications table
      CREATE TABLE IF NOT EXISTS talos_applications (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        repository_url TEXT NOT NULL,
        github_pat_ref TEXT,
        base_url TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active'
          CHECK(status IN ('active', 'archived', 'pending')),
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_talos_applications_status 
        ON talos_applications(status);
      CREATE INDEX IF NOT EXISTS idx_talos_applications_name 
        ON talos_applications(name);

      -- Tests table
      CREATE TABLE IF NOT EXISTS talos_tests (
        id TEXT PRIMARY KEY,
        application_id TEXT NOT NULL REFERENCES talos_applications(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        type TEXT NOT NULL DEFAULT 'e2e'
          CHECK(type IN ('e2e', 'smoke', 'regression', 'accessibility', 'unit')),
        code TEXT NOT NULL,
        version TEXT NOT NULL DEFAULT '1.0.0',
        status TEXT NOT NULL DEFAULT 'draft'
          CHECK(status IN ('draft', 'active', 'disabled', 'archived')),
        pom_dependencies_json TEXT NOT NULL DEFAULT '[]',
        selectors_json TEXT NOT NULL DEFAULT '[]',
        embedding_id TEXT,
        generation_confidence REAL,
        code_hash TEXT NOT NULL,
        tags_json TEXT NOT NULL DEFAULT '[]',
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_talos_tests_application 
        ON talos_tests(application_id);
      CREATE INDEX IF NOT EXISTS idx_talos_tests_status 
        ON talos_tests(status);
      CREATE INDEX IF NOT EXISTS idx_talos_tests_type 
        ON talos_tests(type);

      -- Test runs table
      CREATE TABLE IF NOT EXISTS talos_test_runs (
        id TEXT PRIMARY KEY,
        application_id TEXT NOT NULL REFERENCES talos_applications(id) ON DELETE CASCADE,
        test_id TEXT NOT NULL REFERENCES talos_tests(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'queued'
          CHECK(status IN ('queued', 'running', 'passed', 'failed', 'skipped', 'cancelled')),
        trigger TEXT NOT NULL DEFAULT 'manual'
          CHECK(trigger IN ('manual', 'scheduled', 'ci', 'healing', 'test', 'healing-verification')),
        browser TEXT NOT NULL DEFAULT 'chromium',
        environment TEXT NOT NULL DEFAULT 'local',
        duration_ms INTEGER,
        error_message TEXT,
        error_stack TEXT,
        retry_attempt INTEGER NOT NULL DEFAULT 0,
        vault_role_id TEXT REFERENCES talos_vault_roles(id),
        task_id TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_talos_test_runs_application 
        ON talos_test_runs(application_id);
      CREATE INDEX IF NOT EXISTS idx_talos_test_runs_test 
        ON talos_test_runs(test_id);
      CREATE INDEX IF NOT EXISTS idx_talos_test_runs_status 
        ON talos_test_runs(status);
      CREATE INDEX IF NOT EXISTS idx_talos_test_runs_created 
        ON talos_test_runs(created_at);

      -- Test artifacts table
      CREATE TABLE IF NOT EXISTS talos_test_artifacts (
        id TEXT PRIMARY KEY,
        test_run_id TEXT NOT NULL REFERENCES talos_test_runs(id) ON DELETE CASCADE,
        type TEXT NOT NULL
          CHECK(type IN ('screenshot', 'video', 'trace', 'log', 'report', 'diff')),
        file_path TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        step_name TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_talos_artifacts_run 
        ON talos_test_artifacts(test_run_id);
      CREATE INDEX IF NOT EXISTS idx_talos_artifacts_type 
        ON talos_test_artifacts(type);

      -- Vault roles table
      CREATE TABLE IF NOT EXISTS talos_vault_roles (
        id TEXT PRIMARY KEY,
        application_id TEXT NOT NULL REFERENCES talos_applications(id) ON DELETE CASCADE,
        role_type TEXT NOT NULL
          CHECK(role_type IN ('admin', 'standard', 'guest', 'service', 'user')),
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        username_ref TEXT NOT NULL,
        password_ref TEXT NOT NULL,
        additional_refs_json TEXT NOT NULL DEFAULT '{}',
        is_active INTEGER NOT NULL DEFAULT 1,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_talos_vault_roles_application 
        ON talos_vault_roles(application_id);
      CREATE INDEX IF NOT EXISTS idx_talos_vault_roles_type 
        ON talos_vault_roles(role_type);

      -- Acceptance criteria table
      CREATE TABLE IF NOT EXISTS talos_acceptance_criteria (
        id TEXT PRIMARY KEY,
        application_id TEXT NOT NULL REFERENCES talos_applications(id) ON DELETE CASCADE,
        requirement_chunk_id TEXT,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        scenarios_json TEXT NOT NULL DEFAULT '[]',
        preconditions_json TEXT NOT NULL DEFAULT '[]',
        data_requirements_json TEXT NOT NULL DEFAULT '[]',
        nfr_tags_json TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'draft'
          CHECK(status IN ('draft', 'approved', 'implemented', 'deprecated')),
        confidence REAL NOT NULL DEFAULT 0,
        tags_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_talos_ac_application
        ON talos_acceptance_criteria(application_id);
      CREATE INDEX IF NOT EXISTS idx_talos_ac_status
        ON talos_acceptance_criteria(status);
      CREATE INDEX IF NOT EXISTS idx_talos_ac_requirement_chunk
        ON talos_acceptance_criteria(requirement_chunk_id);

      -- Traceability links table
      CREATE TABLE IF NOT EXISTS talos_traceability (
        id TEXT PRIMARY KEY,
        application_id TEXT NOT NULL REFERENCES talos_applications(id) ON DELETE CASCADE,
        requirement_chunk_id TEXT NOT NULL,
        acceptance_criteria_id TEXT,
        test_id TEXT,
        coverage_status TEXT NOT NULL DEFAULT 'uncovered'
          CHECK(coverage_status IN ('uncovered', 'partial', 'covered')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_talos_trace_application
        ON talos_traceability(application_id);
      CREATE INDEX IF NOT EXISTS idx_talos_trace_requirement
        ON talos_traceability(requirement_chunk_id);
      CREATE INDEX IF NOT EXISTS idx_talos_trace_criteria
        ON talos_traceability(acceptance_criteria_id);
      CREATE INDEX IF NOT EXISTS idx_talos_trace_test
        ON talos_traceability(test_id);

      -- Data Sources table
      CREATE TABLE IF NOT EXISTS talos_data_sources (
        id TEXT PRIMARY KEY,
        application_id TEXT NOT NULL REFERENCES talos_applications(id) ON DELETE CASCADE,
        label TEXT NOT NULL,
        driver_type TEXT NOT NULL DEFAULT 'postgresql'
          CHECK(driver_type IN ('oracle', 'postgresql', 'mysql', 'sqlserver', 'sqlite', 'other')),
        jdbc_url TEXT NOT NULL,
        username_vault_ref TEXT NOT NULL DEFAULT '',
        password_vault_ref TEXT NOT NULL DEFAULT '',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_talos_data_sources_application
        ON talos_data_sources(application_id);

      -- Atlassian Configs table
      CREATE TABLE IF NOT EXISTS talos_atlassian_configs (
        id TEXT PRIMARY KEY,
        application_id TEXT NOT NULL REFERENCES talos_applications(id) ON DELETE CASCADE,
        deployment_type TEXT NOT NULL DEFAULT 'cloud'
          CHECK(deployment_type IN ('cloud', 'datacenter')),
        jira_url TEXT NOT NULL DEFAULT '',
        jira_project TEXT NOT NULL DEFAULT '',
        jira_username_vault_ref TEXT NOT NULL DEFAULT '',
        jira_api_token_vault_ref TEXT NOT NULL DEFAULT '',
        jira_personal_token_vault_ref TEXT NOT NULL DEFAULT '',
        jira_ssl_verify INTEGER NOT NULL DEFAULT 1,
        confluence_url TEXT NOT NULL DEFAULT '',
        confluence_spaces_json TEXT NOT NULL DEFAULT '[]',
        confluence_username_vault_ref TEXT NOT NULL DEFAULT '',
        confluence_api_token_vault_ref TEXT NOT NULL DEFAULT '',
        confluence_personal_token_vault_ref TEXT NOT NULL DEFAULT '',
        confluence_ssl_verify INTEGER NOT NULL DEFAULT 1,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_talos_atlassian_configs_application
        ON talos_atlassian_configs(application_id);
    `);

    // ── mTLS columns migration ──────────────────────────────────────────────
    // Add mTLS columns to talos_applications if they don't exist yet.
    const cols = this.db.prepare("PRAGMA table_info(talos_applications)").all() as { name: string }[];
    const colNames = new Set(cols.map((c) => c.name));
    if (!colNames.has("mtls_enabled")) {
      this.db.exec(`ALTER TABLE talos_applications ADD COLUMN mtls_enabled INTEGER NOT NULL DEFAULT 0`);
    }
    if (!colNames.has("mtls_config_json")) {
      this.db.exec(`ALTER TABLE talos_applications ADD COLUMN mtls_config_json TEXT`);
    }
    if (!colNames.has("export_repo_url")) {
      this.db.exec(`ALTER TABLE talos_applications ADD COLUMN export_repo_url TEXT`);
    }
  }

  // ── Application CRUD ────────────────────────────────────────────────────────

  createApplication(input: CreateApplicationInput): TalosApplication {
    const now = this.clock().toISOString();
    const id = randomUUID();

    const stmt = this.db.prepare(`
      INSERT INTO talos_applications (
        id, name, description, repository_url, github_pat_ref, base_url,
        status, mtls_enabled, mtls_config_json, metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.name,
      input.description ?? "",
      input.repositoryUrl ?? "",
      input.githubPatRef ?? null,
      input.baseUrl ?? "",
      input.mtlsEnabled ? 1 : 0,
      input.mtlsConfig ? JSON.stringify(input.mtlsConfig) : null,
      JSON.stringify(input.metadata ?? {}),
      now,
      now
    );

    return this.getApplication(id)!;
  }

  getApplication(id: string): TalosApplication | null {
    const stmt = this.db.prepare(`SELECT * FROM talos_applications WHERE id = ?`);
    const row = stmt.get(id) as StoredApplication | undefined;
    return row ? toApplication(row) : null;
  }

  getApplicationByName(name: string): TalosApplication | null {
    const stmt = this.db.prepare(`SELECT * FROM talos_applications WHERE name = ?`);
    const row = stmt.get(name) as StoredApplication | undefined;
    return row ? toApplication(row) : null;
  }

  listApplications(status?: TalosApplicationStatus): TalosApplication[] {
    const stmt = status
      ? this.db.prepare(`SELECT * FROM talos_applications WHERE status = ? ORDER BY name`)
      : this.db.prepare(`SELECT * FROM talos_applications ORDER BY name`);

    const rows = (status ? stmt.all(status) : stmt.all()) as StoredApplication[];
    return rows.map(toApplication);
  }

  updateApplication(id: string, input: UpdateApplicationInput): TalosApplication | null {
    const existing = this.getApplication(id);
    if (!existing) return null;

    const now = this.clock().toISOString();
    const updates: string[] = [];
    const values: unknown[] = [];

    if (input.name !== undefined) {
      updates.push("name = ?");
      values.push(input.name);
    }
    if (input.description !== undefined) {
      updates.push("description = ?");
      values.push(input.description);
    }
    if (input.repositoryUrl !== undefined) {
      updates.push("repository_url = ?");
      values.push(input.repositoryUrl);
    }
    if (input.githubPatRef !== undefined) {
      updates.push("github_pat_ref = ?");
      values.push(input.githubPatRef);
    }
    if (input.baseUrl !== undefined) {
      updates.push("base_url = ?");
      values.push(input.baseUrl);
    }
    if (input.status !== undefined) {
      updates.push("status = ?");
      values.push(input.status);
    }
    if (input.metadata !== undefined) {
      updates.push("metadata_json = ?");
      values.push(JSON.stringify(input.metadata));
    }
    if (input.mtlsEnabled !== undefined) {
      updates.push("mtls_enabled = ?");
      values.push(input.mtlsEnabled ? 1 : 0);
    }
    if (input.mtlsConfig !== undefined) {
      updates.push("mtls_config_json = ?");
      values.push(input.mtlsConfig ? JSON.stringify(input.mtlsConfig) : null);
    }
    if (input.exportRepoUrl !== undefined) {
      updates.push("export_repo_url = ?");
      values.push(input.exportRepoUrl);
    }

    if (updates.length === 0) return existing;

    updates.push("updated_at = ?");
    values.push(now);
    values.push(id);

    const stmt = this.db.prepare(`UPDATE talos_applications SET ${updates.join(", ")} WHERE id = ?`);
    stmt.run(...values);

    return this.getApplication(id);
  }

  deleteApplication(id: string): boolean {
    const stmt = this.db.prepare(`DELETE FROM talos_applications WHERE id = ?`);
    const result = stmt.run(id);
    return result.changes > 0;
  }

  // ── Test CRUD ───────────────────────────────────────────────────────────────

  createTest(input: CreateTestInput): TalosTest {
    const now = this.clock().toISOString();
    const id = randomUUID();
    const codeHash = hashCode(input.code);

    const stmt = this.db.prepare(`
      INSERT INTO talos_tests (
        id, application_id, name, description, type, code, version, status,
        pom_dependencies_json, selectors_json, generation_confidence, code_hash,
        tags_json, metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.applicationId,
      input.name,
      input.description ?? "",
      input.type,
      input.code,
      input.version ?? "1.0.0",
      JSON.stringify(input.pomDependencies ?? []),
      JSON.stringify(input.selectors ?? []),
      input.generationConfidence ?? null,
      codeHash,
      JSON.stringify(input.tags ?? []),
      JSON.stringify(input.metadata ?? {}),
      now,
      now
    );

    return this.getTest(id)!;
  }

  getTest(id: string): TalosTest | null {
    const stmt = this.db.prepare(`SELECT * FROM talos_tests WHERE id = ?`);
    const row = stmt.get(id) as StoredTest | undefined;
    return row ? toTest(row) : null;
  }

  listTestsByApp(applicationId: string, status?: TalosTestStatus): TalosTest[] {
    const stmt = status
      ? this.db.prepare(`SELECT * FROM talos_tests WHERE application_id = ? AND status = ? ORDER BY name`)
      : this.db.prepare(`SELECT * FROM talos_tests WHERE application_id = ? ORDER BY name`);

    const rows = (status ? stmt.all(applicationId, status) : stmt.all(applicationId)) as StoredTest[];
    return rows.map(toTest);
  }

  updateTest(id: string, input: UpdateTestInput): TalosTest | null {
    const existing = this.getTest(id);
    if (!existing) return null;

    const now = this.clock().toISOString();
    const updates: string[] = [];
    const values: unknown[] = [];

    if (input.name !== undefined) {
      updates.push("name = ?");
      values.push(input.name);
    }
    if (input.description !== undefined) {
      updates.push("description = ?");
      values.push(input.description);
    }
    if (input.type !== undefined) {
      updates.push("type = ?");
      values.push(input.type);
    }
    if (input.code !== undefined) {
      updates.push("code = ?");
      values.push(input.code);
      updates.push("code_hash = ?");
      values.push(hashCode(input.code));
    }
    if (input.version !== undefined) {
      updates.push("version = ?");
      values.push(input.version);
    }
    if (input.status !== undefined) {
      updates.push("status = ?");
      values.push(input.status);
    }
    if (input.pomDependencies !== undefined) {
      updates.push("pom_dependencies_json = ?");
      values.push(JSON.stringify(input.pomDependencies));
    }
    if (input.selectors !== undefined) {
      updates.push("selectors_json = ?");
      values.push(JSON.stringify(input.selectors));
    }
    if (input.generationConfidence !== undefined) {
      updates.push("generation_confidence = ?");
      values.push(input.generationConfidence);
    }
    if (input.metadata !== undefined) {
      updates.push("metadata_json = ?");
      values.push(JSON.stringify(input.metadata));
    }

    if (updates.length === 0) return existing;

    updates.push("updated_at = ?");
    values.push(now);
    values.push(id);

    const stmt = this.db.prepare(`UPDATE talos_tests SET ${updates.join(", ")} WHERE id = ?`);
    stmt.run(...values);

    return this.getTest(id);
  }

  deleteTest(id: string): boolean {
    const stmt = this.db.prepare(`DELETE FROM talos_tests WHERE id = ?`);
    const result = stmt.run(id);
    return result.changes > 0;
  }

  // ── Test Run CRUD ───────────────────────────────────────────────────────────

  createTestRun(input: CreateTestRunInput): TalosTestRun {
    const now = this.clock().toISOString();
    const id = randomUUID();

    // If applicationId not provided, derive from test
    let applicationId = input.applicationId;
    if (!applicationId) {
      const test = this.getTest(input.testId);
      if (!test) {
        throw new Error(`Test not found: ${input.testId}`);
      }
      applicationId = test.applicationId;
    }

    const stmt = this.db.prepare(`
      INSERT INTO talos_test_runs (
        id, application_id, test_id, trigger, browser, environment, vault_role_id, task_id,
        metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      applicationId,
      input.testId,
      input.triggeredBy ?? input.trigger ?? "manual",
      input.browser ?? "chromium",
      input.environment ?? "local",
      input.vaultRoleId ?? null,
      input.taskId ?? null,
      JSON.stringify(input.metadata ?? {}),
      now
    );

    return this.getTestRun(id)!;
  }

  getTestRun(id: string): TalosTestRun | null {
    const stmt = this.db.prepare(`SELECT * FROM talos_test_runs WHERE id = ?`);
    const row = stmt.get(id) as StoredTestRun | undefined;
    return row ? toTestRun(row) : null;
  }

  listRunsByApp(applicationId: string, limit = 50): TalosTestRun[] {
    const stmt = this.db.prepare(
      `SELECT * FROM talos_test_runs WHERE application_id = ? ORDER BY created_at DESC LIMIT ?`
    );
    const rows = stmt.all(applicationId, limit) as StoredTestRun[];
    return rows.map(toTestRun);
  }

  listRunsByTest(testId: string, limit = 20): TalosTestRun[] {
    const stmt = this.db.prepare(`SELECT * FROM talos_test_runs WHERE test_id = ? ORDER BY created_at DESC LIMIT ?`);
    const rows = stmt.all(testId, limit) as StoredTestRun[];
    return rows.map(toTestRun);
  }

  updateTestRun(id: string, input: UpdateTestRunInput): TalosTestRun | null {
    const existing = this.getTestRun(id);
    if (!existing) return null;

    const updates: string[] = [];
    const values: unknown[] = [];

    if (input.status !== undefined) {
      updates.push("status = ?");
      values.push(input.status);
    }
    if (input.durationMs !== undefined) {
      updates.push("duration_ms = ?");
      values.push(input.durationMs);
    }
    if (input.errorMessage !== undefined) {
      updates.push("error_message = ?");
      values.push(input.errorMessage);
    }
    if (input.errorStack !== undefined) {
      updates.push("error_stack = ?");
      values.push(input.errorStack);
    }
    if (input.retryAttempt !== undefined) {
      updates.push("retry_attempt = ?");
      values.push(input.retryAttempt);
    }
    if (input.startedAt !== undefined) {
      updates.push("started_at = ?");
      values.push(input.startedAt?.toISOString() ?? null);
    }
    if (input.completedAt !== undefined) {
      updates.push("completed_at = ?");
      values.push(input.completedAt?.toISOString() ?? null);
    }
    if (input.metadata !== undefined) {
      updates.push("metadata_json = ?");
      values.push(JSON.stringify(input.metadata));
    }

    if (updates.length === 0) return existing;

    values.push(id);

    const stmt = this.db.prepare(`UPDATE talos_test_runs SET ${updates.join(", ")} WHERE id = ?`);
    stmt.run(...values);

    return this.getTestRun(id);
  }

  // ── Artifact CRUD ───────────────────────────────────────────────────────────

  createArtifact(input: CreateArtifactInput): TalosTestArtifact {
    const now = this.clock().toISOString();
    const id = randomUUID();

    const stmt = this.db.prepare(`
      INSERT INTO talos_test_artifacts (
        id, test_run_id, type, file_path, mime_type, size_bytes, step_name,
        metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.testRunId,
      input.type,
      input.filePath,
      input.mimeType,
      input.sizeBytes,
      input.stepName ?? null,
      JSON.stringify(input.metadata ?? {}),
      now
    );

    return this.getArtifact(id)!;
  }

  getArtifact(id: string): TalosTestArtifact | null {
    const stmt = this.db.prepare(`SELECT * FROM talos_test_artifacts WHERE id = ?`);
    const row = stmt.get(id) as StoredArtifact | undefined;
    return row ? toArtifact(row) : null;
  }

  listArtifactsByRun(testRunId: string): TalosTestArtifact[] {
    const stmt = this.db.prepare(`SELECT * FROM talos_test_artifacts WHERE test_run_id = ? ORDER BY created_at`);
    const rows = stmt.all(testRunId) as StoredArtifact[];
    return rows.map(toArtifact);
  }

  // ── Vault Role CRUD ─────────────────────────────────────────────────────────

  createVaultRole(input: CreateVaultRoleInput): TalosVaultRole {
    const now = this.clock().toISOString();
    const id = randomUUID();

    const stmt = this.db.prepare(`
      INSERT INTO talos_vault_roles (
        id, application_id, role_type, name, description, username_ref, password_ref,
        additional_refs_json, metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.applicationId,
      input.roleType,
      input.name,
      input.description ?? "",
      input.usernameRef,
      input.passwordRef,
      JSON.stringify(input.additionalRefs ?? {}),
      JSON.stringify(input.metadata ?? {}),
      now,
      now
    );

    return this.getVaultRole(id)!;
  }

  getVaultRole(id: string): TalosVaultRole | null {
    const stmt = this.db.prepare(`SELECT * FROM talos_vault_roles WHERE id = ?`);
    const row = stmt.get(id) as StoredVaultRole | undefined;
    return row ? toVaultRole(row) : null;
  }

  listRolesByApp(applicationId: string): TalosVaultRole[] {
    const stmt = this.db.prepare(`SELECT * FROM talos_vault_roles WHERE application_id = ? ORDER BY role_type, name`);
    const rows = stmt.all(applicationId) as StoredVaultRole[];
    return rows.map(toVaultRole);
  }

  getRoleByType(applicationId: string, roleType: TalosVaultRoleType): TalosVaultRole | null {
    const stmt = this.db.prepare(
      `SELECT * FROM talos_vault_roles WHERE application_id = ? AND role_type = ? AND is_active = 1 LIMIT 1`
    );
    const row = stmt.get(applicationId, roleType) as StoredVaultRole | undefined;
    return row ? toVaultRole(row) : null;
  }

  updateVaultRole(id: string, input: UpdateVaultRoleInput): TalosVaultRole | null {
    const existing = this.getVaultRole(id);
    if (!existing) return null;

    const now = this.clock().toISOString();
    const updates: string[] = [];
    const values: unknown[] = [];

    if (input.name !== undefined) {
      updates.push("name = ?");
      values.push(input.name);
    }
    if (input.description !== undefined) {
      updates.push("description = ?");
      values.push(input.description);
    }
    if (input.usernameRef !== undefined) {
      updates.push("username_ref = ?");
      values.push(input.usernameRef);
    }
    if (input.passwordRef !== undefined) {
      updates.push("password_ref = ?");
      values.push(input.passwordRef);
    }
    if (input.additionalRefs !== undefined) {
      updates.push("additional_refs_json = ?");
      values.push(JSON.stringify(input.additionalRefs));
    }
    if (input.isActive !== undefined) {
      updates.push("is_active = ?");
      values.push(input.isActive ? 1 : 0);
    }
    if (input.metadata !== undefined) {
      updates.push("metadata_json = ?");
      values.push(JSON.stringify(input.metadata));
    }

    if (updates.length === 0) return existing;

    updates.push("updated_at = ?");
    values.push(now);
    values.push(id);

    const stmt = this.db.prepare(`UPDATE talos_vault_roles SET ${updates.join(", ")} WHERE id = ?`);
    stmt.run(...values);

    return this.getVaultRole(id);
  }

  deleteVaultRole(id: string): boolean {
    const stmt = this.db.prepare(`DELETE FROM talos_vault_roles WHERE id = ?`);
    const result = stmt.run(id);
    return result.changes > 0;
  }

  // ── Statistics ──────────────────────────────────────────────────────────────

  getApplicationStats(applicationId: string): {
    totalTests: number;
    activeTests: number;
    totalRuns: number;
    passedRuns: number;
    failedRuns: number;
    lastRunAt: Date | null;
  } {
    const testsStmt = this.db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active
      FROM talos_tests WHERE application_id = ?
    `);
    const testsRow = testsStmt.get(applicationId) as { total: number; active: number };

    const runsStmt = this.db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) as passed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        MAX(created_at) as last_run
      FROM talos_test_runs WHERE application_id = ?
    `);
    const runsRow = runsStmt.get(applicationId) as {
      total: number;
      passed: number;
      failed: number;
      last_run: string | null;
    };

    return {
      totalTests: testsRow.total,
      activeTests: testsRow.active,
      totalRuns: runsRow.total,
      passedRuns: runsRow.passed ?? 0,
      failedRuns: runsRow.failed ?? 0,
      lastRunAt: runsRow.last_run ? new Date(runsRow.last_run) : null,
    };
  }

  // ── Alias Methods (for API compatibility) ───────────────────────────────────

  /** Alias for listTestsByApp */
  getTestsByApplication(applicationId: string, status?: TalosTestStatus): TalosTest[] {
    return this.listTestsByApp(applicationId, status);
  }

  /** Alias for listRunsByTest */
  getTestRunsByTest(testId: string, limit = 20): TalosTestRun[] {
    return this.listRunsByTest(testId, limit);
  }

  /** Alias for listRolesByApp */
  getRolesByApplication(applicationId: string): TalosVaultRole[] {
    return this.listRolesByApp(applicationId);
  }

  /** Alias for listArtifactsByRun */
  getArtifactsByRun(testRunId: string): TalosTestArtifact[] {
    return this.listArtifactsByRun(testRunId);
  }

  // ── Acceptance Criteria CRUD ────────────────────────────────────────────────

  createAcceptanceCriteria(input: CreateAcceptanceCriteriaInput): TalosAcceptanceCriteria {
    const now = this.clock().toISOString();
    const id = randomUUID();

    const stmt = this.db.prepare(`
      INSERT INTO talos_acceptance_criteria (
        id, application_id, requirement_chunk_id, title, description,
        scenarios_json, preconditions_json, data_requirements_json, nfr_tags_json,
        status, confidence, tags_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.applicationId,
      input.requirementChunkId ?? null,
      input.title,
      input.description,
      JSON.stringify(input.scenarios ?? []),
      JSON.stringify(input.preconditions ?? []),
      JSON.stringify(input.dataRequirements ?? []),
      JSON.stringify(input.nfrTags ?? []),
      input.status ?? "draft",
      input.confidence ?? 0,
      JSON.stringify(input.tags ?? []),
      now,
      now
    );

    return this.getAcceptanceCriteria(id)!;
  }

  getAcceptanceCriteria(id: string): TalosAcceptanceCriteria | null {
    const stmt = this.db.prepare(`SELECT * FROM talos_acceptance_criteria WHERE id = ?`);
    const row = stmt.get(id) as StoredAcceptanceCriteria | undefined;
    return row ? toAcceptanceCriteria(row) : null;
  }

  listAcceptanceCriteria(
    applicationId: string,
    filters?: { status?: AcceptanceCriteriaStatus; tags?: string[]; nfrTags?: string[]; requirementChunkId?: string }
  ): TalosAcceptanceCriteria[] {
    const conditions = ["application_id = ?"];
    const params: unknown[] = [applicationId];

    if (filters?.status) {
      conditions.push("status = ?");
      params.push(filters.status);
    }
    if (filters?.requirementChunkId) {
      conditions.push("requirement_chunk_id = ?");
      params.push(filters.requirementChunkId);
    }

    const sql = `SELECT * FROM talos_acceptance_criteria WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC`;
    const stmt = this.db.prepare(sql);
    let rows = stmt.all(...params) as StoredAcceptanceCriteria[];

    // In-memory tag filtering (JSON array columns)
    if (filters?.tags?.length) {
      rows = rows.filter((r) => {
        const rowTags = JSON.parse(r.tags_json) as string[];
        return filters.tags!.some((t) => rowTags.includes(t));
      });
    }
    if (filters?.nfrTags?.length) {
      rows = rows.filter((r) => {
        const rowNfr = JSON.parse(r.nfr_tags_json) as string[];
        return filters.nfrTags!.some((t) => rowNfr.includes(t));
      });
    }

    return rows.map(toAcceptanceCriteria);
  }

  updateAcceptanceCriteria(id: string, input: UpdateAcceptanceCriteriaInput): TalosAcceptanceCriteria | null {
    const existing = this.getAcceptanceCriteria(id);
    if (!existing) return null;

    const now = this.clock().toISOString();
    const updates: string[] = [];
    const values: unknown[] = [];

    if (input.requirementChunkId !== undefined) {
      updates.push("requirement_chunk_id = ?");
      values.push(input.requirementChunkId ?? null);
    }
    if (input.title !== undefined) {
      updates.push("title = ?");
      values.push(input.title);
    }
    if (input.description !== undefined) {
      updates.push("description = ?");
      values.push(input.description);
    }
    if (input.scenarios !== undefined) {
      updates.push("scenarios_json = ?");
      values.push(JSON.stringify(input.scenarios));
    }
    if (input.preconditions !== undefined) {
      updates.push("preconditions_json = ?");
      values.push(JSON.stringify(input.preconditions));
    }
    if (input.dataRequirements !== undefined) {
      updates.push("data_requirements_json = ?");
      values.push(JSON.stringify(input.dataRequirements));
    }
    if (input.nfrTags !== undefined) {
      updates.push("nfr_tags_json = ?");
      values.push(JSON.stringify(input.nfrTags));
    }
    if (input.status !== undefined) {
      updates.push("status = ?");
      values.push(input.status);
    }
    if (input.confidence !== undefined) {
      updates.push("confidence = ?");
      values.push(input.confidence);
    }
    if (input.tags !== undefined) {
      updates.push("tags_json = ?");
      values.push(JSON.stringify(input.tags));
    }

    if (updates.length === 0) return existing;

    updates.push("updated_at = ?");
    values.push(now);
    values.push(id);

    const stmt = this.db.prepare(`UPDATE talos_acceptance_criteria SET ${updates.join(", ")} WHERE id = ?`);
    stmt.run(...values);

    return this.getAcceptanceCriteria(id);
  }

  deleteAcceptanceCriteria(id: string): boolean {
    const stmt = this.db.prepare(`DELETE FROM talos_acceptance_criteria WHERE id = ?`);
    const result = stmt.run(id);
    return result.changes > 0;
  }

  // ── Traceability CRUD ───────────────────────────────────────────────────────

  createTraceabilityLink(input: CreateTraceabilityLinkInput): TraceabilityLink {
    const now = this.clock().toISOString();
    const id = randomUUID();

    const stmt = this.db.prepare(`
      INSERT INTO talos_traceability (
        id, application_id, requirement_chunk_id, acceptance_criteria_id, test_id,
        coverage_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.applicationId,
      input.requirementChunkId,
      input.acceptanceCriteriaId ?? null,
      input.testId ?? null,
      input.coverageStatus ?? "uncovered",
      now,
      now
    );

    return this.getTraceabilityLink(id)!;
  }

  getTraceabilityLink(id: string): TraceabilityLink | null {
    const stmt = this.db.prepare(`SELECT * FROM talos_traceability WHERE id = ?`);
    const row = stmt.get(id) as StoredTraceabilityLink | undefined;
    return row ? toTraceabilityLink(row) : null;
  }

  getTraceabilityForApp(applicationId: string): TraceabilityLink[] {
    const stmt = this.db.prepare(`SELECT * FROM talos_traceability WHERE application_id = ? ORDER BY created_at DESC`);
    const rows = stmt.all(applicationId) as StoredTraceabilityLink[];
    return rows.map(toTraceabilityLink);
  }

  getCoverageReport(applicationId: string): TraceabilityReport {
    // Total distinct requirement chunk IDs across traceability links
    const reqStmt = this.db.prepare(`
      SELECT COUNT(DISTINCT requirement_chunk_id) as total
      FROM talos_traceability WHERE application_id = ?
    `);
    const reqRow = reqStmt.get(applicationId) as { total: number };

    // Requirements with at least partial coverage
    const coveredReqStmt = this.db.prepare(`
      SELECT COUNT(DISTINCT requirement_chunk_id) as covered
      FROM talos_traceability WHERE application_id = ? AND coverage_status IN ('partial', 'covered')
    `);
    const coveredReqRow = coveredReqStmt.get(applicationId) as { covered: number };

    // Total criteria in this app
    const criteriaStmt = this.db.prepare(`
      SELECT COUNT(*) as total FROM talos_acceptance_criteria WHERE application_id = ?
    `);
    const criteriaRow = criteriaStmt.get(applicationId) as { total: number };

    // Criteria with 'implemented' status
    const implStmt = this.db.prepare(`
      SELECT COUNT(*) as implemented FROM talos_acceptance_criteria
      WHERE application_id = ? AND status = 'implemented'
    `);
    const implRow = implStmt.get(applicationId) as { implemented: number };

    // Unmapped requirements (no linked criteria)
    const unmappedStmt = this.db.prepare(`
      SELECT DISTINCT requirement_chunk_id FROM talos_traceability
      WHERE application_id = ? AND acceptance_criteria_id IS NULL
    `);
    const unmappedRows = unmappedStmt.all(applicationId) as Array<{ requirement_chunk_id: string }>;

    // Untested criteria (no linked tests)
    const untestedStmt = this.db.prepare(`
      SELECT DISTINCT acceptance_criteria_id FROM talos_traceability
      WHERE application_id = ? AND acceptance_criteria_id IS NOT NULL AND test_id IS NULL
    `);
    const untestedRows = untestedStmt.all(applicationId) as Array<{ acceptance_criteria_id: string }>;

    const totalReq = reqRow.total;
    const coveredReq = coveredReqRow.covered;

    return {
      totalRequirements: totalReq,
      coveredRequirements: coveredReq,
      totalCriteria: criteriaRow.total,
      implementedCriteria: implRow.implemented,
      coveragePercentage: totalReq > 0 ? Math.round((coveredReq / totalReq) * 100) : 0,
      unmappedRequirements: unmappedRows.map((r) => r.requirement_chunk_id),
      untestedCriteria: untestedRows.map((r) => r.acceptance_criteria_id),
    };
  }

  getUnmappedRequirements(applicationId: string): string[] {
    const stmt = this.db.prepare(`
      SELECT DISTINCT requirement_chunk_id FROM talos_traceability
      WHERE application_id = ? AND acceptance_criteria_id IS NULL
    `);
    const rows = stmt.all(applicationId) as Array<{ requirement_chunk_id: string }>;
    return rows.map((r) => r.requirement_chunk_id);
  }

  getUntestedCriteria(applicationId: string): string[] {
    const stmt = this.db.prepare(`
      SELECT DISTINCT acceptance_criteria_id FROM talos_traceability
      WHERE application_id = ? AND acceptance_criteria_id IS NOT NULL AND test_id IS NULL
    `);
    const rows = stmt.all(applicationId) as Array<{ acceptance_criteria_id: string }>;
    return rows.map((r) => r.acceptance_criteria_id);
  }

  linkCriteriaToTest(criteriaId: string, testId: string): TraceabilityLink | null {
    // Find a traceability link with this criteria that has no test
    const existing = this.db
      .prepare(
        `
      SELECT * FROM talos_traceability WHERE acceptance_criteria_id = ? AND test_id IS NULL LIMIT 1
    `
      )
      .get(criteriaId) as StoredTraceabilityLink | undefined;

    if (existing) {
      const now = this.clock().toISOString();
      this.db
        .prepare(
          `
        UPDATE talos_traceability SET test_id = ?, coverage_status = 'covered', updated_at = ? WHERE id = ?
      `
        )
        .run(testId, now, existing.id);
      return this.getTraceabilityLink(existing.id);
    }

    // If criteria exists, create a new link with the criteria's app context
    const criteria = this.getAcceptanceCriteria(criteriaId);
    if (!criteria) return null;

    // Find a requirement chunk linked to this criteria
    const reqLink = this.db
      .prepare(
        `
      SELECT requirement_chunk_id FROM talos_traceability
      WHERE acceptance_criteria_id = ? LIMIT 1
    `
      )
      .get(criteriaId) as { requirement_chunk_id: string } | undefined;

    return this.createTraceabilityLink({
      applicationId: criteria.applicationId,
      requirementChunkId: reqLink?.requirement_chunk_id ?? "unlinked",
      acceptanceCriteriaId: criteriaId,
      testId,
      coverageStatus: "covered",
    });
  }

  // ── Data Source CRUD ─────────────────────────────────────────────────────────

  createDataSource(input: CreateDataSourceInput): TalosDataSource {
    const now = this.clock().toISOString();
    const id = randomUUID();

    this.db
      .prepare(
        `
      INSERT INTO talos_data_sources (
        id, application_id, label, driver_type, jdbc_url,
        username_vault_ref, password_vault_ref, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `
      )
      .run(
        id,
        input.applicationId,
        input.label,
        input.driverType,
        input.jdbcUrl,
        input.usernameVaultRef,
        input.passwordVaultRef,
        now,
        now
      );

    return this.getDataSource(id)!;
  }

  getDataSource(id: string): TalosDataSource | null {
    const row = this.db.prepare(`SELECT * FROM talos_data_sources WHERE id = ?`).get(id) as
      | StoredDataSource
      | undefined;
    return row ? toDataSource(row) : null;
  }

  getDataSourcesByApp(applicationId: string): TalosDataSource[] {
    const rows = this.db
      .prepare(`SELECT * FROM talos_data_sources WHERE application_id = ? ORDER BY label`)
      .all(applicationId) as StoredDataSource[];
    return rows.map(toDataSource);
  }

  updateDataSource(id: string, input: UpdateDataSourceInput): TalosDataSource | null {
    const existing = this.getDataSource(id);
    if (!existing) return null;

    const now = this.clock().toISOString();
    const updates: string[] = [];
    const values: unknown[] = [];

    if (input.label !== undefined) {
      updates.push("label = ?");
      values.push(input.label);
    }
    if (input.driverType !== undefined) {
      updates.push("driver_type = ?");
      values.push(input.driverType);
    }
    if (input.jdbcUrl !== undefined) {
      updates.push("jdbc_url = ?");
      values.push(input.jdbcUrl);
    }
    if (input.usernameVaultRef !== undefined) {
      updates.push("username_vault_ref = ?");
      values.push(input.usernameVaultRef);
    }
    if (input.passwordVaultRef !== undefined) {
      updates.push("password_vault_ref = ?");
      values.push(input.passwordVaultRef);
    }
    if (input.isActive !== undefined) {
      updates.push("is_active = ?");
      values.push(input.isActive ? 1 : 0);
    }

    if (updates.length === 0) return existing;

    updates.push("updated_at = ?");
    values.push(now);
    values.push(id);

    this.db.prepare(`UPDATE talos_data_sources SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    return this.getDataSource(id);
  }

  deleteDataSource(id: string): boolean {
    const result = this.db.prepare(`DELETE FROM talos_data_sources WHERE id = ?`).run(id);
    return result.changes > 0;
  }

  // ── Atlassian Config CRUD ───────────────────────────────────────────────────

  createAtlassianConfig(input: CreateAtlassianConfigInput): TalosAtlassianConfig {
    const now = this.clock().toISOString();
    const id = randomUUID();

    this.db
      .prepare(
        `
      INSERT INTO talos_atlassian_configs (
        id, application_id, deployment_type,
        jira_url, jira_project, jira_username_vault_ref, jira_api_token_vault_ref,
        jira_personal_token_vault_ref, jira_ssl_verify,
        confluence_url, confluence_spaces_json, confluence_username_vault_ref,
        confluence_api_token_vault_ref, confluence_personal_token_vault_ref, confluence_ssl_verify,
        is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `
      )
      .run(
        id,
        input.applicationId,
        input.deploymentType,
        input.jiraUrl ?? "",
        input.jiraProject ?? "",
        input.jiraUsernameVaultRef ?? "",
        input.jiraApiTokenVaultRef ?? "",
        input.jiraPersonalTokenVaultRef ?? "",
        input.jiraSslVerify !== false ? 1 : 0,
        input.confluenceUrl ?? "",
        JSON.stringify(input.confluenceSpaces ?? []),
        input.confluenceUsernameVaultRef ?? "",
        input.confluenceApiTokenVaultRef ?? "",
        input.confluencePersonalTokenVaultRef ?? "",
        input.confluenceSslVerify !== false ? 1 : 0,
        now,
        now
      );

    return this.getAtlassianConfig(id)!;
  }

  getAtlassianConfig(id: string): TalosAtlassianConfig | null {
    const row = this.db.prepare(`SELECT * FROM talos_atlassian_configs WHERE id = ?`).get(id) as
      | StoredAtlassianConfig
      | undefined;
    return row ? toAtlassianConfig(row) : null;
  }

  getAtlassianConfigByApp(applicationId: string): TalosAtlassianConfig | null {
    const row = this.db
      .prepare(
        `SELECT * FROM talos_atlassian_configs WHERE application_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1`
      )
      .get(applicationId) as StoredAtlassianConfig | undefined;
    return row ? toAtlassianConfig(row) : null;
  }

  updateAtlassianConfig(id: string, input: UpdateAtlassianConfigInput): TalosAtlassianConfig | null {
    const existing = this.getAtlassianConfig(id);
    if (!existing) return null;

    const now = this.clock().toISOString();
    const updates: string[] = [];
    const values: unknown[] = [];

    if (input.deploymentType !== undefined) {
      updates.push("deployment_type = ?");
      values.push(input.deploymentType);
    }
    if (input.jiraUrl !== undefined) {
      updates.push("jira_url = ?");
      values.push(input.jiraUrl);
    }
    if (input.jiraProject !== undefined) {
      updates.push("jira_project = ?");
      values.push(input.jiraProject);
    }
    if (input.jiraUsernameVaultRef !== undefined) {
      updates.push("jira_username_vault_ref = ?");
      values.push(input.jiraUsernameVaultRef);
    }
    if (input.jiraApiTokenVaultRef !== undefined) {
      updates.push("jira_api_token_vault_ref = ?");
      values.push(input.jiraApiTokenVaultRef);
    }
    if (input.jiraPersonalTokenVaultRef !== undefined) {
      updates.push("jira_personal_token_vault_ref = ?");
      values.push(input.jiraPersonalTokenVaultRef);
    }
    if (input.jiraSslVerify !== undefined) {
      updates.push("jira_ssl_verify = ?");
      values.push(input.jiraSslVerify ? 1 : 0);
    }
    if (input.confluenceUrl !== undefined) {
      updates.push("confluence_url = ?");
      values.push(input.confluenceUrl);
    }
    if (input.confluenceSpaces !== undefined) {
      updates.push("confluence_spaces_json = ?");
      values.push(JSON.stringify(input.confluenceSpaces));
    }
    if (input.confluenceUsernameVaultRef !== undefined) {
      updates.push("confluence_username_vault_ref = ?");
      values.push(input.confluenceUsernameVaultRef);
    }
    if (input.confluenceApiTokenVaultRef !== undefined) {
      updates.push("confluence_api_token_vault_ref = ?");
      values.push(input.confluenceApiTokenVaultRef);
    }
    if (input.confluencePersonalTokenVaultRef !== undefined) {
      updates.push("confluence_personal_token_vault_ref = ?");
      values.push(input.confluencePersonalTokenVaultRef);
    }
    if (input.confluenceSslVerify !== undefined) {
      updates.push("confluence_ssl_verify = ?");
      values.push(input.confluenceSslVerify ? 1 : 0);
    }
    if (input.isActive !== undefined) {
      updates.push("is_active = ?");
      values.push(input.isActive ? 1 : 0);
    }

    if (updates.length === 0) return existing;

    updates.push("updated_at = ?");
    values.push(now);
    values.push(id);

    this.db.prepare(`UPDATE talos_atlassian_configs SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    return this.getAtlassianConfig(id);
  }

  deleteAtlassianConfig(id: string): boolean {
    const result = this.db.prepare(`DELETE FROM talos_atlassian_configs WHERE id = ?`).run(id);
    return result.changes > 0;
  }

  // ── Transaction Support ─────────────────────────────────────────────────────

  /**
   * Run a callback inside a SQLite transaction. Rolls back on error.
   */
  runInTransaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }
}
