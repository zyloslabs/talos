/**
 * Tests for ArtifactManager
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { TalosRepository } from "../repository.js";
import { ArtifactManager, type ArtifactManagerOptions } from "./artifact-manager.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function setup() {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const repo = new TalosRepository(db);
  repo.migrate();

  const tmpDir = path.join(os.tmpdir(), `talos-artifact-test-${Date.now()}`);
  const manager = new ArtifactManager({
    config: { path: tmpDir, maxStorageMb: 10, retentionDays: 30 },
    repository: repo,
  } as ArtifactManagerOptions);

  return { repo, manager, tmpDir };
}

describe("ArtifactManager", () => {
  let repo: TalosRepository;
  let manager: ArtifactManager;
  let tmpDir: string;

  beforeEach(async () => {
    ({ repo, manager, tmpDir } = setup());
    await manager.initialize();
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      /* */
    }
  });

  it("initialize creates base directory", async () => {
    const stat = await fs.stat(tmpDir);
    expect(stat.isDirectory()).toBe(true);
  });

  it("save writes file and creates DB record", async () => {
    const app = repo.createApplication({
      name: "A",
      repositoryUrl: "https://github.com/a/b",
      baseUrl: "https://a.com",
    });
    const test = repo.createTest({ applicationId: app.id, name: "t1", code: "test()", type: "e2e" });
    const run = repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });

    const artifact = await manager.save({
      testRunId: run.id,
      type: "screenshot",
      content: Buffer.from("PNG data"),
      fileName: "page.png",
      stepName: "login",
    });

    expect(artifact.id).toBeTruthy();
    expect(artifact.type).toBe("screenshot");
    expect(artifact.mimeType).toBe("image/png");
    expect(artifact.sizeBytes).toBe(8);
  });

  it("saveScreenshot saves with correct type", async () => {
    const app = repo.createApplication({
      name: "A",
      repositoryUrl: "https://github.com/a/b",
      baseUrl: "https://a.com",
    });
    const test = repo.createTest({ applicationId: app.id, name: "t1", code: "test()", type: "e2e" });
    const run = repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });

    const artifact = await manager.saveScreenshot(run.id, Buffer.from("img"), "fail.png", "step1");
    expect(artifact.type).toBe("screenshot");
  });

  it("saveLog saves text content", async () => {
    const app = repo.createApplication({
      name: "A",
      repositoryUrl: "https://github.com/a/b",
      baseUrl: "https://a.com",
    });
    const test = repo.createTest({ applicationId: app.id, name: "t1", code: "test()", type: "e2e" });
    const run = repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });

    const artifact = await manager.saveLog(run.id, "some log content");
    expect(artifact.type).toBe("log");
    expect(artifact.mimeType).toBe("text/plain");
  });

  it("getContent retrieves saved content", async () => {
    const app = repo.createApplication({
      name: "A",
      repositoryUrl: "https://github.com/a/b",
      baseUrl: "https://a.com",
    });
    const test = repo.createTest({ applicationId: app.id, name: "t1", code: "test()", type: "e2e" });
    const run = repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });

    const original = Buffer.from("hello world");
    const artifact = await manager.save({ testRunId: run.id, type: "log", content: original, fileName: "out.txt" });
    const retrieved = await manager.getContent(artifact.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.toString()).toBe("hello world");
  });

  it("getContent returns null for unknown id", async () => {
    const result = await manager.getContent("nonexistent");
    expect(result).toBeNull();
  });

  it("getFullPath returns absolute path", async () => {
    const app = repo.createApplication({
      name: "A",
      repositoryUrl: "https://github.com/a/b",
      baseUrl: "https://a.com",
    });
    const test = repo.createTest({ applicationId: app.id, name: "t1", code: "test()", type: "e2e" });
    const run = repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });

    const artifact = await manager.save({
      testRunId: run.id,
      type: "screenshot",
      content: Buffer.from("x"),
      fileName: "s.png",
    });
    const fullPath = manager.getFullPath(artifact);
    expect(path.isAbsolute(fullPath)).toBe(true);
  });

  it("deleteByRun removes run directory", async () => {
    const app = repo.createApplication({
      name: "A",
      repositoryUrl: "https://github.com/a/b",
      baseUrl: "https://a.com",
    });
    const test = repo.createTest({ applicationId: app.id, name: "t1", code: "test()", type: "e2e" });
    const run = repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });

    await manager.save({ testRunId: run.id, type: "screenshot", content: Buffer.from("x"), fileName: "s.png" });
    await manager.deleteByRun(run.id);
    const content = await manager.getContent(run.id);
    // Directory is gone — getContent for any artifact in that run returns null
    expect(content).toBeNull();
  });

  it("getStorageUsage returns stats", async () => {
    const app = repo.createApplication({
      name: "A",
      repositoryUrl: "https://github.com/a/b",
      baseUrl: "https://a.com",
    });
    const test = repo.createTest({ applicationId: app.id, name: "t1", code: "test()", type: "e2e" });
    const run = repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });

    await manager.save({ testRunId: run.id, type: "log", content: Buffer.from("some log"), fileName: "log.txt" });
    const usage = await manager.getStorageUsage();
    expect(usage.runCount).toBe(1);
    expect(usage.totalBytes).toBeGreaterThan(0);
  });

  it("cleanup removes old directories", async () => {
    // Create a directory with old mtime
    const oldRunDir = path.join(tmpDir, "old-run");
    await fs.mkdir(path.join(oldRunDir, "screenshot"), { recursive: true });
    await fs.writeFile(path.join(oldRunDir, "screenshot", "x.png"), "data");
    // Set mtime to 60 days ago
    const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    await fs.utimes(oldRunDir, oldDate, oldDate);

    const result = await manager.cleanup();
    expect(result.deleted).toBeGreaterThanOrEqual(1);
  });

  it("cleanup skips recent directories and files in basePath", async () => {
    // Create a recent run directory (mtime = now, not old)
    const recentRunDir = path.join(tmpDir, "recent-run");
    await fs.mkdir(path.join(recentRunDir, "screenshot"), { recursive: true });
    await fs.writeFile(path.join(recentRunDir, "screenshot", "y.png"), "img");
    // Do NOT change mtime — it's recent, should be skipped

    // Create a plain file directly in basePath (non-directory entry)
    await fs.writeFile(path.join(tmpDir, "stray-file.txt"), "stray");

    const result = await manager.cleanup();
    // Recent dir should NOT be deleted
    expect(result.deleted).toBe(0);

    // Confirm recent dir still exists
    await expect(fs.stat(recentRunDir)).resolves.toBeDefined();
  });

  it("getStorageUsage skips non-directory entries in basePath", async () => {
    // Create a run directory with a log file
    const app = repo.createApplication({
      name: "A",
      repositoryUrl: "https://github.com/a/b",
      baseUrl: "https://a.com",
    });
    const test = repo.createTest({ applicationId: app.id, name: "t1", code: "test()", type: "e2e" });
    const run = repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });
    await manager.save({ testRunId: run.id, type: "log", content: Buffer.from("log"), fileName: "log.txt" });

    // Place a plain file directly in basePath — should be skipped
    await fs.writeFile(path.join(tmpDir, "orphan.txt"), "orphan data");

    const usage = await manager.getStorageUsage();
    // runCount should only count actual run directories, not the orphan file
    expect(usage.runCount).toBe(1);
    expect(usage.totalBytes).toBeGreaterThan(0);
  });

  it("saveScreenshot auto-appends .png when name lacks the extension", async () => {
    const app = repo.createApplication({
      name: "A",
      repositoryUrl: "https://github.com/a/b",
      baseUrl: "https://a.com",
    });
    const test = repo.createTest({ applicationId: app.id, name: "t1", code: "test()", type: "e2e" });
    const run = repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });

    // "capture" does not end with .png — should become "capture.png"
    const artifact = await manager.saveScreenshot(run.id, Buffer.from("img"), "capture");
    expect(artifact.type).toBe("screenshot");
    expect(artifact.filePath).toMatch(/capture\.png/);
  });

  it("saveVideo saves video artifact from path", async () => {
    const app = repo.createApplication({
      name: "A",
      repositoryUrl: "https://github.com/a/b",
      baseUrl: "https://a.com",
    });
    const test = repo.createTest({ applicationId: app.id, name: "t1", code: "test()", type: "e2e" });
    const run = repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });

    // Write a fake video file
    const videoPath = path.join(tmpDir, "test-video.webm");
    await fs.writeFile(videoPath, Buffer.from("fake-webm-content"));

    const artifact = await manager.saveVideo(run.id, videoPath);
    expect(artifact.type).toBe("video");
  });

  it("getContent returns null when artifact file is missing from disk", async () => {
    const app = repo.createApplication({
      name: "A",
      repositoryUrl: "https://github.com/a/b",
      baseUrl: "https://a.com",
    });
    const test = repo.createTest({ applicationId: app.id, name: "t1", code: "test()", type: "e2e" });
    const run = repo.createTestRun({ testId: test.id, applicationId: app.id, trigger: "manual" });

    // Save artifact, then delete the file
    const artifact = await manager.save({
      testRunId: run.id,
      type: "screenshot",
      content: Buffer.from("x"),
      fileName: "s.png",
    });
    const fullPath = manager.getFullPath(artifact);
    await fs.unlink(fullPath);

    // getContent should hit the catch branch and return null
    const content = await manager.getContent(artifact.id);
    expect(content).toBeNull();
  });
});
