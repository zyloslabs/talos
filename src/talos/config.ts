/**
 * Talos configuration schema using Zod validation.
 * Follows Talos config layering pattern.
 */

import * as z from "zod";

// ── Vector Database Config ────────────────────────────────────────────────────

export const vectorDbConfigSchema = z.object({
  /** Vector database type */
  type: z.enum(["lancedb", "qdrant"]).default("lancedb"),
  /** Path to LanceDB storage (for lancedb type) */
  path: z.string().default("~/.talos/vectordb"),
  /** Qdrant URL (for qdrant type) */
  qdrantUrl: z.string().optional(),
  /** Qdrant API key (for qdrant type) */
  qdrantApiKey: z.string().optional(),
  /** Collection name */
  collectionName: z.string().default("talos_chunks"),
});

export type VectorDbConfig = z.infer<typeof vectorDbConfigSchema>;

// ── Embedding Config ──────────────────────────────────────────────────────────

export const embeddingConfigSchema = z.object({
  /** Embedding provider */
  provider: z.enum(["openai", "local"]).default("openai"),
  /** Model name */
  model: z.string().default("text-embedding-3-small"),
  /** Embedding dimensions */
  dimensions: z.number().default(1536),
  /** Batch size for embedding requests */
  batchSize: z.number().default(100),
});

export type EmbeddingConfig = z.infer<typeof embeddingConfigSchema>;

// ── Runner Config ─────────────────────────────────────────────────────────────

export const runnerConfigSchema = z.object({
  /** Default browser for test execution */
  defaultBrowser: z.enum(["chromium", "firefox", "webkit"]).default("chromium"),
  /** Default timeout for test actions (ms) */
  timeout: z.number().min(0).default(30000),
  /** Navigation timeout (ms) */
  navigationTimeout: z.number().min(0).default(60000),
  /** Trace capture mode */
  traceMode: z.enum(["off", "on", "retain-on-failure", "on-first-retry"]).default("on-first-retry"),
  /** Whether to capture screenshots on failure */
  screenshotOnFailure: z.boolean().default(true),
  /** Whether to capture video */
  video: z.enum(["off", "on", "retain-on-failure", "on-first-retry"]).default("retain-on-failure"),
  /** Number of retry attempts */
  retries: z.number().min(0).default(2),
  /** Number of parallel workers */
  workers: z.number().min(1).default(1),
  /** Headless mode */
  headless: z.boolean().default(true),
  /** Slow motion delay (ms) - useful for debugging */
  slowMo: z.number().default(0),
});

export type RunnerConfig = z.infer<typeof runnerConfigSchema>;

// ── Healing Config ────────────────────────────────────────────────────────────

export const healingConfigSchema = z.object({
  /** Confidence threshold for auto-applying fixes (0-1) */
  confidenceThreshold: z.number().min(0).max(1).default(0.85),
  /** Maximum retry attempts for healing */
  maxRetries: z.number().default(3),
  /** Whether to enable automatic healing */
  enabled: z.boolean().default(true),
  /** Cooldown between healing attempts (ms) */
  cooldownMs: z.number().default(5000),
  /** Model to use for healing analysis */
  model: z.string().optional(),
});

export type HealingConfig = z.infer<typeof healingConfigSchema>;

// ── Generator Config ──────────────────────────────────────────────────────────

export const generatorConfigSchema = z.object({
  /** Default confidence threshold for auto-activating tests */
  confidenceThreshold: z.number().min(0).max(1).default(0.8),
  /** Whether generated tests require human review */
  requireReview: z.boolean().default(true),
  /** Maximum context chunks to include in generation prompt */
  maxContextChunks: z.number().default(10),
  /** Model to use for test generation */
  model: z.string().optional(),
  /** Use Page Object Model pattern */
  usePom: z.boolean().default(true),
});

export type GeneratorConfig = z.infer<typeof generatorConfigSchema>;

// ── Export Config ─────────────────────────────────────────────────────────────

export const exportConfigSchema = z.object({
  /** Default output directory for exports */
  outputDir: z.string().default("~/.talos/exports"),
  /** Whether to sanitize credentials in exports */
  sanitizeCredentials: z.boolean().default(true),
  /** Include .env.example template */
  includeEnvTemplate: z.boolean().default(true),
});

export type ExportConfig = z.infer<typeof exportConfigSchema>;

// ── Artifacts Config ──────────────────────────────────────────────────────────

export const artifactsConfigSchema = z.object({
  /** Path to store test artifacts */
  path: z.string().default("~/.talos/artifacts"),
  /** Maximum artifact retention days */
  retentionDays: z.number().default(30),
  /** Maximum total artifact storage (MB) */
  maxStorageMb: z.number().default(5000),
});

export type ArtifactsConfig = z.infer<typeof artifactsConfigSchema>;

// ── Discovery Config ──────────────────────────────────────────────────────────

export const discoveryConfigSchema = z.object({
  /** File extensions to include in discovery */
  includeExtensions: z.array(z.string()).default([".ts", ".tsx", ".js", ".jsx", ".vue", ".svelte", ".html", ".css"]),
  /** Patterns to exclude from discovery */
  excludePatterns: z.array(z.string()).default(["node_modules", ".git", "dist", "build", ".next", "coverage"]),
  /** Maximum file size to process (bytes) */
  maxFileSizeBytes: z.number().default(1_000_000),
  /** Chunk size for RAG indexing */
  chunkSize: z.number().default(1000),
  /** Chunk overlap for RAG indexing */
  chunkOverlap: z.number().default(200),
});

export type DiscoveryConfig = z.infer<typeof discoveryConfigSchema>;

// ── GitHub MCP Config ─────────────────────────────────────────────────────────

export const githubMcpConfigSchema = z.object({
  /** Rate limit for GitHub API requests per hour */
  rateLimitPerHour: z.number().default(5000),
  /** Exponential backoff base delay (ms) */
  backoffBaseMs: z.number().default(1000),
  /** Maximum backoff delay (ms) */
  backoffMaxMs: z.number().default(60000),
  /** Cache TTL for repository metadata (seconds) */
  cacheTtlSeconds: z.number().default(300),
});

export type GitHubMcpConfig = z.infer<typeof githubMcpConfigSchema>;

// ── Main Talos Config ─────────────────────────────────────────────────────────

export const talosConfigSchema = z.object({
  /** Whether Talos module is enabled */
  enabled: z.boolean().default(true),
  /** Vector database configuration */
  vectorDb: vectorDbConfigSchema.default({}),
  /** Embedding configuration */
  embedding: embeddingConfigSchema.default({}),
  /** Test runner configuration */
  runner: runnerConfigSchema.default({}),
  /** Self-healing configuration */
  healing: healingConfigSchema.default({}),
  /** Test generator configuration */
  generator: generatorConfigSchema.default({}),
  /** Export configuration */
  export: exportConfigSchema.default({}),
  /** Artifacts configuration */
  artifacts: artifactsConfigSchema.default({}),
  /** Discovery configuration */
  discovery: discoveryConfigSchema.default({}),
  /** GitHub MCP configuration */
  githubMcp: githubMcpConfigSchema.default({}),
});

export type TalosConfig = z.infer<typeof talosConfigSchema>;

/**
 * Parse and validate Talos configuration.
 * Returns validated config with defaults applied.
 */
export function parseTalosConfig(input: unknown): TalosConfig {
  return talosConfigSchema.parse(input ?? {});
}

/**
 * Get default Talos configuration.
 */
export function getDefaultTalosConfig(): TalosConfig {
  return talosConfigSchema.parse({});
}
