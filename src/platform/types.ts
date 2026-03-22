/**
 * Platform types for the Talos admin/platform subsystem.
 * Covers personality, prompts, scheduled jobs, tasks, MCP servers, skills, and models.
 */

// ── Personality ───────────────────────────────────────────────────────────────

export type Personality = {
  id: string;
  name: string;
  systemPrompt: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

// ── Saved Prompts ─────────────────────────────────────────────────────────────

export type SavedPrompt = {
  id: string;
  name: string;
  description: string;
  content: string;
  category: string;
  tags: string[];
  /** Optional staged pipeline definition */
  stages: PromptStage[] | null;
  /** Preferred tools for this prompt */
  preferredTools: string[];
  createdAt: string;
  updatedAt: string;
};

export type PromptStage = {
  name: string;
  prompt: string;
  tools?: string[];
};

export type CreatePromptInput = {
  name: string;
  description?: string;
  content: string;
  category?: string;
  tags?: string[];
  stages?: PromptStage[];
  preferredTools?: string[];
};

export type UpdatePromptInput = Partial<CreatePromptInput>;

// ── Scheduled Jobs ────────────────────────────────────────────────────────────

export type ScheduledJob = {
  id: string;
  name: string;
  description: string;
  cronExpression: string;
  prompt: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  runCount: number;
  createdAt: string;
  updatedAt: string;
};

export type CreateJobInput = {
  name: string;
  description?: string;
  cronExpression: string;
  prompt: string;
  enabled?: boolean;
};

export type UpdateJobInput = Partial<CreateJobInput>;

// ── Agent Tasks ───────────────────────────────────────────────────────────────

export type TaskStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export type AgentTask = {
  id: string;
  prompt: string;
  status: TaskStatus;
  result: string | null;
  error: string | null;
  parentId: string | null;
  depth: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export type CreateTaskInput = {
  prompt: string;
  parentId?: string;
};

// ── MCP Servers ───────────────────────────────────────────────────────────────

export type McpServerType = "stdio" | "http" | "sse" | "docker";

export type McpServerConfig = {
  id: string;
  name: string;
  type: McpServerType;
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  enabled: boolean;
  tools: string[];
  createdAt: string;
  updatedAt: string;
};

export type CreateMcpServerInput = {
  name: string;
  type: McpServerType;
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  enabled?: boolean;
};

export type UpdateMcpServerInput = Partial<CreateMcpServerInput>;

// ── Skills ────────────────────────────────────────────────────────────────────

export type Skill = {
  id: string;
  name: string;
  description: string;
  content: string;
  enabled: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type CreateSkillInput = {
  name: string;
  description?: string;
  content: string;
  enabled?: boolean;
  tags?: string[];
};

export type UpdateSkillInput = Partial<CreateSkillInput>;

// ── Model Config ──────────────────────────────────────────────────────────────

export type ReasoningEffort = "low" | "medium" | "high" | "xhigh";

export type ModelConfig = {
  selectedModel: string;
  reasoningEffort: ReasoningEffort;
  maxToolsPerRequest: number;
  provider?: ProviderConfig;
};

export type ProviderConfig = {
  type: "copilot" | "openai" | "azure" | "anthropic" | "ollama";
  baseUrl?: string;
  apiKey?: string;
};

// ── Session Metadata ──────────────────────────────────────────────────────────

export type SessionInfo = {
  id: string;
  startedAt: string;
  lastMessageAt: string;
  messageCount: number;
  model: string;
  summary?: string;
};

// ── SQLite Row Types ──────────────────────────────────────────────────────────

export type StoredPersonality = {
  id: string;
  name: string;
  system_prompt: string;
  is_active: number;
  created_at: string;
  updated_at: string;
};

export type StoredPrompt = {
  id: string;
  name: string;
  description: string;
  content: string;
  category: string;
  tags_json: string;
  stages_json: string | null;
  preferred_tools_json: string;
  created_at: string;
  updated_at: string;
};

export type StoredJob = {
  id: string;
  name: string;
  description: string;
  cron_expression: string;
  prompt: string;
  enabled: number;
  last_run_at: string | null;
  next_run_at: string | null;
  run_count: number;
  created_at: string;
  updated_at: string;
};

export type StoredTask = {
  id: string;
  prompt: string;
  status: string;
  result: string | null;
  error: string | null;
  parent_id: string | null;
  depth: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

export type StoredMcpServer = {
  id: string;
  name: string;
  type: string;
  command: string | null;
  args_json: string;
  url: string | null;
  env_json: string;
  enabled: number;
  tools_json: string;
  created_at: string;
  updated_at: string;
};

export type StoredSkill = {
  id: string;
  name: string;
  description: string;
  content: string;
  enabled: number;
  tags_json: string;
  created_at: string;
  updated_at: string;
};
