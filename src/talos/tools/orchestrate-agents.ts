/**
 * orchestrate-agents MCP Tool
 *
 * Provides two orchestration modes:
 * - "session": composes a single prompt and delegates via SDK subagents (~2 API calls)
 * - "task": fans out individual background tasks in parallel (N+1 API calls)
 */

import * as z from "zod";
import type { ToolDefinition } from "../tools.js";
import type { CopilotWrapper, CustomAgentDefinition } from "../../copilot/copilot-wrapper.js";
import type { PlatformRepository } from "../../platform/repository.js";
import type { TalosConfig } from "../config.js";
import { setActiveOrchestrateContext, clearActiveOrchestrateContext } from "./orchestrate-context.js";

// ── Zod Schema ────────────────────────────────────────────────────────────────

const agentDefinitionSchema = z.object({
  goal: z.string().min(1, "Agent goal is required"),
  context: z.string().optional(),
  model: z.string().optional(),
});

export const orchestrateAgentsSchema = z.object({
  agents: z.array(agentDefinitionSchema).min(1, "At least one agent is required").max(50, "Maximum 50 agents allowed"),
  aggregation_prompt: z.string().optional(),
  timeout_seconds: z.number().min(1).max(3600).optional(),
  mode: z.enum(["task", "session"]).optional(),
});

export type OrchestrateAgentsInput = z.infer<typeof orchestrateAgentsSchema>;

// ── Tool Dependencies ─────────────────────────────────────────────────────────

export type OrchestrateAgentsToolDeps = {
  copilot: CopilotWrapper;
  platformRepo: PlatformRepository;
  talosConfig: TalosConfig;
};

// ── Session Mode Handler ──────────────────────────────────────────────────────

async function handleSessionMode(
  input: OrchestrateAgentsInput,
  deps: OrchestrateAgentsToolDeps
): Promise<{ text: string; isError?: boolean }> {
  const { copilot } = deps;
  const sessionId = `orchestrate-${Date.now()}`;

  // Build custom agent definitions from the input agents
  const customAgents: CustomAgentDefinition[] = input.agents.map((agent, idx) => ({
    name: `agent-${idx}`,
    displayName: `Agent ${idx + 1}`,
    description: agent.goal,
    prompt: [agent.goal, agent.context].filter(Boolean).join("\n\nContext:\n"),
  }));

  // Compose a single orchestration prompt
  const agentDescriptions = input.agents
    .map((agent, idx) => `- Agent ${idx + 1}: ${agent.goal}${agent.context ? ` (Context: ${agent.context})` : ""}`)
    .join("\n");

  const composedPrompt = [
    "You are an orchestrator. Delegate the following tasks to the available sub-agents and synthesize their results:",
    "",
    agentDescriptions,
    "",
    input.aggregation_prompt ?? "Synthesize the results from all agents into a cohesive summary.",
  ].join("\n");

  setActiveOrchestrateContext({
    sessionId,
    chatId: sessionId,
    model: input.agents[0]?.model,
  });

  try {
    let result = "";
    for await (const chunk of copilot.chat(composedPrompt, {
      conversationId: sessionId,
      enableSubagents: true,
      customAgents,
      model: input.agents[0]?.model,
    })) {
      result += chunk;
    }

    return {
      text: JSON.stringify(
        {
          mode: "session",
          sessionId,
          agentCount: input.agents.length,
          result: result || "Orchestration completed (no output)",
        },
        null,
        2
      ),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { text: `Session mode orchestration failed: ${msg}`, isError: true };
  } finally {
    clearActiveOrchestrateContext();
  }
}

// ── Task Mode Handler ─────────────────────────────────────────────────────────

async function handleTaskMode(
  input: OrchestrateAgentsInput,
  deps: OrchestrateAgentsToolDeps
): Promise<{ text: string; isError?: boolean }> {
  const { platformRepo } = deps;
  const timeoutMs = (input.timeout_seconds ?? 300) * 1000;
  const deadline = Date.now() + timeoutMs;

  // Create a task for each agent
  const tasks = input.agents.map((agent) => {
    const prompt = [agent.goal, agent.context].filter(Boolean).join("\n\nContext:\n");
    return platformRepo.createTask({ prompt });
  });

  // Poll until all tasks complete or timeout
  const pollInterval = 1000;
  const completedResults: Array<{ taskId: string; status: string; result?: string; error?: string }> = [];

  while (completedResults.length < tasks.length && Date.now() < deadline) {
    for (const task of tasks) {
      if (completedResults.some((r) => r.taskId === task.id)) continue;
      const current = platformRepo.getTask(task.id);
      if (
        current &&
        (current.status === "completed" || current.status === "failed" || current.status === "cancelled")
      ) {
        completedResults.push({
          taskId: current.id,
          status: current.status,
          result: current.result ?? undefined,
          error: current.error ?? undefined,
        });
      }
    }
    if (completedResults.length < tasks.length) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
  }

  // Gather results for tasks still pending at timeout
  for (const task of tasks) {
    if (!completedResults.some((r) => r.taskId === task.id)) {
      completedResults.push({ taskId: task.id, status: "timeout" });
    }
  }

  return {
    text: JSON.stringify(
      {
        mode: "task",
        taskCount: tasks.length,
        results: completedResults,
      },
      null,
      2
    ),
  };
}

// ── Tool Factory ──────────────────────────────────────────────────────────────

export function createOrchestrateAgentsTool(deps: OrchestrateAgentsToolDeps): ToolDefinition {
  const { talosConfig } = deps;

  return {
    name: "talos-orchestrate-agents",
    description:
      "Orchestrate multiple AI agents to work on related tasks. " +
      "Session mode uses SDK subagent delegation (~2 API calls). " +
      "Task mode fans out individual background tasks (N+1 API calls).",
    inputSchema: {
      type: "object",
      properties: {
        agents: {
          type: "array",
          description: "Array of agent definitions with goal, optional context, and optional model",
        },
        aggregation_prompt: {
          type: "string",
          description: "Prompt to synthesize results from all agents",
        },
        timeout_seconds: {
          type: "number",
          description: "Timeout in seconds for task mode (default: 300)",
        },
        mode: {
          type: "string",
          description: 'Orchestration mode: "task" or "session" (default from config)',
        },
      },
      required: ["agents"],
    },
    zodSchema: orchestrateAgentsSchema,
    category: "productivity",
    riskLevel: "medium",
    source: "talos",
    handler: async (args) => {
      const parsed = orchestrateAgentsSchema.parse(args);
      const effectiveMode = parsed.mode ?? talosConfig.orchestration.defaultMode;

      if (effectiveMode === "session") {
        return handleSessionMode(parsed, deps);
      }
      return handleTaskMode(parsed, deps);
    },
  };
}
