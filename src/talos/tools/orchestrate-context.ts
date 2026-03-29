/**
 * Orchestration Context — Module-level setters for passing orchestration
 * context across process boundaries where AsyncLocalStorage is unavailable.
 *
 * Follows the openzigs `setActiveChatContext()` pattern.
 */

export type OrchestrateContext = {
  sessionId: string;
  chatId: string;
  parentTaskId?: string;
  model?: string;
};

let activeContext: OrchestrateContext | null = null;

/**
 * Set the active orchestrate context for the current invocation.
 * Should be called before dispatching sub-agents.
 */
export function setActiveOrchestrateContext(ctx: OrchestrateContext): void {
  activeContext = { ...ctx };
}

/**
 * Clear the active orchestrate context. Call after orchestration completes.
 */
export function clearActiveOrchestrateContext(): void {
  activeContext = null;
}

/**
 * Retrieve the current active orchestrate context, or null if none is set.
 */
export function getActiveOrchestrateContext(): OrchestrateContext | null {
  return activeContext ? { ...activeContext } : null;
}
