/**
 * Talos configuration schema using Zod validation.
 * Follows Talos config layering pattern.
 */

import * as z from "zod";
import { join } from "node:path";
import { homedir } from "node:os";

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

// ── Embedding Config ──────────────────────────────────────────────────────

export const embeddingConfigSchema = z.object({
  /** Embedding provider */
  provider: z.enum(["openai", "local", "github-models"]).default("github-models"),
  /** Model name */
  model: z.string().default("text-embedding-3-small"),
  /** Embedding dimensions */
  dimensions: z.number().default(1536),
  /** Batch size for embedding requests */
  batchSize: z.number().default(100),
});

export type EmbeddingConfig = z.infer<typeof embeddingConfigSchema>;

// ── mTLS Config ───────────────────────────────────────────────────────────

export const mtlsConfigSchema = z.object({
  /** Whether mTLS is enabled for the runner */
  enabled: z.boolean().default(false),
  /** Vault reference for client certificate (PEM) */
  clientCertVaultRef: z.string().optional(),
  /** Vault reference for client private key (PEM) */
  clientKeyVaultRef: z.string().optional(),
  /** Vault reference for CA certificate (PEM) */
  caVaultRef: z.string().optional(),
  /** Vault reference for PFX/PKCS12 bundle */
  pfxVaultRef: z.string().optional(),
  /** Passphrase for the client key or PFX file */
  passphrase: z.string().optional(),
});

export type MtlsConfig = z.infer<typeof mtlsConfigSchema>;

// ── Runner Config ───────────────────────────────────────────────────────

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
  /** mTLS configuration for mutual TLS authentication */
  mtls: mtlsConfigSchema.default(mtlsConfigSchema.parse({})),
});

export type RunnerConfig = z.infer<typeof runnerConfigSchema>;

// ── Healing Config ──────────────────────────────────────────────────────

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

// ── Generator Config ──────────────────────────────────────────────────────

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

// ── Export Config ───────────────────────────────────────────────────────

export const exportConfigSchema = z.object({
  /** Default output directory for exports */
  outputDir: z.string().default("~/.talos/exports"),
  /** Whether to sanitize credentials in exports */
  sanitizeCredentials: z.boolean().default(true),
  /** Include .env.example template */
  includeEnvTemplate: z.boolean().default(true),
});

export type ExportConfig = z.infer<typeof exportConfigSchema>;

// ── Artifacts Config ──────────────────────────────────────────────────────

export const artifactsConfigSchema = z.object({
  /** Path to store test artifacts */
  path: z.string().default("~/.talos/artifacts"),
  /** Maximum artifact retention days */
  retentionDays: z.number().default(30),
  /** Maximum total artifact storage (MB) */
  maxStorageMb: z.number().default(5000),
});

export type ArtifactsConfig = z.infer<typeof artifactsConfigSchema>;

// ── Discovery Config ──────────────────────────────────────────────────────

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

// ── GitHub MCP Config ─────────────────────────────────────────────────────

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

// ── M365 Integration Config ───────────────────────────────────────────────

export const m365ConfigSchema = z.object({
  /** Whether M365 Copilot integration is enabled */
  enabled: z.boolean().default(false),
  /** Copilot 365 URL */
  url: z.string().default("https://m365.cloud.microsoft/chat/"),
  /** Path to persistent browser session data */
  browserDataDir: z.string().default(join(homedir(), ".talos", "browser-data")),
  /** Directory for ephemeral downloaded documents */
  docsDir: z.string().default(join(homedir(), ".talos", "docs")),
  /** MFA authentication timeout (ms) */
  mfaTimeout: z.number().default(300000),
});

export type M365Config = z.infer<typeof m365ConfigSchema>;

// ── JDBC Data Source Config ────────────────────────────────────────────────

export const jdbcDataSourceConfigSchema = z.object({
  /** Whether this data source integration is enabled */
  enabled: z.boolean().default(false),
  /** JDBC connection URL */
  jdbcUrl: z
    .string()
    .default("")
    .refine(
      (val) => val === "" || /^jdbc:(oracle:thin:@|postgresql:\/\/|mysql:\/\/|sqlserver:\/\/|sqlite:)/i.test(val),
      {
        message:
          "jdbcUrl must start with jdbc: followed by an allowed driver prefix (oracle:thin:@, postgresql://, mysql://, sqlserver://, sqlite:)",
      }
    ),
  /** Database driver type */
  driverType: z.enum(["oracle", "postgresql", "mysql", "sqlserver", "sqlite", "other"]).default("postgresql"),
  /** Vault reference for database username */
  usernameVaultRef: z.string().default(""),
  /** Vault reference for database password */
  passwordVaultRef: z.string().default(""),
  /** Human-readable label for this data source */
  label: z.string().default(""),
  /** Whether to enforce read-only access */
  readOnly: z.boolean().default(true),
});

export type JdbcDataSourceConfig = z.infer<typeof jdbcDataSourceConfigSchema>;

// ── Atlassian Integration Config ──────────────────────────────────────────

export const atlassianConfigSchema = z.object({
  /** Whether Atlassian integration is enabled */
  enabled: z.boolean().default(false),
  /** Deployment type */
  deploymentType: z.enum(["cloud", "datacenter"]).default("cloud"),
  /** Jira server URL */
  jiraUrl: z.string().default(""),
  /** Jira project key */
  jiraProject: z.string().default(""),
  /** Vault reference for Jira username */
  jiraUsernameVaultRef: z.string().default(""),
  /** Vault reference for Jira API token (Cloud) */
  jiraApiTokenVaultRef: z.string().default(""),
  /** Vault reference for Jira personal access token (Data Center) */
  jiraPersonalTokenVaultRef: z.string().default(""),
  /** Whether to verify SSL for Jira */
  jiraSslVerify: z.boolean().default(true),
  /** Confluence server URL */
  confluenceUrl: z.string().default(""),
  /** Confluence space keys to search */
  confluenceSpaces: z.array(z.string()).default([]),
  /** Vault reference for Confluence username */
  confluenceUsernameVaultRef: z.string().default(""),
  /** Vault reference for Confluence API token (Cloud) */
  confluenceApiTokenVaultRef: z.string().default(""),
  /** Vault reference for Confluence personal access token (Data Center) */
  confluencePersonalTokenVaultRef: z.string().default(""),
  /** Whether to verify SSL for Confluence */
  confluenceSslVerify: z.boolean().default(true),
  /** Transport mechanism for MCP server */
  transport: z.enum(["docker"]).default("docker"),
});

export type AtlassianConfig = z.infer<typeof atlassianConfigSchema>;

// ── App Intelligence Schema ───────────────────────────────────────────────────

export const techStackItemSchema = z.object({
  name: z.string(),
  version: z.string().optional(),
  category: z.enum(["framework", "library", "language", "build", "test", "lint", "other"]),
  source: z.string(),
});

export const detectedDatabaseSchema = z.object({
  type: z.string(),
  connectionPattern: z.string(),
  source: z.string(),
  environment: z.string().optional(),
});

export const detectedTestUserSchema = z.object({
  variableName: z.string(),
  source: z.string(),
  roleHint: z.string().optional(),
});

export const detectedDocumentSchema = z.object({
  filePath: z.string(),
  type: z.enum(["readme", "api-spec", "guide", "contributing", "changelog", "other"]),
  title: z.string().optional(),
});

export const detectedConfigFileSchema = z.object({
  filePath: z.string(),
  type: z.string(),
});

export const appIntelligenceReportSchema = z.object({
  id: z.string(),
  applicationId: z.string(),
  techStack: z.array(techStackItemSchema),
  databases: z.array(detectedDatabaseSchema),
  testUsers: z.array(detectedTestUserSchema),
  documentation: z.array(detectedDocumentSchema),
  configFiles: z.array(detectedConfigFileSchema),
  scannedAt: z.coerce.date(),
});

// ── API Input Schemas ─────────────────────────────────────────────────────────

/** Zod schema for validating POST /data-sources request body */
export const createDataSourceInputSchema = z.object({
  label: z.string().min(1, "label is required"),
  driverType: z.enum(["oracle", "postgresql", "mysql", "sqlserver", "sqlite", "other"]).default("postgresql"),
  jdbcUrl: z
    .string()
    .min(1, "jdbcUrl is required")
    .refine((val) => /^jdbc:(oracle:thin:@|postgresql:\/\/|mysql:\/\/|sqlserver:\/\/|sqlite:)/i.test(val), {
      message:
        "jdbcUrl must start with jdbc: followed by an allowed driver prefix (oracle:thin:@, postgresql://, mysql://, sqlserver://, sqlite:)",
    }),
  usernameVaultRef: z.string().default(""),
  passwordVaultRef: z.string().default(""),
});

export type CreateDataSourceApiInput = z.infer<typeof createDataSourceInputSchema>;

/** Zod schema for validating POST /atlassian request body */
export const atlassianConfigInputSchema = z.object({
  deploymentType: z.enum(["cloud", "datacenter"]).default("cloud"),
  jiraUrl: z.string().default(""),
  jiraProject: z.string().default(""),
  jiraUsernameVaultRef: z.string().default(""),
  jiraApiTokenVaultRef: z.string().default(""),
  jiraPersonalTokenVaultRef: z.string().default(""),
  jiraSslVerify: z.boolean().default(true),
  confluenceUrl: z.string().default(""),
  confluenceSpaces: z.array(z.string()).default([]),
  confluenceUsernameVaultRef: z.string().default(""),
  confluenceApiTokenVaultRef: z.string().default(""),
  confluencePersonalTokenVaultRef: z.string().default(""),
  confluenceSslVerify: z.boolean().default(true),
});

export type AtlassianConfigApiInput = z.infer<typeof atlassianConfigInputSchema>;

// ── Orchestration Config ──────────────────────────────────────────────────

export const orchestrationConfigSchema = z.object({
  /** Default orchestration mode: "task" fans out N+1 API calls; "session" uses SDK subagent delegation (~2 calls) */
  defaultMode: z.enum(["task", "session"]).default("task"),
});

export type OrchestrationConfig = z.infer<typeof orchestrationConfigSchema>;

// ── Corporate Proxy Config ────────────────────────────────────────────────

export const proxyConfigSchema = z.object({
  /** Whether corporate proxy is enabled */
  enabled: z.boolean().default(false),
  /** HTTP proxy server URL */
  httpProxy: z.string().optional(),
  /** HTTPS proxy server URL */
  httpsProxy: z.string().optional(),
  /** Comma-separated list of hosts to bypass proxy */
  noProxy: z.string().optional(),
});

export type ProxyConfig = z.infer<typeof proxyConfigSchema>;

// ── Main Talos Config ─────────────────────────────────────────────────────

export const talosConfigSchema = z.object({
  /** Whether Talos module is enabled */
  enabled: z.boolean().default(true),
  /** Vector database configuration */
  vectorDb: vectorDbConfigSchema.default(vectorDbConfigSchema.parse({})),
  /** Embedding configuration */
  embedding: embeddingConfigSchema.default(embeddingConfigSchema.parse({})),
  /** Test runner configuration */
  runner: runnerConfigSchema.default(runnerConfigSchema.parse({})),
  /** Self-healing configuration */
  healing: healingConfigSchema.default(healingConfigSchema.parse({})),
  /** Test generator configuration */
  generator: generatorConfigSchema.default(generatorConfigSchema.parse({})),
  /** Export configuration */
  export: exportConfigSchema.default(exportConfigSchema.parse({})),
  /** Artifacts configuration */
  artifacts: artifactsConfigSchema.default(artifactsConfigSchema.parse({})),
  /** Discovery configuration */
  discovery: discoveryConfigSchema.default(discoveryConfigSchema.parse({})),
  /** GitHub MCP configuration */
  githubMcp: githubMcpConfigSchema.default(githubMcpConfigSchema.parse({})),
  /** M365 Copilot integration configuration */
  m365: m365ConfigSchema.default(m365ConfigSchema.parse({})),
  /** Corporate proxy configuration */
  proxy: proxyConfigSchema.default(proxyConfigSchema.parse({})),
  /** JDBC data source configuration */
  jdbcDataSources: z.array(jdbcDataSourceConfigSchema).default([]),
  /** Atlassian (Jira + Confluence) integration configuration */
  atlassian: atlassianConfigSchema.default(atlassianConfigSchema.parse({})),
  /** Orchestration configuration (session vs task mode) */
  orchestration: orchestrationConfigSchema.default(orchestrationConfigSchema.parse({})),
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
