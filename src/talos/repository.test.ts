/**
 * Repository Module Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { TalosRepository } from "./repository.js";

describe("TalosRepository", () => {
  let db: Database.Database;
  let repo: TalosRepository;
  const fixedTime = new Date("2025-01-15T12:00:00Z");

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    repo = new TalosRepository(db, { clock: () => fixedTime });
    repo.migrate();
  });

  describe("migrate", () => {
    it("should create all tables", () => {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as Array<{
        name: string;
      }>;

      const tableNames = tables.map((t) => t.name);
      expect(tableNames).toContain("talos_applications");
      expect(tableNames).toContain("talos_tests");
      expect(tableNames).toContain("talos_test_runs");
      expect(tableNames).toContain("talos_test_artifacts");
      expect(tableNames).toContain("talos_vault_roles");
    });

    it("should be idempotent", () => {
      expect(() => repo.migrate()).not.toThrow();
      expect(() => repo.migrate()).not.toThrow();
    });
  });

  describe("applications", () => {
    it("should create an application", () => {
      const app = repo.createApplication({
        name: "Test App",
        repositoryUrl: "https://github.com/test/app",
        baseUrl: "https://app.test.com",
      });

      expect(app.id).toBeDefined();
      expect(app.name).toBe("Test App");
      expect(app.repositoryUrl).toBe("https://github.com/test/app");
      expect(app.baseUrl).toBe("https://app.test.com");
      expect(app.createdAt).toEqual(fixedTime);
    });

    it("should get an application by ID", () => {
      const created = repo.createApplication({ name: "My App" });
      const fetched = repo.getApplication(created.id);

      expect(fetched).toBeDefined();
      expect(fetched?.id).toBe(created.id);
      expect(fetched?.name).toBe("My App");
    });

    it("should return null for non-existent application", () => {
      const app = repo.getApplication("non-existent-id");
      expect(app).toBeNull();
    });

    it("should list all applications", () => {
      repo.createApplication({ name: "App 1" });
      repo.createApplication({ name: "App 2" });
      repo.createApplication({ name: "App 3" });

      const apps = repo.listApplications();
      expect(apps).toHaveLength(3);
      expect(apps.map((a) => a.name)).toEqual(["App 1", "App 2", "App 3"]);
    });

    it("should update an application", () => {
      const app = repo.createApplication({ name: "Original" });
      const updated = repo.updateApplication(app.id, {
        name: "Updated",
        baseUrl: "https://new.url",
      });

      expect(updated?.name).toBe("Updated");
      expect(updated?.baseUrl).toBe("https://new.url");
    });

    it("should delete an application", () => {
      const app = repo.createApplication({ name: "To Delete" });
      expect(repo.getApplication(app.id)).toBeDefined();

      const deleted = repo.deleteApplication(app.id);
      expect(deleted).toBe(true);
      expect(repo.getApplication(app.id)).toBeNull();
    });

    it("should return false when deleting non-existent application", () => {
      const deleted = repo.deleteApplication("fake-id");
      expect(deleted).toBe(false);
    });
  });

  describe("tests", () => {
    let appId: string;

    beforeEach(() => {
      const app = repo.createApplication({ name: "Test App" });
      appId = app.id;
    });

    it("should create a test", () => {
      const test = repo.createTest({
        applicationId: appId,
        name: "Login Test",
        code: 'await page.goto("/login");',
        type: "e2e",
        tags: ["auth", "smoke"],
      });

      expect(test.id).toBeDefined();
      expect(test.applicationId).toBe(appId);
      expect(test.name).toBe("Login Test");
      expect(test.code).toBe('await page.goto("/login");');
      expect(test.type).toBe("e2e");
      expect(test.tags).toEqual(["auth", "smoke"]);
    });

    it("should get a test by ID", () => {
      const created = repo.createTest({
        applicationId: appId,
        name: "Test",
        code: "code",
        type: "unit",
      });
      const fetched = repo.getTest(created.id);

      expect(fetched).toBeDefined();
      expect(fetched?.id).toBe(created.id);
    });

    it("should list tests by application", () => {
      repo.createTest({ applicationId: appId, name: "Test 1", code: "c1", type: "e2e" });
      repo.createTest({ applicationId: appId, name: "Test 2", code: "c2", type: "e2e" });

      const tests = repo.getTestsByApplication(appId);
      expect(tests).toHaveLength(2);
    });

    it("should update a test", () => {
      const test = repo.createTest({
        applicationId: appId,
        name: "Original",
        code: "original",
        type: "e2e",
      });

      const updated = repo.updateTest(test.id, {
        name: "Updated",
        code: "updated code",
      });

      expect(updated?.name).toBe("Updated");
      expect(updated?.code).toBe("updated code");
    });

    it("should delete a test", () => {
      const test = repo.createTest({
        applicationId: appId,
        name: "Delete Me",
        code: "code",
        type: "e2e",
      });

      expect(repo.deleteTest(test.id)).toBe(true);
      expect(repo.getTest(test.id)).toBeNull();
    });
  });

  describe("test runs", () => {
    let appId: string;
    let testId: string;

    beforeEach(() => {
      const app = repo.createApplication({ name: "App" });
      appId = app.id;
      const test = repo.createTest({
        applicationId: appId,
        name: "Test",
        code: "code",
        type: "e2e",
      });
      testId = test.id;
    });

    it("should create a test run", () => {
      const run = repo.createTestRun({
        testId,
        triggeredBy: "manual",
        environment: "staging",
      });

      expect(run.id).toBeDefined();
      expect(run.testId).toBe(testId);
      expect(run.status).toBe("queued");
      expect(run.triggeredBy).toBe("manual");
      expect(run.environment).toBe("staging");
    });

    it("should update a test run", () => {
      const run = repo.createTestRun({
        testId,
        triggeredBy: "ci",
      });

      const updated = repo.updateTestRun(run.id, {
        status: "passed",
        durationMs: 1500,
        completedAt: fixedTime,
      });

      expect(updated?.status).toBe("passed");
      expect(updated?.durationMs).toBe(1500);
    });

    it("should get test runs by test", () => {
      repo.createTestRun({ testId, triggeredBy: "manual" });
      repo.createTestRun({ testId, triggeredBy: "scheduled" });
      repo.createTestRun({ testId, triggeredBy: "ci" });

      const runs = repo.getTestRunsByTest(testId, 10);
      expect(runs).toHaveLength(3);
    });

    it("should respect limit parameter", () => {
      for (let i = 0; i < 10; i++) {
        repo.createTestRun({ testId, triggeredBy: "manual" });
      }

      const runs = repo.getTestRunsByTest(testId, 5);
      expect(runs).toHaveLength(5);
    });
  });

  describe("artifacts", () => {
    let testRunId: string;

    beforeEach(() => {
      const app = repo.createApplication({ name: "App" });
      const test = repo.createTest({
        applicationId: app.id,
        name: "Test",
        code: "code",
        type: "e2e",
      });
      const run = repo.createTestRun({ testId: test.id, triggeredBy: "test" });
      testRunId = run.id;
    });

    it("should create an artifact", () => {
      const artifact = repo.createArtifact({
        testRunId,
        type: "screenshot",
        filePath: "screenshots/failure.png",
        mimeType: "image/png",
        sizeBytes: 12345,
        stepName: "Login step",
      });

      expect(artifact.id).toBeDefined();
      expect(artifact.testRunId).toBe(testRunId);
      expect(artifact.type).toBe("screenshot");
      expect(artifact.filePath).toBe("screenshots/failure.png");
      expect(artifact.sizeBytes).toBe(12345);
    });

    it("should get artifacts by test run", () => {
      repo.createArtifact({
        testRunId,
        type: "screenshot",
        filePath: "s1.png",
        mimeType: "image/png",
        sizeBytes: 100,
      });
      repo.createArtifact({
        testRunId,
        type: "video",
        filePath: "v1.webm",
        mimeType: "video/webm",
        sizeBytes: 200,
      });

      const artifacts = repo.getArtifactsByRun(testRunId);
      expect(artifacts).toHaveLength(2);
    });
  });

  describe("vault roles", () => {
    let appId: string;

    beforeEach(() => {
      const app = repo.createApplication({ name: "App" });
      appId = app.id;
    });

    it("should create a vault role", () => {
      const role = repo.createVaultRole({
        applicationId: appId,
        name: "Admin User",
        roleType: "admin",
        usernameRef: "vault://admin/username",
        passwordRef: "vault://admin/password",
      });

      expect(role.id).toBeDefined();
      expect(role.applicationId).toBe(appId);
      expect(role.roleType).toBe("admin");
      expect(role.usernameRef).toBe("vault://admin/username");
    });

    it("should get role by type", () => {
      repo.createVaultRole({
        applicationId: appId,
        name: "Admin",
        roleType: "admin",
        usernameRef: "ref1",
        passwordRef: "ref2",
      });
      repo.createVaultRole({
        applicationId: appId,
        name: "User",
        roleType: "user",
        usernameRef: "ref3",
        passwordRef: "ref4",
      });

      const adminRole = repo.getRoleByType(appId, "admin");
      expect(adminRole?.roleType).toBe("admin");

      const userRole = repo.getRoleByType(appId, "user");
      expect(userRole?.roleType).toBe("user");
    });

    it("should get roles by application", () => {
      repo.createVaultRole({
        applicationId: appId,
        name: "R1",
        roleType: "admin",
        usernameRef: "r",
        passwordRef: "r",
      });
      repo.createVaultRole({
        applicationId: appId,
        name: "R2",
        roleType: "user",
        usernameRef: "r",
        passwordRef: "r",
      });

      const roles = repo.getRolesByApplication(appId);
      expect(roles).toHaveLength(2);
    });

    it("should delete a vault role", () => {
      const role = repo.createVaultRole({
        applicationId: appId,
        name: "Delete Me",
        roleType: "guest",
        usernameRef: "r",
        passwordRef: "r",
      });

      expect(repo.deleteVaultRole(role.id)).toBe(true);
      expect(repo.getVaultRole(role.id)).toBeNull();
    });
  });

  describe("acceptance criteria", () => {
    let appId: string;

    beforeEach(() => {
      const app = repo.createApplication({ name: "Test App" });
      appId = app.id;
    });

    it("should create acceptance criteria", () => {
      const ac = repo.createAcceptanceCriteria({
        applicationId: appId,
        title: "Login validation",
        description: "User login must validate credentials",
        scenarios: [{ given: "valid credentials", when: "user logs in", then: "access granted" }],
        preconditions: ["User exists"],
        dataRequirements: ["username", "password"],
        nfrTags: ["security"],
        confidence: 0.85,
        tags: ["auth"],
      });

      expect(ac.id).toBeDefined();
      expect(ac.applicationId).toBe(appId);
      expect(ac.title).toBe("Login validation");
      expect(ac.scenarios).toHaveLength(1);
      expect(ac.scenarios[0].given).toBe("valid credentials");
      expect(ac.preconditions).toEqual(["User exists"]);
      expect(ac.nfrTags).toEqual(["security"]);
      expect(ac.confidence).toBe(0.85);
      expect(ac.status).toBe("draft");
      expect(ac.createdAt).toEqual(fixedTime);
    });

    it("should create criteria with defaults", () => {
      const ac = repo.createAcceptanceCriteria({
        applicationId: appId,
        title: "Minimal",
        description: "",
      });

      expect(ac.scenarios).toEqual([]);
      expect(ac.preconditions).toEqual([]);
      expect(ac.dataRequirements).toEqual([]);
      expect(ac.nfrTags).toEqual([]);
      expect(ac.confidence).toBe(0);
      expect(ac.tags).toEqual([]);
      expect(ac.status).toBe("draft");
    });

    it("should get acceptance criteria by ID", () => {
      const created = repo.createAcceptanceCriteria({
        applicationId: appId,
        title: "Test AC",
        description: "desc",
      });
      const fetched = repo.getAcceptanceCriteria(created.id);

      expect(fetched).toBeDefined();
      expect(fetched?.id).toBe(created.id);
      expect(fetched?.title).toBe("Test AC");
    });

    it("should return null for non-existent criteria", () => {
      const ac = repo.getAcceptanceCriteria("non-existent");
      expect(ac).toBeNull();
    });

    it("should list criteria by application", () => {
      repo.createAcceptanceCriteria({ applicationId: appId, title: "AC1", description: "" });
      repo.createAcceptanceCriteria({ applicationId: appId, title: "AC2", description: "" });
      repo.createAcceptanceCriteria({ applicationId: appId, title: "AC3", description: "" });

      const list = repo.listAcceptanceCriteria(appId);
      expect(list).toHaveLength(3);
    });

    it("should filter criteria by status", () => {
      repo.createAcceptanceCriteria({ applicationId: appId, title: "Draft", description: "", status: "draft" });
      repo.createAcceptanceCriteria({ applicationId: appId, title: "Approved", description: "", status: "approved" });

      const drafts = repo.listAcceptanceCriteria(appId, { status: "draft" });
      expect(drafts).toHaveLength(1);
      expect(drafts[0].title).toBe("Draft");
    });

    it("should filter criteria by tags", () => {
      repo.createAcceptanceCriteria({ applicationId: appId, title: "Auth", description: "", tags: ["auth", "login"] });
      repo.createAcceptanceCriteria({ applicationId: appId, title: "Dashboard", description: "", tags: ["dashboard"] });

      const authCriteria = repo.listAcceptanceCriteria(appId, { tags: ["auth"] });
      expect(authCriteria).toHaveLength(1);
      expect(authCriteria[0].title).toBe("Auth");
    });

    it("should filter criteria by nfrTags", () => {
      repo.createAcceptanceCriteria({ applicationId: appId, title: "Secure", description: "", nfrTags: ["security"] });
      repo.createAcceptanceCriteria({ applicationId: appId, title: "Fast", description: "", nfrTags: ["performance"] });

      const secCriteria = repo.listAcceptanceCriteria(appId, { nfrTags: ["security"] });
      expect(secCriteria).toHaveLength(1);
      expect(secCriteria[0].title).toBe("Secure");
    });

    it("should filter criteria by requirementChunkId", () => {
      repo.createAcceptanceCriteria({
        applicationId: appId,
        title: "Linked",
        description: "",
        requirementChunkId: "chunk-1",
      });
      repo.createAcceptanceCriteria({ applicationId: appId, title: "Unlinked", description: "" });

      const linked = repo.listAcceptanceCriteria(appId, { requirementChunkId: "chunk-1" });
      expect(linked).toHaveLength(1);
      expect(linked[0].title).toBe("Linked");
    });

    it("should update acceptance criteria", () => {
      const ac = repo.createAcceptanceCriteria({
        applicationId: appId,
        title: "Original",
        description: "original desc",
      });

      const updated = repo.updateAcceptanceCriteria(ac.id, {
        title: "Updated",
        status: "approved",
        confidence: 0.95,
        scenarios: [{ given: "a", when: "b", then: "c" }],
      });

      expect(updated?.title).toBe("Updated");
      expect(updated?.status).toBe("approved");
      expect(updated?.confidence).toBe(0.95);
      expect(updated?.scenarios).toHaveLength(1);
    });

    it("should return null when updating non-existent criteria", () => {
      const result = repo.updateAcceptanceCriteria("fake-id", { title: "Nope" });
      expect(result).toBeNull();
    });

    it("should return existing when updating with empty input", () => {
      const ac = repo.createAcceptanceCriteria({
        applicationId: appId,
        title: "Unchanged",
        description: "",
      });
      const result = repo.updateAcceptanceCriteria(ac.id, {});
      expect(result?.title).toBe("Unchanged");
    });

    it("should delete acceptance criteria", () => {
      const ac = repo.createAcceptanceCriteria({
        applicationId: appId,
        title: "Delete Me",
        description: "",
      });

      expect(repo.deleteAcceptanceCriteria(ac.id)).toBe(true);
      expect(repo.getAcceptanceCriteria(ac.id)).toBeNull();
    });

    it("should return false when deleting non-existent criteria", () => {
      expect(repo.deleteAcceptanceCriteria("fake-id")).toBe(false);
    });
  });

  describe("traceability", () => {
    let appId: string;

    beforeEach(() => {
      const app = repo.createApplication({ name: "Trace App" });
      appId = app.id;
    });

    it("should create a traceability link", () => {
      const link = repo.createTraceabilityLink({
        applicationId: appId,
        requirementChunkId: "req-1",
        acceptanceCriteriaId: "ac-1",
        testId: "test-1",
        coverageStatus: "covered",
      });

      expect(link.id).toBeDefined();
      expect(link.applicationId).toBe(appId);
      expect(link.requirementChunkId).toBe("req-1");
      expect(link.acceptanceCriteriaId).toBe("ac-1");
      expect(link.testId).toBe("test-1");
      expect(link.coverageStatus).toBe("covered");
    });

    it("should create link with defaults", () => {
      const link = repo.createTraceabilityLink({
        applicationId: appId,
        requirementChunkId: "req-1",
      });

      expect(link.acceptanceCriteriaId).toBeNull();
      expect(link.testId).toBeNull();
      expect(link.coverageStatus).toBe("uncovered");
    });

    it("should get traceability links for app", () => {
      repo.createTraceabilityLink({ applicationId: appId, requirementChunkId: "req-1" });
      repo.createTraceabilityLink({ applicationId: appId, requirementChunkId: "req-2" });

      const links = repo.getTraceabilityForApp(appId);
      expect(links).toHaveLength(2);
    });

    it("should get coverage report", () => {
      // Create criteria
      const ac = repo.createAcceptanceCriteria({ applicationId: appId, title: "AC1", description: "" });
      const ac2 = repo.createAcceptanceCriteria({
        applicationId: appId,
        title: "AC2",
        description: "",
        status: "implemented",
      });

      // Create traceability links
      repo.createTraceabilityLink({
        applicationId: appId,
        requirementChunkId: "req-1",
        acceptanceCriteriaId: ac.id,
        testId: "test-1",
        coverageStatus: "covered",
      });
      repo.createTraceabilityLink({
        applicationId: appId,
        requirementChunkId: "req-2",
        acceptanceCriteriaId: ac2.id,
        coverageStatus: "uncovered",
      });
      repo.createTraceabilityLink({
        applicationId: appId,
        requirementChunkId: "req-3",
        coverageStatus: "uncovered",
      });

      const report = repo.getCoverageReport(appId);
      expect(report.totalRequirements).toBe(3);
      expect(report.coveredRequirements).toBe(1);
      expect(report.totalCriteria).toBe(2);
      expect(report.implementedCriteria).toBe(1);
      expect(report.coveragePercentage).toBe(33);
      expect(report.unmappedRequirements).toContain("req-3");
      expect(report.untestedCriteria).toContain(ac2.id);
    });

    it("should get unmapped requirements", () => {
      repo.createTraceabilityLink({
        applicationId: appId,
        requirementChunkId: "req-linked",
        acceptanceCriteriaId: "ac-1",
      });
      repo.createTraceabilityLink({
        applicationId: appId,
        requirementChunkId: "req-unmapped",
      });

      const unmapped = repo.getUnmappedRequirements(appId);
      expect(unmapped).toContain("req-unmapped");
      expect(unmapped).not.toContain("req-linked");
    });

    it("should get untested criteria", () => {
      repo.createTraceabilityLink({
        applicationId: appId,
        requirementChunkId: "req-1",
        acceptanceCriteriaId: "ac-tested",
        testId: "test-1",
      });
      repo.createTraceabilityLink({
        applicationId: appId,
        requirementChunkId: "req-2",
        acceptanceCriteriaId: "ac-untested",
      });

      const untested = repo.getUntestedCriteria(appId);
      expect(untested).toContain("ac-untested");
      expect(untested).not.toContain("ac-tested");
    });

    it("should link criteria to test (existing link)", () => {
      const ac = repo.createAcceptanceCriteria({
        applicationId: appId,
        title: "AC",
        description: "",
      });
      repo.createTraceabilityLink({
        applicationId: appId,
        requirementChunkId: "req-1",
        acceptanceCriteriaId: ac.id,
      });

      const linked = repo.linkCriteriaToTest(ac.id, "test-1");
      expect(linked).toBeDefined();
      expect(linked?.testId).toBe("test-1");
      expect(linked?.coverageStatus).toBe("covered");
    });

    it("should link criteria to test (new link created)", () => {
      const ac = repo.createAcceptanceCriteria({
        applicationId: appId,
        title: "AC new link",
        description: "",
      });

      const linked = repo.linkCriteriaToTest(ac.id, "test-2");
      expect(linked).toBeDefined();
      expect(linked?.testId).toBe("test-2");
      expect(linked?.coverageStatus).toBe("covered");
    });

    it("should return null when linking non-existent criteria", () => {
      const result = repo.linkCriteriaToTest("fake-id", "test-1");
      expect(result).toBeNull();
    });

    it("should return empty report for app with no traceability", () => {
      const report = repo.getCoverageReport(appId);
      expect(report.totalRequirements).toBe(0);
      expect(report.coveragePercentage).toBe(0);
      expect(report.unmappedRequirements).toEqual([]);
    });
  });

  // ── Data Source CRUD ──────────────────────────────────────────────────────

  describe("data sources", () => {
    let appId: string;

    beforeEach(() => {
      const app = repo.createApplication({ name: "DS Test App" });
      appId = app.id;
    });

    it("should create a data source", () => {
      const ds = repo.createDataSource({
        applicationId: appId,
        label: "Primary DB",
        driverType: "postgresql",
        jdbcUrl: "jdbc:postgresql://localhost:5432/test",
        usernameVaultRef: "vault:db-user",
        passwordVaultRef: "vault:db-pass",
      });

      expect(ds.id).toBeDefined();
      expect(ds.label).toBe("Primary DB");
      expect(ds.driverType).toBe("postgresql");
      expect(ds.jdbcUrl).toBe("jdbc:postgresql://localhost:5432/test");
      expect(ds.isActive).toBe(true);
      expect(ds.createdAt).toEqual(fixedTime);
    });

    it("should get a data source by ID", () => {
      const created = repo.createDataSource({
        applicationId: appId,
        label: "Test DB",
        driverType: "oracle",
        jdbcUrl: "jdbc:oracle:thin:@localhost:1521:xe",
        usernameVaultRef: "vault:ora-user",
        passwordVaultRef: "vault:ora-pass",
      });

      const fetched = repo.getDataSource(created.id);
      expect(fetched).toBeDefined();
      expect(fetched?.label).toBe("Test DB");
      expect(fetched?.driverType).toBe("oracle");
    });

    it("should return null for non-existent data source", () => {
      expect(repo.getDataSource("nonexistent")).toBeNull();
    });

    it("should list data sources by application", () => {
      repo.createDataSource({
        applicationId: appId,
        label: "DB A",
        driverType: "postgresql",
        jdbcUrl: "jdbc:pg://a",
        usernameVaultRef: "",
        passwordVaultRef: "",
      });
      repo.createDataSource({
        applicationId: appId,
        label: "DB B",
        driverType: "mysql",
        jdbcUrl: "jdbc:mysql://b",
        usernameVaultRef: "",
        passwordVaultRef: "",
      });

      const sources = repo.getDataSourcesByApp(appId);
      expect(sources).toHaveLength(2);
      expect(sources.map((s) => s.label)).toEqual(["DB A", "DB B"]);
    });

    it("should update a data source", () => {
      const ds = repo.createDataSource({
        applicationId: appId,
        label: "Old Label",
        driverType: "postgresql",
        jdbcUrl: "jdbc:pg://old",
        usernameVaultRef: "",
        passwordVaultRef: "",
      });

      const updated = repo.updateDataSource(ds.id, { label: "New Label", jdbcUrl: "jdbc:pg://new" });
      expect(updated?.label).toBe("New Label");
      expect(updated?.jdbcUrl).toBe("jdbc:pg://new");
    });

    it("should return null when updating non-existent data source", () => {
      expect(repo.updateDataSource("fake", { label: "x" })).toBeNull();
    });

    it("should delete a data source", () => {
      const ds = repo.createDataSource({
        applicationId: appId,
        label: "To Delete",
        driverType: "sqlite",
        jdbcUrl: "jdbc:sqlite:test.db",
        usernameVaultRef: "",
        passwordVaultRef: "",
      });

      expect(repo.deleteDataSource(ds.id)).toBe(true);
      expect(repo.getDataSource(ds.id)).toBeNull();
    });

    it("should return false when deleting non-existent data source", () => {
      expect(repo.deleteDataSource("fake")).toBe(false);
    });

    it("should deactivate a data source", () => {
      const ds = repo.createDataSource({
        applicationId: appId,
        label: "Active DB",
        driverType: "postgresql",
        jdbcUrl: "jdbc:pg://x",
        usernameVaultRef: "",
        passwordVaultRef: "",
      });

      expect(ds.isActive).toBe(true);
      const updated = repo.updateDataSource(ds.id, { isActive: false });
      expect(updated?.isActive).toBe(false);
    });
  });

  // ── Atlassian Config CRUD ─────────────────────────────────────────────────

  describe("atlassian configs", () => {
    let appId: string;

    beforeEach(() => {
      const app = repo.createApplication({ name: "Atlassian Test App" });
      appId = app.id;
    });

    it("should create an Atlassian config", () => {
      const config = repo.createAtlassianConfig({
        applicationId: appId,
        deploymentType: "cloud",
        jiraUrl: "https://test.atlassian.net",
        jiraProject: "TEST",
        jiraUsernameVaultRef: "vault:jira-user",
        jiraApiTokenVaultRef: "vault:jira-token",
        confluenceUrl: "https://test.atlassian.net/wiki",
        confluenceSpaces: ["DEV", "QA"],
      });

      expect(config.id).toBeDefined();
      expect(config.deploymentType).toBe("cloud");
      expect(config.jiraUrl).toBe("https://test.atlassian.net");
      expect(config.jiraProject).toBe("TEST");
      expect(config.confluenceSpaces).toEqual(["DEV", "QA"]);
      expect(config.isActive).toBe(true);
    });

    it("should get an Atlassian config by ID", () => {
      const created = repo.createAtlassianConfig({
        applicationId: appId,
        deploymentType: "datacenter",
        jiraUrl: "https://jira.internal.com",
        jiraProject: "INT",
      });

      const fetched = repo.getAtlassianConfig(created.id);
      expect(fetched).toBeDefined();
      expect(fetched?.deploymentType).toBe("datacenter");
    });

    it("should return null for non-existent Atlassian config", () => {
      expect(repo.getAtlassianConfig("nonexistent")).toBeNull();
    });

    it("should get Atlassian config by application ID", () => {
      repo.createAtlassianConfig({
        applicationId: appId,
        deploymentType: "cloud",
        jiraUrl: "https://test.atlassian.net",
        jiraProject: "TEST",
      });

      const config = repo.getAtlassianConfigByApp(appId);
      expect(config).toBeDefined();
      expect(config?.applicationId).toBe(appId);
    });

    it("should return null when no Atlassian config for app", () => {
      expect(repo.getAtlassianConfigByApp(appId)).toBeNull();
    });

    it("should update an Atlassian config", () => {
      const config = repo.createAtlassianConfig({
        applicationId: appId,
        deploymentType: "cloud",
        jiraUrl: "https://old.atlassian.net",
        jiraProject: "OLD",
      });

      const updated = repo.updateAtlassianConfig(config.id, {
        jiraUrl: "https://new.atlassian.net",
        jiraProject: "NEW",
        confluenceSpaces: ["SPACE1"],
      });

      expect(updated?.jiraUrl).toBe("https://new.atlassian.net");
      expect(updated?.jiraProject).toBe("NEW");
      expect(updated?.confluenceSpaces).toEqual(["SPACE1"]);
    });

    it("should return null when updating non-existent config", () => {
      expect(repo.updateAtlassianConfig("fake", { jiraUrl: "x" })).toBeNull();
    });

    it("should delete an Atlassian config", () => {
      const config = repo.createAtlassianConfig({
        applicationId: appId,
        deploymentType: "cloud",
        jiraUrl: "https://test.atlassian.net",
        jiraProject: "TEST",
      });

      expect(repo.deleteAtlassianConfig(config.id)).toBe(true);
      expect(repo.getAtlassianConfig(config.id)).toBeNull();
    });

    it("should return false when deleting non-existent config", () => {
      expect(repo.deleteAtlassianConfig("fake")).toBe(false);
    });

    it("should handle SSL verify toggle", () => {
      const config = repo.createAtlassianConfig({
        applicationId: appId,
        deploymentType: "datacenter",
        jiraSslVerify: false,
        confluenceSslVerify: false,
      });

      expect(config.jiraSslVerify).toBe(false);
      expect(config.confluenceSslVerify).toBe(false);

      const updated = repo.updateAtlassianConfig(config.id, {
        jiraSslVerify: true,
        confluenceSslVerify: true,
      });

      expect(updated?.jiraSslVerify).toBe(true);
      expect(updated?.confluenceSslVerify).toBe(true);
    });

    it("should deactivate an Atlassian config", () => {
      const config = repo.createAtlassianConfig({
        applicationId: appId,
        deploymentType: "cloud",
      });

      const updated = repo.updateAtlassianConfig(config.id, { isActive: false });
      expect(updated?.isActive).toBe(false);
    });
  });

  describe("app intelligence", () => {
    let appId: string;

    beforeEach(() => {
      const app = repo.createApplication({
        name: "Intelligence Test App",
        repositoryUrl: "https://github.com/test/app",
        baseUrl: "https://app.test.com",
      });
      appId = app.id;
    });

    it("should save and retrieve an intelligence report", () => {
      const report = {
        id: "report-1",
        applicationId: appId,
        techStack: [{ name: "React", version: "18.0.0", category: "framework" as const, source: "package.json" }],
        databases: [{ type: "PostgreSQL", connectionPattern: "postgres://host/db", source: ".env" }],
        testUsers: [{ variableName: "TEST_USER_EMAIL", source: ".env.example", roleHint: "test-user" }],
        documentation: [{ filePath: "README.md", type: "readme" as const, title: "README" }],
        configFiles: [{ filePath: "package.json", type: "npm" }],
        scannedAt: fixedTime,
      };

      repo.saveIntelligenceReport(report);
      const retrieved = repo.getIntelligenceReport(appId);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe("report-1");
      expect(retrieved!.applicationId).toBe(appId);
      expect(retrieved!.techStack).toHaveLength(1);
      expect(retrieved!.techStack[0].name).toBe("React");
      expect(retrieved!.databases).toHaveLength(1);
      expect(retrieved!.testUsers).toHaveLength(1);
      expect(retrieved!.documentation).toHaveLength(1);
      expect(retrieved!.configFiles).toHaveLength(1);
      expect(retrieved!.scannedAt).toEqual(fixedTime);
    });

    it("should upsert — replacing old report on re-save", () => {
      const report1 = {
        id: "report-1",
        applicationId: appId,
        techStack: [{ name: "React", category: "framework" as const, source: "package.json" }],
        databases: [],
        testUsers: [],
        documentation: [],
        configFiles: [],
        scannedAt: fixedTime,
      };

      const report2 = {
        id: "report-2",
        applicationId: appId,
        techStack: [
          { name: "React", category: "framework" as const, source: "package.json" },
          { name: "Vue.js", category: "framework" as const, source: "package.json" },
        ],
        databases: [],
        testUsers: [],
        documentation: [],
        configFiles: [],
        scannedAt: new Date("2026-03-29T00:00:00Z"),
      };

      repo.saveIntelligenceReport(report1);
      repo.saveIntelligenceReport(report2);

      const retrieved = repo.getIntelligenceReport(appId);
      expect(retrieved!.id).toBe("report-2");
      expect(retrieved!.techStack).toHaveLength(2);
    });

    it("should return null for app with no report", () => {
      const result = repo.getIntelligenceReport(appId);
      expect(result).toBeNull();
    });

    it("should delete intelligence report", () => {
      const report = {
        id: "report-1",
        applicationId: appId,
        techStack: [],
        databases: [],
        testUsers: [],
        documentation: [],
        configFiles: [],
        scannedAt: fixedTime,
      };

      repo.saveIntelligenceReport(report);
      expect(repo.getIntelligenceReport(appId)).not.toBeNull();

      const deleted = repo.deleteIntelligenceReport(appId);
      expect(deleted).toBe(true);
      expect(repo.getIntelligenceReport(appId)).toBeNull();
    });

    it("should cascade delete when application is deleted", () => {
      const report = {
        id: "report-1",
        applicationId: appId,
        techStack: [],
        databases: [],
        testUsers: [],
        documentation: [],
        configFiles: [],
        scannedAt: fixedTime,
      };

      repo.saveIntelligenceReport(report);
      repo.deleteApplication(appId);
      expect(repo.getIntelligenceReport(appId)).toBeNull();
    });

    it("migration creates talos_app_intelligence table", () => {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as Array<{
        name: string;
      }>;
      expect(tables.map((t) => t.name)).toContain("talos_app_intelligence");
    });
  });

  // ── Untested methods coverage ──────────────────────────────────────────────

  describe("getApplicationByName", () => {
    it("returns application when found by name", () => {
      repo.createApplication({ name: "Named App", baseUrl: "https://named.com" });
      const found = repo.getApplicationByName("Named App");
      expect(found).not.toBeNull();
      expect(found?.name).toBe("Named App");
    });

    it("returns null when name not found", () => {
      expect(repo.getApplicationByName("Nonexistent App")).toBeNull();
    });
  });

  describe("listApplications with status filter", () => {
    it("returns only apps matching the given status", () => {
      const app1 = repo.createApplication({ name: "Active App" });
      const app2 = repo.createApplication({ name: "Archived App" });
      repo.updateApplication(app1.id, { status: "active" });
      repo.updateApplication(app2.id, { status: "archived" });
      const activeApps = repo.listApplications("active");
      expect(activeApps.some((a) => a.name === "Active App")).toBe(true);
      expect(activeApps.every((a) => a.status === "active")).toBe(true);
    });
  });

  describe("updateApplication — all optional fields", () => {
    it("updates all optional fields at once", () => {
      const app = repo.createApplication({ name: "Full Update" });
      const updated = repo.updateApplication(app.id, {
        description: "Updated description",
        repositoryUrl: "https://github.com/new/repo",
        githubPatRef: "vault:new-pat",
        baseUrl: "https://new.base.url",
        status: "active",
        metadata: { key: "value" },
        mtlsEnabled: true,
        mtlsConfig: { clientCertVaultRef: "vault:cert", clientKeyVaultRef: "vault:key" },
      });
      expect(updated?.description).toBe("Updated description");
      expect(updated?.repositoryUrl).toBe("https://github.com/new/repo");
      expect(updated?.mtlsEnabled).toBe(true);
    });

    it("returns existing when no fields provided", () => {
      const app = repo.createApplication({ name: "No Change" });
      const result = repo.updateApplication(app.id, {});
      expect(result?.name).toBe("No Change");
    });
  });

  describe("listRunsByApp", () => {
    it("lists all test runs for application", () => {
      const app = repo.createApplication({ name: "Runs App" });
      const test = repo.createTest({ applicationId: app.id, name: "T", code: "test()", type: "e2e" });
      repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });
      repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "ci" });
      const runs = repo.listRunsByApp(app.id);
      expect(runs).toHaveLength(2);
    });

    it("respects limit parameter", () => {
      const app = repo.createApplication({ name: "Limit App" });
      const test = repo.createTest({ applicationId: app.id, name: "T", code: "test()", type: "e2e" });
      for (let i = 0; i < 5; i++) {
        repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });
      }
      const runs = repo.listRunsByApp(app.id, 3);
      expect(runs).toHaveLength(3);
    });
  });

  describe("getTestRun", () => {
    it("returns test run by ID", () => {
      const app = repo.createApplication({ name: "App" });
      const test = repo.createTest({ applicationId: app.id, name: "T", code: "test()", type: "e2e" });
      const run = repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });
      const fetched = repo.getTestRun(run.id);
      expect(fetched?.id).toBe(run.id);
    });

    it("returns null for unknown ID", () => {
      expect(repo.getTestRun("nonexistent")).toBeNull();
    });
  });

  describe("updateTestRun — all optional fields", () => {
    it("updates all optional fields", () => {
      const app = repo.createApplication({ name: "App" });
      const test = repo.createTest({ applicationId: app.id, name: "T", code: "test()", type: "e2e" });
      const run = repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });
      const now = new Date();
      const updated = repo.updateTestRun(run.id, {
        status: "failed",
        durationMs: 1234,
        errorMessage: "Something broke",
        errorStack: "at line 1",
        retryAttempt: 1,
        startedAt: now,
        completedAt: now,
        metadata: { info: "test" },
      });
      expect(updated?.status).toBe("failed");
      expect(updated?.durationMs).toBe(1234);
      expect(updated?.errorMessage).toBe("Something broke");
    });

    it("returns existing when no fields provided", () => {
      const app = repo.createApplication({ name: "App" });
      const test = repo.createTest({ applicationId: app.id, name: "T", code: "test()", type: "e2e" });
      const run = repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });
      const result = repo.updateTestRun(run.id, {});
      expect(result?.id).toBe(run.id);
    });

    it("returns null for unknown run", () => {
      expect(repo.updateTestRun("nonexistent", { status: "passed" })).toBeNull();
    });
  });

  describe("getArtifact", () => {
    it("returns null for unknown ID", () => {
      expect(repo.getArtifact("nonexistent")).toBeNull();
    });
  });

  describe("listRolesByApp", () => {
    it("lists vault roles ordered by type and name", () => {
      const app = repo.createApplication({ name: "App" });
      repo.createVaultRole({
        applicationId: app.id,
        name: "Admin",
        roleType: "admin",
        usernameRef: "u",
        passwordRef: "p",
      });
      repo.createVaultRole({
        applicationId: app.id,
        name: "User",
        roleType: "user",
        usernameRef: "u",
        passwordRef: "p",
      });
      const roles = repo.listRolesByApp(app.id);
      expect(roles).toHaveLength(2);
    });
  });

  describe("updateVaultRole", () => {
    it("updates vault role fields", () => {
      const app = repo.createApplication({ name: "App" });
      const role = repo.createVaultRole({
        applicationId: app.id,
        name: "Role",
        roleType: "admin",
        usernameRef: "v:user",
        passwordRef: "v:pass",
      });
      const updated = repo.updateVaultRole(role.id, {
        name: "Updated Role",
        usernameRef: "v:user2",
        passwordRef: "v:pass2",
        isActive: false,
        description: "Updated",
        additionalRefs: { otherRef: "v:other" },
        metadata: { version: 2 },
      });
      expect(updated?.name).toBe("Updated Role");
      expect(updated?.isActive).toBe(false);
    });

    it("returns existing when no fields provided", () => {
      const app = repo.createApplication({ name: "App" });
      const role = repo.createVaultRole({
        applicationId: app.id,
        name: "Role",
        roleType: "admin",
        usernameRef: "u",
        passwordRef: "p",
      });
      const result = repo.updateVaultRole(role.id, {});
      expect(result?.id).toBe(role.id);
    });

    it("returns null for unknown role", () => {
      expect(repo.updateVaultRole("nonexistent", { name: "x" })).toBeNull();
    });
  });

  describe("getApplicationStats", () => {
    it("returns stats with runs", () => {
      const app = repo.createApplication({ name: "Stats App" });
      const test = repo.createTest({ applicationId: app.id, name: "T", code: "test()", type: "e2e" });
      repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });
      const passRun = repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "ci" });
      repo.updateTestRun(passRun.id, { status: "passed" });

      const stats = repo.getApplicationStats(app.id);
      expect(stats.totalTests).toBe(1);
      expect(stats.totalRuns).toBe(2);
      expect(stats.passedRuns).toBe(1);
      expect(stats.lastRunAt).not.toBeNull();
    });

    it("returns zeros and null for empty application", () => {
      const app = repo.createApplication({ name: "Empty Stats" });
      const stats = repo.getApplicationStats(app.id);
      expect(stats.totalTests).toBe(0);
      expect(stats.totalRuns).toBe(0);
      expect(stats.lastRunAt).toBeNull();
    });
  });

  describe("getTraceabilityLink", () => {
    it("returns null for unknown ID", () => {
      expect(repo.getTraceabilityLink("nonexistent")).toBeNull();
    });

    it("returns link by ID", () => {
      const app = repo.createApplication({ name: "App" });
      const link = repo.createTraceabilityLink({ applicationId: app.id, requirementChunkId: "req-1" });
      const fetched = repo.getTraceabilityLink(link.id);
      expect(fetched?.id).toBe(link.id);
    });
  });

  describe("listTestsByApp with status filter", () => {
    it("filters tests by status", () => {
      const app = repo.createApplication({ name: "Filter App" });
      const t1 = repo.createTest({ applicationId: app.id, name: "Draft", code: "test()", type: "e2e" });
      const t2 = repo.createTest({ applicationId: app.id, name: "Active", code: "test()", type: "e2e" });
      repo.updateTest(t2.id, { status: "active" });
      const drafts = repo.getTestsByApplication(app.id, "draft");
      expect(drafts.some((t) => t.id === t1.id)).toBe(true);
      expect(drafts.every((t) => t.status === "draft")).toBe(true);
    });
  });
});
