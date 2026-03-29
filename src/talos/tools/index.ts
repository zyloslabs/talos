/**
 * Talos Orchestration Tools — barrel export.
 *
 * Re-exports tool factories for agent orchestration and spawning.
 */

export { createOrchestrateAgentsTool, orchestrateAgentsSchema } from "./orchestrate-agents.js";
export type { OrchestrateAgentsToolDeps, OrchestrateAgentsInput } from "./orchestrate-agents.js";

export { createSpawnAgentTool, spawnAgentSchema } from "./spawn-agent.js";
export type { SpawnAgentToolDeps, SpawnAgentInput } from "./spawn-agent.js";

export {
  setActiveOrchestrateContext,
  clearActiveOrchestrateContext,
  getActiveOrchestrateContext,
} from "./orchestrate-context.js";
export type { OrchestrateContext } from "./orchestrate-context.js";
