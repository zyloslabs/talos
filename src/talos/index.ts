/**
 * Talos Module Entry Point
 *
 * Exports all Talos subsystems and provides the initTalos() bootstrapper.
 */

// ── Type Exports ──────────────────────────────────────────────────────────────

export * from "./types.js";
export * from "./config.js";
export type { TalosRepositoryOptions } from "./repository.js";
export type { ToolDefinition, TalosToolsOptions } from "./tools.js";

// ── Class/Function Exports ────────────────────────────────────────────────────

export { TalosRepository } from "./repository.js";
export { createTalosTools } from "./tools.js";
export { parseTalosConfig, getDefaultTalosConfig, talosConfigSchema } from "./config.js";

// ── Subsystem Exports ─────────────────────────────────────────────────────────
// Note: We selectively re-export to avoid name collisions with types.js

export { DiscoveryEngine } from "./discovery/index.js";
export { FileChunker } from "./discovery/index.js";
export { GitHubApiClient } from "./discovery/index.js";

export { EmbeddingService } from "./rag/index.js";
export { VectorStore } from "./rag/index.js";
export { RagPipeline } from "./rag/index.js";

export { PlaywrightRunner } from "./runner/index.js";
export { ArtifactManager } from "./runner/index.js";
export { CredentialInjector } from "./runner/index.js";

export { TestGenerator } from "./generator/index.js";
export { PromptBuilder } from "./generator/index.js";
export { CodeValidator } from "./generator/index.js";

export { HealingEngine } from "./healing/index.js";
export { FailureAnalyzer } from "./healing/index.js";
export { FixGenerator } from "./healing/index.js";

export { ExportEngine } from "./export/index.js";
export { PackageBuilder } from "./export/index.js";
export { CredentialSanitizer } from "./export/index.js";

export { DocumentIngester } from "./knowledge/index.js";
export { AutoTagger } from "./knowledge/index.js";

// ── M365 Integration ──────────────────────────────────────────────────────────

export { BrowserAuth } from "./m365/index.js";
export { CopilotScraper } from "./m365/index.js";
export { EphemeralStore as M365EphemeralStore } from "./m365/index.js";
export { parseFile as parseM365File } from "./m365/index.js";

// ── Agent Orchestration Tools ─────────────────────────────────────────────────

export { createOrchestrateAgentsTool } from "./tools/orchestrate-agents.js";
export { createSpawnAgentTool } from "./tools/spawn-agent.js";
export {
  setActiveOrchestrateContext,
  clearActiveOrchestrateContext,
  getActiveOrchestrateContext,
} from "./tools/orchestrate-context.js";
export type { OrchestrateContext } from "./tools/orchestrate-context.js";

// ── Initialization ────────────────────────────────────────────────────────────

import type Database from "better-sqlite3";
import { TalosRepository } from "./repository.js";
import { createTalosTools, type ToolDefinition } from "./tools.js";
import { parseTalosConfig, type TalosConfig } from "./config.js";

export type TalosSystemOptions = {
  /** SQLite database instance */
  db: Database.Database;
  /** Raw config object (will be parsed and validated) */
  config?: unknown;
  /** Clock function for deterministic testing */
  clock?: () => Date;
};

export type TalosSystem = {
  repository: TalosRepository;
  config: TalosConfig;
  tools: ToolDefinition[];
};

/**
 * Initialize the Talos subsystem.
 *
 * - Parses and validates configuration
 * - Runs database migrations
 * - Creates repository instance
 * - Generates MCP tool definitions
 *
 * @returns Talos system components ready for integration
 */
export function initTalos(options: TalosSystemOptions): TalosSystem {
  // Parse and validate configuration
  const config = parseTalosConfig(options.config);

  // Create repository and run migrations
  const repository = new TalosRepository(options.db, {
    clock: options.clock,
  });
  repository.migrate();

  // Create MCP tools
  const tools = createTalosTools({
    repository,
    config,
  });

  return {
    repository,
    config,
    tools,
  };
}
