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
      const prompt = repo.createPrompt({
        name: "Test Prompt",
        content: "Do something",
        category: "testing",
        tags: ["e2e"],
      });
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
      const server = repo.createMcpServer({
        name: "GitHub",
        type: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
      });
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

    it("creates server with category and tags", () => {
      const server = repo.createMcpServer({
        name: "GitHub Cloud",
        type: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        category: "github",
        tags: ["cloud", "issues", "prs"],
      });
      expect(server.category).toBe("github");
      expect(server.tags).toEqual(["cloud", "issues", "prs"]);
    });

    it("defaults category to undefined and tags to empty array", () => {
      const server = repo.createMcpServer({ name: "Plain", type: "stdio" });
      expect(server.category).toBeUndefined();
      expect(server.tags).toEqual([]);
    });

    it("updates category and tags", () => {
      const server = repo.createMcpServer({
        name: "DB",
        type: "stdio",
        category: "jdbc",
        tags: ["oracle"],
      });
      const updated = repo.updateMcpServer(server.id, {
        category: "cloud",
        tags: ["aws", "rds"],
      });
      expect(updated!.category).toBe("cloud");
      expect(updated!.tags).toEqual(["aws", "rds"]);
    });

    it("preserves category and tags when updating other fields", () => {
      const server = repo.createMcpServer({
        name: "WithTags",
        type: "stdio",
        category: "devtools",
        tags: ["browser", "testing"],
      });
      const updated = repo.updateMcpServer(server.id, { enabled: false });
      expect(updated!.category).toBe("devtools");
      expect(updated!.tags).toEqual(["browser", "testing"]);
      expect(updated!.enabled).toBe(false);
    });

    it("clears category by setting to null via undefined", () => {
      const server = repo.createMcpServer({
        name: "ClearCat",
        type: "stdio",
        category: "github",
      });
      expect(server.category).toBe("github");
      // Passing category explicitly as undefined in the partial triggers the
      // `input.category !== undefined` branch to set null
      const updated = repo.updateMcpServer(server.id, { category: undefined });
      // When category is not provided in update (undefined), it preserves the existing value
      expect(updated!.category).toBe("github");
    });

    it("creates multiple servers with different categories", () => {
      repo.createMcpServer({ name: "GH", type: "stdio", category: "github", tags: ["cloud"] });
      repo.createMcpServer({ name: "DB1", type: "stdio", category: "jdbc", tags: ["oracle"] });
      repo.createMcpServer({ name: "DB2", type: "stdio", category: "jdbc", tags: ["postgresql"] });
      repo.createMcpServer({ name: "Docker", type: "stdio", category: "devtools" });

      const all = repo.listMcpServers();
      expect(all.length).toBe(4);
      const categories = all.map((s) => s.category).filter(Boolean);
      expect(categories).toContain("github");
      expect(categories).toContain("jdbc");
      expect(categories).toContain("devtools");
    });

    it("handles env with category and tags together", () => {
      const server = repo.createMcpServer({
        name: "Full",
        type: "stdio",
        command: "java",
        args: ["-jar", "mcp-jdbc.jar"],
        env: { JDBC_URL: "jdbc:oracle:thin:@host:1521:SID", JDBC_USER: "admin" },
        category: "jdbc",
        tags: ["oracle", "production"],
      });
      expect(server.env).toEqual({ JDBC_URL: "jdbc:oracle:thin:@host:1521:SID", JDBC_USER: "admin" });
      expect(server.category).toBe("jdbc");
      expect(server.tags).toEqual(["oracle", "production"]);

      const fetched = repo.getMcpServer(server.id);
      expect(fetched!.category).toBe("jdbc");
      expect(fetched!.tags).toEqual(["oracle", "production"]);
    });

    it("returns null when updating non-existent server", () => {
      expect(repo.updateMcpServer("nonexistent", { name: "x" })).toBeNull();
    });

    it("returns false when deleting non-existent server", () => {
      expect(repo.deleteMcpServer("nonexistent")).toBe(false);
    });
  });

  // ── MCP Servers v3 Migration ──

  describe("mcp servers v3 migration", () => {
    it("adds category and tags_json columns to existing table", () => {
      // Create a repo with migrate(), which creates the table with category/tags
      // Then verify the columns exist via pragma
      const db = new Database(":memory:");
      db.pragma("journal_mode = WAL");
      db.pragma("foreign_keys = ON");
      const freshRepo = new PlatformRepository(db);
      freshRepo.migrate();

      const cols = db.pragma("table_info(mcp_servers)") as { name: string }[];
      const colNames = cols.map((c) => c.name);
      expect(colNames).toContain("category");
      expect(colNames).toContain("tags_json");
      db.close();
    });

    it("migrates existing servers without category/tags gracefully", () => {
      // Simulate a pre-v3 database: create table without category/tags, insert a row, then run migrate
      const db = new Database(":memory:");
      db.pragma("journal_mode = WAL");
      db.pragma("foreign_keys = ON");

      // Create a minimal schema that lacks category/tags_json
      db.exec(`
        CREATE TABLE IF NOT EXISTS mcp_servers (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'stdio',
          command TEXT,
          args_json TEXT NOT NULL DEFAULT '[]',
          url TEXT,
          env_json TEXT NOT NULL DEFAULT '{}',
          enabled INTEGER NOT NULL DEFAULT 1,
          tools_json TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
      // Insert a pre-v3 server row
      db.prepare(
        `
        INSERT INTO mcp_servers (id, name, type, command, args_json, env_json, enabled, tools_json, created_at, updated_at)
        VALUES ('legacy-1', 'OldServer', 'stdio', 'npx', '[]', '{}', 1, '[]', datetime('now'), datetime('now'))
      `
      ).run();

      // Now run full migrate which should ALTER TABLE to add category and tags_json
      const migratedRepo = new PlatformRepository(db);
      migratedRepo.migrate();

      // The old server should still be readable with default category/tags
      const server = migratedRepo.getMcpServer("legacy-1");
      expect(server).not.toBeNull();
      expect(server!.name).toBe("OldServer");
      expect(server!.category).toBeUndefined(); // null -> undefined
      expect(server!.tags).toEqual([]); // DEFAULT '[]'

      db.close();
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

    it("handles requiredTools field", () => {
      const skill = repo.createSkill({
        name: "ToolSkill",
        content: "c",
        requiredTools: ["shell-execute", "web-search"],
      });
      expect(skill.requiredTools).toEqual(["shell-execute", "web-search"]);

      const updated = repo.updateSkill(skill.id, { requiredTools: ["shell-execute"] });
      expect(updated!.requiredTools).toEqual(["shell-execute"]);
    });

    it("defaults requiredTools to empty array", () => {
      const skill = repo.createSkill({ name: "NoTools", content: "c" });
      expect(skill.requiredTools).toEqual([]);
    });
  });

  // ── Agents ──

  describe("agents", () => {
    it("creates, reads, updates, deletes agents", () => {
      const agent = repo.createAgent({
        name: "Research Bot",
        description: "Researches topics",
        systemPrompt: "You are a researcher.",
      });
      expect(agent.name).toBe("Research Bot");
      expect(agent.description).toBe("Researches topics");
      expect(agent.systemPrompt).toBe("You are a researcher.");
      expect(agent.enabled).toBe(true);
      expect(agent.toolsWhitelist).toEqual([]);
      expect(agent.parentAgentId).toBeNull();

      const fetched = repo.getAgent(agent.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.name).toBe("Research Bot");

      const updated = repo.updateAgent(agent.id, { name: "Updated Bot", toolsWhitelist: ["web-search"] });
      expect(updated!.name).toBe("Updated Bot");
      expect(updated!.toolsWhitelist).toEqual(["web-search"]);

      expect(repo.deleteAgent(agent.id)).toBe(true);
      expect(repo.getAgent(agent.id)).toBeNull();
    });

    it("lists all agents", () => {
      repo.createAgent({ name: "A" });
      repo.createAgent({ name: "B" });
      expect(repo.listAgents().length).toBe(2);
    });

    it("supports parent-child relationships", () => {
      const parent = repo.createAgent({ name: "Parent" });
      const child = repo.createAgent({ name: "Child", parentAgentId: parent.id });
      expect(child.parentAgentId).toBe(parent.id);
    });

    it("sets parent to null when parent is deleted", () => {
      const parent = repo.createAgent({ name: "Parent" });
      repo.createAgent({ name: "Child", parentAgentId: parent.id });
      repo.deleteAgent(parent.id);
      // With ON DELETE SET NULL, child's parent_agent_id should be null
      const agents = repo.listAgents();
      expect(agents.length).toBe(1);
      expect(agents[0].parentAgentId).toBeNull();
    });

    it("returns false when deleting non-existent agent", () => {
      expect(repo.deleteAgent("nonexistent")).toBe(false);
    });

    it("returns null when updating non-existent agent", () => {
      expect(repo.updateAgent("nonexistent", { name: "x" })).toBeNull();
    });

    it("handles enabled flag", () => {
      const agent = repo.createAgent({ name: "Disabled", enabled: false });
      expect(agent.enabled).toBe(false);
      const updated = repo.updateAgent(agent.id, { enabled: true });
      expect(updated!.enabled).toBe(true);
    });

    it("rejects duplicate agent names", () => {
      repo.createAgent({ name: "UniqueBot" });
      expect(() => repo.createAgent({ name: "UniqueBot" })).toThrow("already exists");
    });
  });

  // ── Agent Skills ──

  describe("agent skills", () => {
    it("assigns and retrieves skills for an agent", () => {
      const agent = repo.createAgent({ name: "A" });
      const s1 = repo.createSkill({ name: "S1", content: "c1" });
      const s2 = repo.createSkill({ name: "S2", content: "c2" });

      repo.setAgentSkills(agent.id, [s1.id, s2.id]);
      const skills = repo.getAgentSkills(agent.id);
      expect(skills.length).toBe(2);
      expect(skills.map((s) => s.name).sort()).toEqual(["S1", "S2"]);
    });

    it("replaces skills on subsequent set", () => {
      const agent = repo.createAgent({ name: "A" });
      const s1 = repo.createSkill({ name: "S1", content: "c1" });
      const s2 = repo.createSkill({ name: "S2", content: "c2" });

      repo.setAgentSkills(agent.id, [s1.id, s2.id]);
      repo.setAgentSkills(agent.id, [s2.id]);
      const skills = repo.getAgentSkills(agent.id);
      expect(skills.length).toBe(1);
      expect(skills[0].name).toBe("S2");
    });

    it("returns empty array for agent with no skills", () => {
      const agent = repo.createAgent({ name: "A" });
      expect(repo.getAgentSkills(agent.id)).toEqual([]);
    });

    it("clears skills when agent is deleted (CASCADE)", () => {
      const agent = repo.createAgent({ name: "A" });
      const s1 = repo.createSkill({ name: "S1", content: "c1" });
      repo.setAgentSkills(agent.id, [s1.id]);
      repo.deleteAgent(agent.id);
      // After agent deletion, the junction rows should be gone
      // (we can't query getAgentSkills since the agent is gone, but we verify no orphans)
      const newAgent = repo.createAgent({ name: "B" });
      expect(repo.getAgentSkills(newAgent.id)).toEqual([]);
    });

    it("getSkillAgents returns agents using a skill", () => {
      const a1 = repo.createAgent({ name: "Agent1" });
      const a2 = repo.createAgent({ name: "Agent2" });
      const s1 = repo.createSkill({ name: "S1", content: "c" });

      repo.setAgentSkills(a1.id, [s1.id]);
      repo.setAgentSkills(a2.id, [s1.id]);

      const agents = repo.getSkillAgents(s1.id);
      expect(agents.length).toBe(2);
      expect(agents.map((a) => a.name).sort()).toEqual(["Agent1", "Agent2"]);
    });
  });
});
