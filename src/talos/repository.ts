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
  TalosTest,
  TalosTestRun,
  TalosTestArtifact,
  TalosVaultRole,
  CreateApplicationInput,
  UpdateApplicationInput,
  CreateTestInput,
  UpdateTestInput,
  CreateTestRunInput,
  UpdateTestRunInput,
  CreateArtifactInput,
  CreateVaultRoleInput,
  UpdateVaultRoleInput,
  StoredApplication,
  StoredTest,
  StoredTestRun,
  StoredArtifact,
  StoredVaultRole,
  TalosApplicationStatus,
  TalosTestStatus,
  TalosTestType,
  TalosTestRunStatus,
  TalosTestRunTrigger,
  TalosArtifactType,
  TalosVaultRoleType,
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
  tags: row.tags_json ? JSON.parse(row.tags_json) as string[] : [],
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
    `);
  }

  // ── Application CRUD ────────────────────────────────────────────────────────

  createApplication(input: CreateApplicationInput): TalosApplication {
    const now = this.clock().toISOString();
    const id = randomUUID();

    const stmt = this.db.prepare(`
      INSERT INTO talos_applications (
        id, name, description, repository_url, github_pat_ref, base_url,
        status, metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
    `);

    stmt.run(
      id,
      input.name,
      input.description ?? "",
      input.repositoryUrl ?? "",
      input.githubPatRef ?? null,
      input.baseUrl ?? "",
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

    if (updates.length === 0) return existing;

    updates.push("updated_at = ?");
    values.push(now);
    values.push(id);

    const stmt = this.db.prepare(
      `UPDATE talos_applications SET ${updates.join(", ")} WHERE id = ?`
    );
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

    const stmt = this.db.prepare(
      `UPDATE talos_tests SET ${updates.join(", ")} WHERE id = ?`
    );
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
    const stmt = this.db.prepare(
      `SELECT * FROM talos_test_runs WHERE test_id = ? ORDER BY created_at DESC LIMIT ?`
    );
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

    const stmt = this.db.prepare(
      `UPDATE talos_test_runs SET ${updates.join(", ")} WHERE id = ?`
    );
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
    const stmt = this.db.prepare(
      `SELECT * FROM talos_test_artifacts WHERE test_run_id = ? ORDER BY created_at`
    );
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
    const stmt = this.db.prepare(
      `SELECT * FROM talos_vault_roles WHERE application_id = ? ORDER BY role_type, name`
    );
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

    const stmt = this.db.prepare(
      `UPDATE talos_vault_roles SET ${updates.join(", ")} WHERE id = ?`
    );
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
}
