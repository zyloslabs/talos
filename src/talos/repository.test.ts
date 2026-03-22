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
});
