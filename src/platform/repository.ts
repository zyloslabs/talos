/**
 * PlatformRepository — SQLite data access for Talos platform features.
 *
 * Tables: personality, saved_prompts, scheduled_jobs, agent_tasks, mcp_servers, skills, agents, agent_skills
 */

import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type {
  Personality,
  StoredPersonality,
  SavedPrompt,
  StoredPrompt,
  CreatePromptInput,
  UpdatePromptInput,
  ScheduledJob,
  StoredJob,
  CreateJobInput,
  UpdateJobInput,
  AgentTask,
  StoredTask,
  CreateTaskInput,
  TaskStatus,
  McpServerConfig,
  StoredMcpServer,
  CreateMcpServerInput,
  UpdateMcpServerInput,
  Skill,
  StoredSkill,
  CreateSkillInput,
  UpdateSkillInput,
  Agent,
  StoredAgent,
  CreateAgentInput,
  UpdateAgentInput,
} from "./types.js";

// ── Row Converters ────────────────────────────────────────────────────────────

const toPersonality = (row: StoredPersonality): Personality => ({
  id: row.id,
  name: row.name,
  systemPrompt: row.system_prompt,
  isActive: row.is_active === 1,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toPrompt = (row: StoredPrompt): SavedPrompt => ({
  id: row.id,
  name: row.name,
  description: row.description,
  content: row.content,
  category: row.category,
  tags: JSON.parse(row.tags_json) as string[],
  stages: row.stages_json ? (JSON.parse(row.stages_json) as SavedPrompt["stages"]) : null,
  preferredTools: JSON.parse(row.preferred_tools_json) as string[],
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toJob = (row: StoredJob): ScheduledJob => ({
  id: row.id,
  name: row.name,
  description: row.description,
  cronExpression: row.cron_expression,
  prompt: row.prompt,
  enabled: row.enabled === 1,
  orchestrationMode: (row.orchestration_mode as ScheduledJob["orchestrationMode"]) ?? "task",
  lastRunAt: row.last_run_at,
  nextRunAt: row.next_run_at,
  runCount: row.run_count,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toTask = (row: StoredTask): AgentTask => ({
  id: row.id,
  prompt: row.prompt,
  status: row.status as TaskStatus,
  result: row.result,
  error: row.error,
  parentId: row.parent_id,
  depth: row.depth,
  createdAt: row.created_at,
  startedAt: row.started_at,
  completedAt: row.completed_at,
});

const toMcpServer = (row: StoredMcpServer): McpServerConfig => ({
  id: row.id,
  name: row.name,
  type: row.type as McpServerConfig["type"],
  command: row.command ?? undefined,
  args: JSON.parse(row.args_json) as string[],
  url: row.url ?? undefined,
  env: JSON.parse(row.env_json) as Record<string, string>,
  enabled: row.enabled === 1,
  tools: JSON.parse(row.tools_json) as string[],
  category: row.category ?? undefined,
  tags: JSON.parse(row.tags_json ?? "[]") as string[],
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toSkill = (row: StoredSkill): Skill => ({
  id: row.id,
  name: row.name,
  description: row.description,
  content: row.content,
  enabled: row.enabled === 1,
  tags: JSON.parse(row.tags_json) as string[],
  requiredTools: JSON.parse(row.required_tools_json ?? "[]") as string[],
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toAgent = (row: StoredAgent): Agent => ({
  id: row.id,
  name: row.name,
  description: row.description,
  systemPrompt: row.system_prompt,
  toolsWhitelist: JSON.parse(row.tools_whitelist_json) as string[],
  parentAgentId: row.parent_agent_id,
  enabled: row.enabled === 1,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// ── Repository ────────────────────────────────────────────────────────────────

export class PlatformRepository {
  constructor(private db: Database.Database) {}

  /** Create all platform tables if they don't exist. */
  migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS personality (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        system_prompt TEXT NOT NULL DEFAULT '',
        is_active INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS saved_prompts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'general',
        tags_json TEXT NOT NULL DEFAULT '[]',
        stages_json TEXT,
        preferred_tools_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS scheduled_jobs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        cron_expression TEXT NOT NULL,
        prompt TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        last_run_at TEXT,
        next_run_at TEXT,
        run_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS agent_tasks (
        id TEXT PRIMARY KEY,
        prompt TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        result TEXT,
        error TEXT,
        parent_id TEXT,
        depth INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        started_at TEXT,
        completed_at TEXT
      );

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
        category TEXT,
        tags_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS skills (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        tags_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL DEFAULT '',
        system_prompt TEXT NOT NULL DEFAULT '',
        tools_whitelist_json TEXT NOT NULL DEFAULT '[]',
        parent_agent_id TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (parent_agent_id) REFERENCES agents(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS agent_skills (
        agent_id TEXT NOT NULL,
        skill_id TEXT NOT NULL,
        PRIMARY KEY (agent_id, skill_id),
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
        FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
      );

      -- Performance indexes
      CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON agent_tasks(status);
      CREATE INDEX IF NOT EXISTS idx_saved_prompts_category ON saved_prompts(category);
      CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_enabled ON scheduled_jobs(enabled);
      -- Knowledge Base tables (#214)
      CREATE TABLE IF NOT EXISTS knowledge_documents (
        id TEXT PRIMARY KEY,
        application_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'code',
        chunk_count INTEGER NOT NULL DEFAULT 0,
        indexed_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS knowledge_config (
        id TEXT PRIMARY KEY DEFAULT 'default',
        vector_db_path TEXT NOT NULL DEFAULT '~/.talos/vectordb',
        collection_name TEXT NOT NULL DEFAULT 'talos_chunks',
        search_mode TEXT NOT NULL DEFAULT 'hybrid',
        min_score REAL NOT NULL DEFAULT 0.5
      );

      CREATE INDEX IF NOT EXISTS idx_knowledge_documents_app ON knowledge_documents(application_id);
      CREATE INDEX IF NOT EXISTS idx_agents_enabled ON agents(enabled);
      CREATE INDEX IF NOT EXISTS idx_agents_parent ON agents(parent_agent_id);
    `);

    // Add required_tools_json column to skills if missing (v2 migration)
    const skillCols = this.db.pragma("table_info(skills)") as { name: string }[];
    if (!skillCols.some((c) => c.name === "required_tools_json")) {
      this.db.exec("ALTER TABLE skills ADD COLUMN required_tools_json TEXT NOT NULL DEFAULT '[]'");
    }

    // Add category and tags_json columns to mcp_servers if missing (v3 migration)
    const mcpCols = this.db.pragma("table_info(mcp_servers)") as { name: string }[];
    if (!mcpCols.some((c) => c.name === "category")) {
      this.db.exec("ALTER TABLE mcp_servers ADD COLUMN category TEXT");
    }
    if (!mcpCols.some((c) => c.name === "tags_json")) {
      this.db.exec("ALTER TABLE mcp_servers ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]'");
    }

    // Add orchestration_mode column to scheduled_jobs if missing (v4 migration)
    const jobCols = this.db.pragma("table_info(scheduled_jobs)") as { name: string }[];
    if (!jobCols.some((c) => c.name === "orchestration_mode")) {
      this.db.exec("ALTER TABLE scheduled_jobs ADD COLUMN orchestration_mode TEXT NOT NULL DEFAULT 'task'");
    }

    // Seed default personality if none exists
    const count = this.db.prepare("SELECT COUNT(*) as c FROM personality").get() as { c: number };
    if (count.c === 0) {
      this.db
        .prepare(
          `
        INSERT INTO personality (id, name, system_prompt, is_active)
        VALUES (?, ?, ?, 1)
      `
        )
        .run(randomUUID(), "Default", "You are Talos, an autonomous test automation assistant.");
    }
  }

  // ── Personality ──

  getActivePersonality(): Personality | null {
    const row = this.db.prepare("SELECT * FROM personality WHERE is_active = 1 LIMIT 1").get() as
      | StoredPersonality
      | undefined;
    return row ? toPersonality(row) : null;
  }

  listPersonalities(): Personality[] {
    return (this.db.prepare("SELECT * FROM personality ORDER BY created_at DESC").all() as StoredPersonality[]).map(
      toPersonality
    );
  }

  updatePersonality(id: string, prompt: string): Personality | null {
    const now = new Date().toISOString();
    this.db.prepare("UPDATE personality SET system_prompt = ?, updated_at = ? WHERE id = ?").run(prompt, now, id);
    const row = this.db.prepare("SELECT * FROM personality WHERE id = ?").get(id) as StoredPersonality | undefined;
    return row ? toPersonality(row) : null;
  }

  setActivePersonality(id: string): void {
    this.db.prepare("UPDATE personality SET is_active = 0").run();
    this.db.prepare("UPDATE personality SET is_active = 1 WHERE id = ?").run(id);
  }

  createPersonality(name: string, systemPrompt: string): Personality {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `
      INSERT INTO personality (id, name, system_prompt, is_active, created_at, updated_at)
      VALUES (?, ?, ?, 0, ?, ?)
    `
      )
      .run(id, name, systemPrompt, now, now);
    return toPersonality(this.db.prepare("SELECT * FROM personality WHERE id = ?").get(id) as StoredPersonality);
  }

  // ── Saved Prompts ──

  listPrompts(category?: string): SavedPrompt[] {
    if (category) {
      return (
        this.db
          .prepare("SELECT * FROM saved_prompts WHERE category = ? ORDER BY updated_at DESC")
          .all(category) as StoredPrompt[]
      ).map(toPrompt);
    }
    return (this.db.prepare("SELECT * FROM saved_prompts ORDER BY updated_at DESC").all() as StoredPrompt[]).map(
      toPrompt
    );
  }

  getPrompt(id: string): SavedPrompt | null {
    const row = this.db.prepare("SELECT * FROM saved_prompts WHERE id = ?").get(id) as StoredPrompt | undefined;
    return row ? toPrompt(row) : null;
  }

  createPrompt(input: CreatePromptInput): SavedPrompt {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `
      INSERT INTO saved_prompts (id, name, description, content, category, tags_json, stages_json, preferred_tools_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        id,
        input.name,
        input.description ?? "",
        input.content,
        input.category ?? "general",
        JSON.stringify(input.tags ?? []),
        input.stages ? JSON.stringify(input.stages) : null,
        JSON.stringify(input.preferredTools ?? []),
        now,
        now
      );
    return toPrompt(this.db.prepare("SELECT * FROM saved_prompts WHERE id = ?").get(id) as StoredPrompt);
  }

  updatePrompt(id: string, input: UpdatePromptInput): SavedPrompt | null {
    const existing = this.db.prepare("SELECT * FROM saved_prompts WHERE id = ?").get(id) as StoredPrompt | undefined;
    if (!existing) return null;
    const now = new Date().toISOString();
    this.db
      .prepare(
        `
      UPDATE saved_prompts SET
        name = ?, description = ?, content = ?, category = ?,
        tags_json = ?, stages_json = ?, preferred_tools_json = ?, updated_at = ?
      WHERE id = ?
    `
      )
      .run(
        input.name ?? existing.name,
        input.description ?? existing.description,
        input.content ?? existing.content,
        input.category ?? existing.category,
        input.tags ? JSON.stringify(input.tags) : existing.tags_json,
        input.stages !== undefined ? (input.stages ? JSON.stringify(input.stages) : null) : existing.stages_json,
        input.preferredTools ? JSON.stringify(input.preferredTools) : existing.preferred_tools_json,
        now,
        id
      );
    return toPrompt(this.db.prepare("SELECT * FROM saved_prompts WHERE id = ?").get(id) as StoredPrompt);
  }

  deletePrompt(id: string): boolean {
    const result = this.db.prepare("DELETE FROM saved_prompts WHERE id = ?").run(id);
    return result.changes > 0;
  }

  // ── Scheduled Jobs ──

  listJobs(): ScheduledJob[] {
    return (this.db.prepare("SELECT * FROM scheduled_jobs ORDER BY created_at DESC").all() as StoredJob[]).map(toJob);
  }

  getJob(id: string): ScheduledJob | null {
    const row = this.db.prepare("SELECT * FROM scheduled_jobs WHERE id = ?").get(id) as StoredJob | undefined;
    return row ? toJob(row) : null;
  }

  createJob(input: CreateJobInput): ScheduledJob {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `
      INSERT INTO scheduled_jobs (id, name, description, cron_expression, prompt, enabled, orchestration_mode, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        id,
        input.name,
        input.description ?? "",
        input.cronExpression,
        input.prompt,
        input.enabled !== false ? 1 : 0,
        input.orchestrationMode ?? "task",
        now,
        now
      );
    return toJob(this.db.prepare("SELECT * FROM scheduled_jobs WHERE id = ?").get(id) as StoredJob);
  }

  updateJob(id: string, input: UpdateJobInput): ScheduledJob | null {
    const existing = this.db.prepare("SELECT * FROM scheduled_jobs WHERE id = ?").get(id) as StoredJob | undefined;
    if (!existing) return null;
    const now = new Date().toISOString();
    this.db
      .prepare(
        `
      UPDATE scheduled_jobs SET
        name = ?, description = ?, cron_expression = ?, prompt = ?, enabled = ?, orchestration_mode = ?, updated_at = ?
      WHERE id = ?
    `
      )
      .run(
        input.name ?? existing.name,
        input.description ?? existing.description,
        input.cronExpression ?? existing.cron_expression,
        input.prompt ?? existing.prompt,
        input.enabled !== undefined ? (input.enabled ? 1 : 0) : existing.enabled,
        input.orchestrationMode ?? existing.orchestration_mode,
        now,
        id
      );
    return toJob(this.db.prepare("SELECT * FROM scheduled_jobs WHERE id = ?").get(id) as StoredJob);
  }

  deleteJob(id: string): boolean {
    const result = this.db.prepare("DELETE FROM scheduled_jobs WHERE id = ?").run(id);
    return result.changes > 0;
  }

  updateJobRunInfo(id: string, lastRunAt: string, nextRunAt: string | null): void {
    this.db
      .prepare(
        `
      UPDATE scheduled_jobs SET last_run_at = ?, next_run_at = ?, run_count = run_count + 1, updated_at = datetime('now') WHERE id = ?
    `
      )
      .run(lastRunAt, nextRunAt, id);
  }

  getEnabledJobs(): ScheduledJob[] {
    return (this.db.prepare("SELECT * FROM scheduled_jobs WHERE enabled = 1").all() as StoredJob[]).map(toJob);
  }

  // ── Agent Tasks ──

  listTasks(status?: TaskStatus, limit = 100): AgentTask[] {
    if (status) {
      return (
        this.db
          .prepare("SELECT * FROM agent_tasks WHERE status = ? ORDER BY created_at DESC LIMIT ?")
          .all(status, limit) as StoredTask[]
      ).map(toTask);
    }
    return (
      this.db.prepare("SELECT * FROM agent_tasks ORDER BY created_at DESC LIMIT ?").all(limit) as StoredTask[]
    ).map(toTask);
  }

  getTask(id: string): AgentTask | null {
    const row = this.db.prepare("SELECT * FROM agent_tasks WHERE id = ?").get(id) as StoredTask | undefined;
    return row ? toTask(row) : null;
  }

  createTask(input: CreateTaskInput): AgentTask {
    const id = randomUUID();
    const now = new Date().toISOString();
    let depth = 0;
    if (input.parentId) {
      const parent = this.db.prepare("SELECT depth FROM agent_tasks WHERE id = ?").get(input.parentId) as
        | { depth: number }
        | undefined;
      depth = parent ? parent.depth + 1 : 0;
    }
    this.db
      .prepare(
        `
      INSERT INTO agent_tasks (id, prompt, status, parent_id, depth, created_at)
      VALUES (?, ?, 'pending', ?, ?, ?)
    `
      )
      .run(id, input.prompt, input.parentId ?? null, depth, now);
    return toTask(this.db.prepare("SELECT * FROM agent_tasks WHERE id = ?").get(id) as StoredTask);
  }

  updateTaskStatus(id: string, status: TaskStatus, result?: string, error?: string): AgentTask | null {
    const now = new Date().toISOString();
    const updates: string[] = ["status = ?"];
    const params: unknown[] = [status];

    if (status === "running") {
      updates.push("started_at = ?");
      params.push(now);
    }
    if (status === "completed" || status === "failed" || status === "cancelled") {
      updates.push("completed_at = ?");
      params.push(now);
    }
    if (result !== undefined) {
      updates.push("result = ?");
      params.push(result);
    }
    if (error !== undefined) {
      updates.push("error = ?");
      params.push(error);
    }
    params.push(id);

    this.db.prepare(`UPDATE agent_tasks SET ${updates.join(", ")} WHERE id = ?`).run(...params);
    return this.getTask(id);
  }

  getTaskStats(): { pending: number; running: number; completed: number; failed: number } {
    const rows = this.db
      .prepare(
        `
      SELECT status, COUNT(*) as count FROM agent_tasks GROUP BY status
    `
      )
      .all() as { status: string; count: number }[];
    const stats = { pending: 0, running: 0, completed: 0, failed: 0 };
    for (const row of rows) {
      if (row.status in stats) {
        stats[row.status as keyof typeof stats] = row.count;
      }
    }
    return stats;
  }

  // ── MCP Servers ──

  listMcpServers(): McpServerConfig[] {
    return (this.db.prepare("SELECT * FROM mcp_servers ORDER BY name").all() as StoredMcpServer[]).map(toMcpServer);
  }

  getMcpServer(id: string): McpServerConfig | null {
    const row = this.db.prepare("SELECT * FROM mcp_servers WHERE id = ?").get(id) as StoredMcpServer | undefined;
    return row ? toMcpServer(row) : null;
  }

  createMcpServer(input: CreateMcpServerInput): McpServerConfig {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `
      INSERT INTO mcp_servers (id, name, type, command, args_json, url, env_json, enabled, category, tags_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        id,
        input.name,
        input.type,
        input.command ?? null,
        JSON.stringify(input.args ?? []),
        input.url ?? null,
        JSON.stringify(input.env ?? {}),
        input.enabled !== false ? 1 : 0,
        input.category ?? null,
        JSON.stringify(input.tags ?? []),
        now,
        now
      );
    return toMcpServer(this.db.prepare("SELECT * FROM mcp_servers WHERE id = ?").get(id) as StoredMcpServer);
  }

  updateMcpServer(id: string, input: UpdateMcpServerInput): McpServerConfig | null {
    const existing = this.db.prepare("SELECT * FROM mcp_servers WHERE id = ?").get(id) as StoredMcpServer | undefined;
    if (!existing) return null;
    const now = new Date().toISOString();
    this.db
      .prepare(
        `
      UPDATE mcp_servers SET
        name = ?, type = ?, command = ?, args_json = ?, url = ?, env_json = ?, enabled = ?, category = ?, tags_json = ?, updated_at = ?
      WHERE id = ?
    `
      )
      .run(
        input.name ?? existing.name,
        input.type ?? existing.type,
        input.command !== undefined ? (input.command ?? null) : existing.command,
        input.args ? JSON.stringify(input.args) : existing.args_json,
        input.url !== undefined ? (input.url ?? null) : existing.url,
        input.env ? JSON.stringify(input.env) : existing.env_json,
        input.enabled !== undefined ? (input.enabled ? 1 : 0) : existing.enabled,
        input.category !== undefined ? (input.category ?? null) : (existing.category ?? null),
        input.tags ? JSON.stringify(input.tags) : (existing.tags_json ?? "[]"),
        now,
        id
      );
    return toMcpServer(this.db.prepare("SELECT * FROM mcp_servers WHERE id = ?").get(id) as StoredMcpServer);
  }

  deleteMcpServer(id: string): boolean {
    const result = this.db.prepare("DELETE FROM mcp_servers WHERE id = ?").run(id);
    return result.changes > 0;
  }

  // ── Skills ──

  listSkills(): Skill[] {
    return (this.db.prepare("SELECT * FROM skills ORDER BY name").all() as StoredSkill[]).map(toSkill);
  }

  getSkill(id: string): Skill | null {
    const row = this.db.prepare("SELECT * FROM skills WHERE id = ?").get(id) as StoredSkill | undefined;
    return row ? toSkill(row) : null;
  }

  createSkill(input: CreateSkillInput): Skill {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `
      INSERT INTO skills (id, name, description, content, enabled, tags_json, required_tools_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        id,
        input.name,
        input.description ?? "",
        input.content,
        input.enabled !== false ? 1 : 0,
        JSON.stringify(input.tags ?? []),
        JSON.stringify(input.requiredTools ?? []),
        now,
        now
      );
    return toSkill(this.db.prepare("SELECT * FROM skills WHERE id = ?").get(id) as StoredSkill);
  }

  updateSkill(id: string, input: UpdateSkillInput): Skill | null {
    const existing = this.db.prepare("SELECT * FROM skills WHERE id = ?").get(id) as StoredSkill | undefined;
    if (!existing) return null;
    const now = new Date().toISOString();
    this.db
      .prepare(
        `
      UPDATE skills SET name = ?, description = ?, content = ?, enabled = ?, tags_json = ?, required_tools_json = ?, updated_at = ? WHERE id = ?
    `
      )
      .run(
        input.name ?? existing.name,
        input.description ?? existing.description,
        input.content ?? existing.content,
        input.enabled !== undefined ? (input.enabled ? 1 : 0) : existing.enabled,
        input.tags ? JSON.stringify(input.tags) : existing.tags_json,
        input.requiredTools ? JSON.stringify(input.requiredTools) : existing.required_tools_json,
        now,
        id
      );
    return toSkill(this.db.prepare("SELECT * FROM skills WHERE id = ?").get(id) as StoredSkill);
  }

  deleteSkill(id: string): boolean {
    const result = this.db.prepare("DELETE FROM skills WHERE id = ?").run(id);
    return result.changes > 0;
  }

  // ── Knowledge Base ──

  getKnowledgeStats(): { documentCount: number; chunkCount: number; lastIndexedAt: string | null } {
    const docCount =
      (this.db.prepare("SELECT COUNT(*) as count FROM knowledge_documents").get() as { count: number })?.count ?? 0;
    const chunkCount =
      (this.db.prepare("SELECT SUM(chunk_count) as total FROM knowledge_documents").get() as { total: number | null })
        ?.total ?? 0;
    const lastRow = this.db.prepare("SELECT MAX(indexed_at) as last FROM knowledge_documents").get() as
      | { last: string | null }
      | undefined;
    return { documentCount: docCount, chunkCount, lastIndexedAt: lastRow?.last ?? null };
  }

  listKnowledgeDocuments(): {
    id: string;
    applicationId: string;
    filePath: string;
    type: string;
    chunkCount: number;
    indexedAt: string;
  }[] {
    return this.db.prepare("SELECT * FROM knowledge_documents ORDER BY indexed_at DESC").all() as {
      id: string;
      applicationId: string;
      filePath: string;
      type: string;
      chunkCount: number;
      indexedAt: string;
    }[];
  }

  deleteKnowledgeDocument(id: string): boolean {
    const result = this.db.prepare("DELETE FROM knowledge_documents WHERE id = ?").run(id);
    return result.changes > 0;
  }

  getKnowledgeConfig(): { vectorDbPath: string; collectionName: string; searchMode: string; minScore: number } {
    const row = this.db.prepare("SELECT * FROM knowledge_config WHERE id = 'default'").get() as
      | { vector_db_path: string; collection_name: string; search_mode: string; min_score: number }
      | undefined;
    return row
      ? {
          vectorDbPath: row.vector_db_path,
          collectionName: row.collection_name,
          searchMode: row.search_mode,
          minScore: row.min_score,
        }
      : {
          vectorDbPath: "~/.talos/vectordb",
          collectionName: "talos_chunks",
          searchMode: "hybrid",
          minScore: 0.5,
        };
  }

  updateKnowledgeConfig(config: Record<string, unknown>): {
    vectorDbPath: string;
    collectionName: string;
    searchMode: string;
    minScore: number;
  } {
    const current = this.getKnowledgeConfig();
    const updated = {
      vectorDbPath: (config.vectorDbPath as string) ?? current.vectorDbPath,
      collectionName: (config.collectionName as string) ?? current.collectionName,
      searchMode: (config.searchMode as string) ?? current.searchMode,
      minScore: (config.minScore as number) ?? current.minScore,
    };
    this.db
      .prepare(
        `
      INSERT OR REPLACE INTO knowledge_config (id, vector_db_path, collection_name, search_mode, min_score)
      VALUES ('default', ?, ?, ?, ?)
    `
      )
      .run(updated.vectorDbPath, updated.collectionName, updated.searchMode, updated.minScore);
    return updated;
  }

  getSkillAgents(skillId: string): Agent[] {
    return (
      this.db
        .prepare(
          `
      SELECT a.* FROM agents a
      JOIN agent_skills ags ON ags.agent_id = a.id
      WHERE ags.skill_id = ?
      ORDER BY a.name
    `
        )
        .all(skillId) as StoredAgent[]
    ).map(toAgent);
  }

  // ── Agents ──

  listAgents(): Agent[] {
    return (this.db.prepare("SELECT * FROM agents ORDER BY name").all() as StoredAgent[]).map(toAgent);
  }

  getAgent(id: string): Agent | null {
    const row = this.db.prepare("SELECT * FROM agents WHERE id = ?").get(id) as StoredAgent | undefined;
    return row ? toAgent(row) : null;
  }

  createAgent(input: CreateAgentInput): Agent {
    const id = randomUUID();
    const now = new Date().toISOString();
    try {
      this.db
        .prepare(
          `
        INSERT INTO agents (id, name, description, system_prompt, tools_whitelist_json, parent_agent_id, enabled, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
        )
        .run(
          id,
          input.name,
          input.description ?? "",
          input.systemPrompt ?? "",
          JSON.stringify(input.toolsWhitelist ?? []),
          input.parentAgentId ?? null,
          input.enabled !== false ? 1 : 0,
          now,
          now
        );
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("UNIQUE constraint failed")) {
        const dupErr = new Error(`Agent with name '${input.name}' already exists`);
        (dupErr as Error & { code: string }).code = "DUPLICATE_NAME";
        throw dupErr;
      }
      throw err;
    }
    return toAgent(this.db.prepare("SELECT * FROM agents WHERE id = ?").get(id) as StoredAgent);
  }

  updateAgent(id: string, input: UpdateAgentInput): Agent | null {
    const existing = this.db.prepare("SELECT * FROM agents WHERE id = ?").get(id) as StoredAgent | undefined;
    if (!existing) return null;
    const now = new Date().toISOString();
    this.db
      .prepare(
        `
      UPDATE agents SET
        name = ?, description = ?, system_prompt = ?, tools_whitelist_json = ?,
        parent_agent_id = ?, enabled = ?, updated_at = ?
      WHERE id = ?
    `
      )
      .run(
        input.name ?? existing.name,
        input.description ?? existing.description,
        input.systemPrompt ?? existing.system_prompt,
        input.toolsWhitelist ? JSON.stringify(input.toolsWhitelist) : existing.tools_whitelist_json,
        input.parentAgentId !== undefined ? (input.parentAgentId ?? null) : existing.parent_agent_id,
        input.enabled !== undefined ? (input.enabled ? 1 : 0) : existing.enabled,
        now,
        id
      );
    return toAgent(this.db.prepare("SELECT * FROM agents WHERE id = ?").get(id) as StoredAgent);
  }

  deleteAgent(id: string): boolean {
    const result = this.db.prepare("DELETE FROM agents WHERE id = ?").run(id);
    return result.changes > 0;
  }

  getAgentSkills(agentId: string): Skill[] {
    return (
      this.db
        .prepare(
          `
      SELECT s.* FROM skills s
      JOIN agent_skills ags ON ags.skill_id = s.id
      WHERE ags.agent_id = ?
      ORDER BY s.name
    `
        )
        .all(agentId) as StoredSkill[]
    ).map(toSkill);
  }

  setAgentSkills(agentId: string, skillIds: string[]): void {
    const deleteAll = this.db.prepare("DELETE FROM agent_skills WHERE agent_id = ?");
    const insertOne = this.db.prepare("INSERT INTO agent_skills (agent_id, skill_id) VALUES (?, ?)");
    const tx = this.db.transaction(() => {
      deleteAll.run(agentId);
      for (const skillId of skillIds) {
        insertOne.run(agentId, skillId);
      }
    });
    tx();
  }
}
