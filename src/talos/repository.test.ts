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
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as Array<{ name: string }>;

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
      repo.createAcceptanceCriteria({ applicationId: appId, title: "Linked", description: "", requirementChunkId: "chunk-1" });
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
      const ac2 = repo.createAcceptanceCriteria({ applicationId: appId, title: "AC2", description: "", status: "implemented" });

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
});
