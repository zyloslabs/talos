/**
 * Tests for orchestrate-agents tool.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { PlatformRepository } from "../../platform/repository.js";
import { getDefaultTalosConfig } from "../config.js";
import { createOrchestrateAgentsTool, type OrchestrateAgentsToolDeps } from "./orchestrate-agents.js";

function createMockCopilot() {
  const chatChunks = ["Hello ", "from ", "session mode"];
  return {
    chat: vi.fn(async function* () {
      for (const chunk of chatChunks) {
        yield chunk;
      }
    }),
    authenticate: vi.fn(),
    waitForAuth: vi.fn(),
    isAuthenticated: vi.fn(async () => true),
    getAuthType: vi.fn(async () => "env"),
    listModels: vi.fn(async () => []),
    modelSupportsReasoning: vi.fn(() => false),
    getModel: vi.fn(() => "gpt-4.1"),
    setModel: vi.fn(),
    getReasoningEffort: vi.fn(() => undefined),
    setReasoningEffort: vi.fn(),
    getProvider: vi.fn(() => undefined),
    setProvider: vi.fn(),
    destroySession: vi.fn(),
    clearAllSessions: vi.fn(),
    getSessionUsage: vi.fn(() => null),
    clearSessionUsage: vi.fn(() => null),
    hasGithubToken: vi.fn(() => true),
    getGithubToken: vi.fn(async () => "token"),
    reinit: vi.fn(),
    getCustomAgents: vi.fn(() => []),
    setCustomAgents: vi.fn(),
  };
}

function createDeps(overrides?: Partial<OrchestrateAgentsToolDeps>): OrchestrateAgentsToolDeps {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const platformRepo = new PlatformRepository(db);
  platformRepo.migrate();
  const copilot = createMockCopilot();
  const talosConfig = getDefaultTalosConfig();

  return {
    copilot: copilot as unknown as OrchestrateAgentsToolDeps["copilot"],
    platformRepo,
    talosConfig,
    ...overrides,
  };
}

describe("createOrchestrateAgentsTool", () => {
  let deps: OrchestrateAgentsToolDeps;

  beforeEach(() => {
    deps = createDeps();
  });

  it("creates a valid ToolDefinition", () => {
    const tool = createOrchestrateAgentsTool(deps);
    expect(tool.name).toBe("talos-orchestrate-agents");
    expect(tool.category).toBe("productivity");
    expect(tool.riskLevel).toBe("medium");
    expect(tool.handler).toBeInstanceOf(Function);
  });

  it("validates agents array is required and non-empty", () => {
    const tool = createOrchestrateAgentsTool(deps);
    expect(tool.zodSchema.safeParse({ agents: [] }).success).toBe(false);
    expect(tool.zodSchema.safeParse({}).success).toBe(false);
  });

  it("validates agent goal is required", () => {
    const tool = createOrchestrateAgentsTool(deps);
    expect(tool.zodSchema.safeParse({ agents: [{ goal: "" }] }).success).toBe(false);
    expect(tool.zodSchema.safeParse({ agents: [{ goal: "Analyze code" }] }).success).toBe(true);
  });

  it("session mode calls copilot.chat with enableSubagents", async () => {
    const tool = createOrchestrateAgentsTool(deps);
    const result = await tool.handler({
      agents: [{ goal: "Analyze code quality" }, { goal: "Find security issues" }],
      mode: "session",
    });
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.text);
    expect(parsed.mode).toBe("session");
    expect(parsed.agentCount).toBe(2);
    expect(parsed.result).toBe("Hello from session mode");

    const mockCopilot = deps.copilot as unknown as ReturnType<typeof createMockCopilot>;
    expect(mockCopilot.chat).toHaveBeenCalledOnce();
    const chatCalls = mockCopilot.chat.mock.calls as unknown as [string, Record<string, unknown>][];
    const chatOpts = chatCalls[0]?.[1];
    expect(chatOpts?.enableSubagents).toBe(true);
    expect(chatOpts?.customAgents).toHaveLength(2);
  });

  it("task mode creates tasks via platformRepo", async () => {
    const tool = createOrchestrateAgentsTool(deps);
    const result = await tool.handler({
      agents: [{ goal: "Write tests" }],
      mode: "task",
      timeout_seconds: 1,
    });
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.text);
    expect(parsed.mode).toBe("task");
    expect(parsed.taskCount).toBe(1);
    expect(parsed.results).toHaveLength(1);
    // Task will timeout since no worker picks it up
    expect(parsed.results[0].status).toBe("timeout");
  });

  it("defaults to config mode when mode is not specified", async () => {
    // Default config mode is "task"
    const tool = createOrchestrateAgentsTool(deps);
    const result = await tool.handler({
      agents: [{ goal: "Do something" }],
      timeout_seconds: 1,
    });
    const parsed = JSON.parse(result.text);
    expect(parsed.mode).toBe("task");
  });

  it("handles session mode errors gracefully", async () => {
    const errorCopilot = createMockCopilot();
    errorCopilot.chat = vi.fn(async function* () {
      throw new Error("SDK connection failed");
    });
    const errorDeps = createDeps({ copilot: errorCopilot as unknown as OrchestrateAgentsToolDeps["copilot"] });
    const tool = createOrchestrateAgentsTool(errorDeps);

    const result = await tool.handler({
      agents: [{ goal: "Analyze" }],
      mode: "session",
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("Session mode orchestration failed");
  });

  it("passes aggregation_prompt in session mode", async () => {
    const tool = createOrchestrateAgentsTool(deps);
    const result = await tool.handler({
      agents: [{ goal: "Task A" }],
      aggregation_prompt: "Combine everything into a report",
      mode: "session",
    });
    expect(result.isError).toBeUndefined();
    const mockCopilot = deps.copilot as unknown as ReturnType<typeof createMockCopilot>;
    const chatCalls = mockCopilot.chat.mock.calls as unknown as [string, Record<string, unknown>][];
    const prompt = chatCalls[0]?.[0] as string;
    expect(prompt).toContain("Combine everything into a report");
  });
});
