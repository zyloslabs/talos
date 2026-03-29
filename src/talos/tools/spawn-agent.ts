/**
 * spawn-agent MCP Tool
 *
 * Dispatches a single background agent task or uses session mode
 * if the parent context has session orchestration active.
 */

import * as z from "zod";
import type { ToolDefinition } from "../tools.js";
import type { CopilotWrapper } from "../../copilot/copilot-wrapper.js";
import type { PlatformRepository } from "../../platform/repository.js";
import { getActiveOrchestrateContext } from "./orchestrate-context.js";

// ── Zod Schema ────────────────────────────────────────────────────────────────

export const spawnAgentSchema = z.object({
  goal: z.string().min(1, "Agent goal is required"),
  context: z.string().optional(),
  model: z.string().optional(),
});

export type SpawnAgentInput = z.infer<typeof spawnAgentSchema>;

// ── Tool Dependencies ─────────────────────────────────────────────────────────

export type SpawnAgentToolDeps = {
  copilot: CopilotWrapper;
  platformRepo: PlatformRepository;
};

// ── Tool Factory ──────────────────────────────────────────────────────────────

export function createSpawnAgentTool(deps: SpawnAgentToolDeps): ToolDefinition {
  const { copilot, platformRepo } = deps;

  return {
    name: "talos-spawn-agent",
    description:
      "Spawn a single AI agent to work on a specific goal. " +
      "If an orchestration session context is active, uses session mode. " +
      "Otherwise creates a background task.",
    inputSchema: {
      type: "object",
      properties: {
        goal: { type: "string", description: "What the agent should accomplish" },
        context: { type: "string", description: "Additional context for the agent" },
        model: { type: "string", description: "Model override for this agent" },
      },
      required: ["goal"],
    },
    zodSchema: spawnAgentSchema,
    category: "productivity",
    riskLevel: "medium",
    source: "talos",
    handler: async (args) => {
      const parsed = spawnAgentSchema.parse(args);
      const orchestrateCtx = getActiveOrchestrateContext();

      // If there's an active session context, use session mode
      if (orchestrateCtx) {
        try {
          const prompt = [parsed.goal, parsed.context].filter(Boolean).join("\n\nContext:\n");
          let result = "";
          for await (const chunk of copilot.chat(prompt, {
            conversationId: orchestrateCtx.sessionId,
            model: parsed.model ?? orchestrateCtx.model,
          })) {
            result += chunk;
          }
          return {
            text: JSON.stringify(
              {
                mode: "session",
                sessionId: orchestrateCtx.sessionId,
                result: result || "Agent completed (no output)",
              },
              null,
              2
            ),
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return { text: `Session-mode spawn failed: ${msg}`, isError: true };
        }
      }

      // No active context — create a background task
      const prompt = [parsed.goal, parsed.context].filter(Boolean).join("\n\nContext:\n");
      const task = platformRepo.createTask({ prompt });

      return {
        text: JSON.stringify(
          {
            mode: "task",
            taskId: task.id,
            status: task.status,
            goal: parsed.goal,
          },
          null,
          2
        ),
      };
    },
  };
}
