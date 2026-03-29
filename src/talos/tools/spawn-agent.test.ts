/**
 * Tests for spawn-agent tool.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { PlatformRepository } from "../../platform/repository.js";
import { createSpawnAgentTool, type SpawnAgentToolDeps } from "./spawn-agent.js";
import {
  setActiveOrchestrateContext,
  clearActiveOrchestrateContext,
} from "./orchestrate-context.js";

function createMockCopilot() {
  const chatChunks = ["Agent ", "result"];
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

function createDeps(): SpawnAgentToolDeps {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const platformRepo = new PlatformRepository(db);
  platformRepo.migrate();
  const copilot = createMockCopilot();

  return {
    copilot: copilot as unknown as SpawnAgentToolDeps["copilot"],
    platformRepo,
  };
}

describe("createSpawnAgentTool", () => {
  let deps: SpawnAgentToolDeps;

  beforeEach(() => {
    deps = createDeps();
  });

  afterEach(() => {
    clearActiveOrchestrateContext();
  });

  it("creates a valid ToolDefinition", () => {
    const tool = createSpawnAgentTool(deps);
    expect(tool.name).toBe("talos-spawn-agent");
    expect(tool.category).toBe("productivity");
    expect(tool.riskLevel).toBe("medium");
    expect(tool.handler).toBeInstanceOf(Function);
  });

  it("validates goal is required", () => {
    const tool = createSpawnAgentTool(deps);
    expect(tool.zodSchema.safeParse({ goal: "" }).success).toBe(false);
    expect(tool.zodSchema.safeParse({}).success).toBe(false);
    expect(tool.zodSchema.safeParse({ goal: "Analyze code" }).success).toBe(true);
  });

  it("creates a background task when no orchestrate context is active", async () => {
    const tool = createSpawnAgentTool(deps);
    const result = await tool.handler({ goal: "Review code" });
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.text);
    expect(parsed.mode).toBe("task");
    expect(parsed.taskId).toBeTruthy();
    expect(parsed.status).toBe("pending");
    expect(parsed.goal).toBe("Review code");
  });

  it("uses session mode when orchestrate context is active", async () => {
    setActiveOrchestrateContext({
      sessionId: "orch-session",
      chatId: "orch-chat",
      model: "gpt-4.1",
    });

    const tool = createSpawnAgentTool(deps);
    const result = await tool.handler({ goal: "Find bugs" });
    const parsed = JSON.parse(result.text);
    expect(parsed.mode).toBe("session");
    expect(parsed.sessionId).toBe("orch-session");
    expect(parsed.result).toBe("Agent result");
  });

  it("passes model from context when no model override", async () => {
    setActiveOrchestrateContext({
      sessionId: "orch-session",
      chatId: "orch-chat",
      model: "o4-mini",
    });

    const tool = createSpawnAgentTool(deps);
    await tool.handler({ goal: "Find bugs" });

    const mockCopilot = deps.copilot as unknown as ReturnType<typeof createMockCopilot>;
    const chatCalls = mockCopilot.chat.mock.calls as unknown as [string, Record<string, unknown>][];
    const chatOpts = chatCalls[0]?.[1];
    expect(chatOpts?.model).toBe("o4-mini");
  });

  it("model override takes precedence over context model", async () => {
    setActiveOrchestrateContext({
      sessionId: "orch-session",
      chatId: "orch-chat",
      model: "o4-mini",
    });

    const tool = createSpawnAgentTool(deps);
    await tool.handler({ goal: "Find bugs", model: "gpt-4.1" });

    const mockCopilot = deps.copilot as unknown as ReturnType<typeof createMockCopilot>;
    const chatCalls = mockCopilot.chat.mock.calls as unknown as [string, Record<string, unknown>][];
    const chatOpts = chatCalls[0]?.[1];
    expect(chatOpts?.model).toBe("gpt-4.1");
  });

  it("includes context in task prompt", async () => {
    const tool = createSpawnAgentTool(deps);
    const result = await tool.handler({
      goal: "Review code",
      context: "Focus on error handling",
    });
    const parsed = JSON.parse(result.text);
    expect(parsed.mode).toBe("task");

    // Verify the task was created with the combined prompt
    const task = deps.platformRepo.getTask(parsed.taskId);
    expect(task?.prompt).toContain("Review code");
    expect(task?.prompt).toContain("Focus on error handling");
  });

  it("handles session mode errors gracefully", async () => {
    setActiveOrchestrateContext({
      sessionId: "orch-session",
      chatId: "orch-chat",
    });

    const errorCopilot = createMockCopilot();
    errorCopilot.chat = vi.fn(async function* () {
      throw new Error("Session expired");
    });
    const errorDeps: SpawnAgentToolDeps = {
      copilot: errorCopilot as unknown as SpawnAgentToolDeps["copilot"],
      platformRepo: deps.platformRepo,
    };

    const tool = createSpawnAgentTool(errorDeps);
    const result = await tool.handler({ goal: "Analyze" });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("Session-mode spawn failed");
  });
});
