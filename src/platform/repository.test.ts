/**
 * PlatformRepository unit tests.
 */

import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { PlatformRepository } from "./repository.js";

function createTestRepo() {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const repo = new PlatformRepository(db);
  repo.migrate();
  return { db, repo };
}

describe("PlatformRepository", () => {
  let repo: PlatformRepository;

  beforeEach(() => {
    ({ repo } = createTestRepo());
  });

  // ── Personality ──

  describe("personality", () => {
    it("seeds default personality on migrate", () => {
      const p = repo.getActivePersonality();
      expect(p).not.toBeNull();
      expect(p!.name).toBe("Default");
      expect(p!.isActive).toBe(true);
    });

    it("creates and lists personalities", () => {
      const p = repo.createPersonality("Snarky", "You are snarky.");
      expect(p.name).toBe("Snarky");
      expect(p.isActive).toBe(false);
      const all = repo.listPersonalities();
      expect(all.length).toBe(2);
    });

    it("updates personality prompt", () => {
      const active = repo.getActivePersonality()!;
      const updated = repo.updatePersonality(active.id, "New prompt");
      expect(updated!.systemPrompt).toBe("New prompt");
    });

    it("switches active personality", () => {
      const p = repo.createPersonality("Alt", "Alt prompt");
      repo.setActivePersonality(p.id);
      const active = repo.getActivePersonality();
      expect(active!.id).toBe(p.id);
    });
  });

  // ── Saved Prompts ──

  describe("saved prompts", () => {
    it("creates, reads, updates, deletes prompts", () => {
      const prompt = repo.createPrompt({ name: "Test Prompt", content: "Do something", category: "testing", tags: ["e2e"] });
      expect(prompt.name).toBe("Test Prompt");
      expect(prompt.category).toBe("testing");
      expect(prompt.tags).toEqual(["e2e"]);

      const fetched = repo.getPrompt(prompt.id);
      expect(fetched).not.toBeNull();

      const updated = repo.updatePrompt(prompt.id, { name: "Updated" });
      expect(updated!.name).toBe("Updated");

      expect(repo.deletePrompt(prompt.id)).toBe(true);
      expect(repo.getPrompt(prompt.id)).toBeNull();
    });

    it("lists prompts by category", () => {
      repo.createPrompt({ name: "A", content: "a", category: "cat1" });
      repo.createPrompt({ name: "B", content: "b", category: "cat2" });
      expect(repo.listPrompts("cat1").length).toBe(1);
      expect(repo.listPrompts().length).toBe(2);
    });

    it("handles stages and preferred tools", () => {
      const prompt = repo.createPrompt({
        name: "Pipeline",
        content: "multi-step",
        stages: [{ name: "Step 1", prompt: "Do step 1" }],
        preferredTools: ["shell-execute"],
      });
      expect(prompt.stages).toEqual([{ name: "Step 1", prompt: "Do step 1" }]);
      expect(prompt.preferredTools).toEqual(["shell-execute"]);
    });
  });

  // ── Scheduled Jobs ──

  describe("scheduled jobs", () => {
    it("creates, reads, updates, deletes jobs", () => {
      const job = repo.createJob({ name: "Daily Test", cronExpression: "0 0 * * *", prompt: "Run tests" });
      expect(job.name).toBe("Daily Test");
      expect(job.enabled).toBe(true);
      expect(job.runCount).toBe(0);

      const updated = repo.updateJob(job.id, { enabled: false });
      expect(updated!.enabled).toBe(false);

      expect(repo.deleteJob(job.id)).toBe(true);
      expect(repo.getJob(job.id)).toBeNull();
    });

    it("updates run info", () => {
      const job = repo.createJob({ name: "J", cronExpression: "* * * * *", prompt: "p" });
      repo.updateJobRunInfo(job.id, "2026-01-01T00:00:00Z", "2026-01-01T00:01:00Z");
      const updated = repo.getJob(job.id)!;
      expect(updated.runCount).toBe(1);
      expect(updated.lastRunAt).toBe("2026-01-01T00:00:00Z");
    });

    it("lists enabled jobs", () => {
      repo.createJob({ name: "A", cronExpression: "* * * * *", prompt: "a", enabled: true });
      repo.createJob({ name: "B", cronExpression: "* * * * *", prompt: "b", enabled: false });
      expect(repo.getEnabledJobs().length).toBe(1);
    });
  });

  // ── Agent Tasks ──

  describe("agent tasks", () => {
    it("creates, reads, updates tasks", () => {
      const task = repo.createTask({ prompt: "Generate tests" });
      expect(task.status).toBe("pending");
      expect(task.depth).toBe(0);

      const running = repo.updateTaskStatus(task.id, "running");
      expect(running!.status).toBe("running");
      expect(running!.startedAt).not.toBeNull();

      const completed = repo.updateTaskStatus(task.id, "completed", "Done");
      expect(completed!.status).toBe("completed");
      expect(completed!.result).toBe("Done");
    });

    it("tracks parent-child depth", () => {
      const parent = repo.createTask({ prompt: "Parent" });
      const child = repo.createTask({ prompt: "Child", parentId: parent.id });
      expect(child.depth).toBe(1);
      expect(child.parentId).toBe(parent.id);
    });

    it("gets task stats", () => {
      repo.createTask({ prompt: "a" });
      repo.createTask({ prompt: "b" });
      const t = repo.createTask({ prompt: "c" });
      repo.updateTaskStatus(t.id, "completed", "done");
      const stats = repo.getTaskStats();
      expect(stats.pending).toBe(2);
      expect(stats.completed).toBe(1);
    });

    it("lists tasks with filter", () => {
      repo.createTask({ prompt: "a" });
      const t = repo.createTask({ prompt: "b" });
      repo.updateTaskStatus(t.id, "running");
      expect(repo.listTasks("running").length).toBe(1);
      expect(repo.listTasks().length).toBe(2);
    });
  });

  // ── MCP Servers ──

  describe("mcp servers", () => {
    it("creates, reads, updates, deletes servers", () => {
      const server = repo.createMcpServer({ name: "GitHub", type: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-github"] });
      expect(server.name).toBe("GitHub");
      expect(server.type).toBe("stdio");
      expect(server.args).toEqual(["-y", "@modelcontextprotocol/server-github"]);

      const updated = repo.updateMcpServer(server.id, { enabled: false });
      expect(updated!.enabled).toBe(false);

      expect(repo.deleteMcpServer(server.id)).toBe(true);
      expect(repo.getMcpServer(server.id)).toBeNull();
    });

    it("lists all servers", () => {
      repo.createMcpServer({ name: "A", type: "stdio" });
      repo.createMcpServer({ name: "B", type: "http", url: "http://localhost:3002" });
      expect(repo.listMcpServers().length).toBe(2);
    });
  });

  // ── Skills ──

  describe("skills", () => {
    it("creates, reads, updates, deletes skills", () => {
      const skill = repo.createSkill({ name: "Code Review", content: "# Code Review\nReview code.", tags: ["review"] });
      expect(skill.name).toBe("Code Review");
      expect(skill.enabled).toBe(true);
      expect(skill.tags).toEqual(["review"]);

      const updated = repo.updateSkill(skill.id, { description: "Review code quality" });
      expect(updated!.description).toBe("Review code quality");

      expect(repo.deleteSkill(skill.id)).toBe(true);
      expect(repo.getSkill(skill.id)).toBeNull();
    });

    it("lists all skills", () => {
      repo.createSkill({ name: "A", content: "a" });
      repo.createSkill({ name: "B", content: "b" });
      expect(repo.listSkills().length).toBe(2);
    });
  });
});
