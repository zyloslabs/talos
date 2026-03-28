/**
 * Talos: Test Automation & Logic Orchestration System
 *
 * Domain types for Talos test applications, tests, runs, artifacts, and vault roles.
 */

// ── Application ───────────────────────────────────────────────────────────────

export type TalosApplicationStatus = "active" | "archived" | "pending";

export type TalosApplication = {
  id: string;
  name: string;
  description: string;
  repositoryUrl: string;
  /** GitHub PAT reference in vault (e.g., "vault:github-pat-myapp") */
  githubPatRef: string | null;
  baseUrl: string;
  status: TalosApplicationStatus;
  /** Whether mTLS is enabled for this application */
  mtlsEnabled: boolean;
  /** mTLS configuration (vault references for certs/keys) */
  mtlsConfig: MtlsApplicationConfig | null;
  /** GitHub repository URL where tests were last exported */
  exportRepoUrl?: string | null;
  /** JSON metadata for custom fields */
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

/** mTLS configuration stored per application */
export type MtlsApplicationConfig = {
  clientCertVaultRef?: string;
  clientKeyVaultRef?: string;
  caVaultRef?: string;
  pfxVaultRef?: string;
  passphrase?: string;
};

export type CreateApplicationInput = {
  name: string;
  description?: string;
  repositoryUrl?: string;
  githubPatRef?: string;
  baseUrl?: string;
  mtlsEnabled?: boolean;
  mtlsConfig?: MtlsApplicationConfig;
  metadata?: Record<string, unknown>;
};

export type UpdateApplicationInput = Partial<
  Pick<
    TalosApplication,
    | "name"
    | "description"
    | "repositoryUrl"
    | "githubPatRef"
    | "baseUrl"
    | "status"
    | "mtlsEnabled"
    | "mtlsConfig"
    | "exportRepoUrl"
    | "metadata"
  >
>;

// ── Test ──────────────────────────────────────────────────────────────────────

export type TalosTestStatus = "draft" | "active" | "disabled" | "archived";
export type TalosTestType = "e2e" | "smoke" | "regression" | "accessibility" | "unit";

export type TalosTest = {
  id: string;
  applicationId: string;
  name: string;
  description: string;
  type: TalosTestType;
  /** The Playwright test code */
  code: string;
  /** Semantic version (e.g., "1.0.0") */
  version: string;
  status: TalosTestStatus;
  /** Page Object Model dependencies */
  pomDependencies: string[];
  /** Target selectors extracted from code */
  selectors: string[];
  /** Embedding vector for RAG retrieval */
  embeddingId: string | null;
  /** Confidence score from AI generation (0-1) */
  generationConfidence: number | null;
  /** Hash of the code for change detection */
  codeHash: string;
  /** Tags for categorization */
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateTestInput = {
  applicationId: string;
  name: string;
  description?: string;
  type: TalosTestType;
  code: string;
  version?: string;
  pomDependencies?: string[];
  selectors?: string[];
  generationConfidence?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
};

export type UpdateTestInput = Partial<
  Pick<
    TalosTest,
    | "name"
    | "description"
    | "type"
    | "code"
    | "version"
    | "status"
    | "pomDependencies"
    | "selectors"
    | "generationConfidence"
    | "tags"
    | "metadata"
    | "updatedAt"
  >
>;

// ── Test Run ──────────────────────────────────────────────────────────────────

export type TalosTestRunStatus = "queued" | "running" | "passed" | "failed" | "skipped" | "cancelled";
export type TalosTestRunTrigger = "manual" | "scheduled" | "ci" | "healing" | "test" | "healing-verification";

export type TalosTestRun = {
  id: string;
  applicationId: string;
  testId: string;
  status: TalosTestRunStatus;
  trigger: TalosTestRunTrigger;
  /** Alias for trigger (for compatibility) */
  triggeredBy: TalosTestRunTrigger;
  /** Browser used for this run */
  browser: string;
  /** Environment (e.g., 'local', 'staging', 'production') */
  environment: string;
  /** Duration in milliseconds */
  durationMs: number | null;
  /** Error message if failed */
  errorMessage: string | null;
  /** Stack trace if failed */
  errorStack: string | null;
  /** Retry attempt number (0 = first attempt) */
  retryAttempt: number;
  /** Vault role used for credentials */
  vaultRoleId: string | null;
  /** Task ID if run via background task */
  taskId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
};

export type CreateTestRunInput = {
  applicationId?: string;
  testId: string;
  trigger?: TalosTestRunTrigger;
  triggeredBy?: TalosTestRunTrigger;
  browser?: string;
  environment?: string;
  vaultRoleId?: string;
  taskId?: string;
  metadata?: Record<string, unknown>;
};

export type UpdateTestRunInput = Partial<
  Pick<
    TalosTestRun,
    "status" | "durationMs" | "errorMessage" | "errorStack" | "retryAttempt" | "startedAt" | "completedAt" | "metadata"
  >
>;

// ── Test Artifact ─────────────────────────────────────────────────────────────

export type TalosArtifactType = "screenshot" | "video" | "trace" | "log" | "report" | "diff";

export type TalosTestArtifact = {
  id: string;
  testRunId: string;
  type: TalosArtifactType;
  /** File path relative to artifacts directory */
  filePath: string;
  /** MIME type */
  mimeType: string;
  /** File size in bytes */
  sizeBytes: number;
  /** Optional step or action name */
  stepName: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
};

export type CreateArtifactInput = {
  testRunId: string;
  type: TalosArtifactType;
  filePath: string;
  mimeType: string;
  sizeBytes: number;
  stepName?: string;
  metadata?: Record<string, unknown>;
};

// ── Vault Role ────────────────────────────────────────────────────────────────

export type TalosVaultRoleType = "admin" | "standard" | "guest" | "service" | "user";

export type TalosVaultRole = {
  id: string;
  applicationId: string;
  roleType: TalosVaultRoleType;
  name: string;
  description: string;
  /** Vault secret reference for username */
  usernameRef: string;
  /** Vault secret reference for password */
  passwordRef: string;
  /** Additional credential refs (e.g., MFA secret) */
  additionalRefs: Record<string, string>;
  /** Whether this role is currently active */
  isActive: boolean;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateVaultRoleInput = {
  applicationId: string;
  roleType: TalosVaultRoleType;
  name: string;
  description?: string;
  usernameRef: string;
  passwordRef: string;
  additionalRefs?: Record<string, string>;
  metadata?: Record<string, unknown>;
};

export type UpdateVaultRoleInput = Partial<
  Pick<
    TalosVaultRole,
    "name" | "description" | "usernameRef" | "passwordRef" | "additionalRefs" | "isActive" | "metadata"
  >
>;

// ── RAG Types ─────────────────────────────────────────────────────────────────

export type TalosChunkType =
  | "code"
  | "test"
  | "documentation"
  | "config"
  | "schema"
  | "requirement"
  | "api_spec"
  | "user_story";

/** Link to a related artifact (test, requirement, etc.) */
export type ArtifactLink = {
  artifactType: string;
  artifactId: string;
};

export type TalosChunk = {
  id: string;
  applicationId: string;
  type: TalosChunkType;
  content: string;
  filePath: string;
  startLine: number;
  endLine: number;
  /** Hash for deduplication */
  contentHash: string;
  metadata: Record<string, unknown>;
  /** Source document identifier */
  docId?: string;
  /** Version of the source document */
  sourceVersion?: string;
  /** Confidence score (0-1) for auto-generated chunks */
  confidence?: number;
  /** Categorisation tags */
  tags?: string[];
  /** Links to related artifacts */
  links?: ArtifactLink[];
  createdAt: Date;
};

export type CreateChunkInput = {
  applicationId: string;
  type: TalosChunkType;
  content: string;
  filePath: string;
  startLine?: number;
  endLine?: number;
  contentHash: string;
  metadata?: Record<string, unknown>;
  docId?: string;
  sourceVersion?: string;
  confidence?: number;
  tags?: string[];
  links?: ArtifactLink[];
};

export type UpdateChunkInput = Partial<
  Pick<TalosChunk, "content" | "contentHash" | "metadata" | "docId" | "sourceVersion" | "confidence" | "tags" | "links">
>;

// ── Discovery Types ───────────────────────────────────────────────────────────

export type DiscoveryStatus = "pending" | "running" | "completed" | "failed";

export type DiscoveryJob = {
  id: string;
  applicationId: string;
  status: DiscoveryStatus;
  /** Files discovered */
  filesDiscovered: number;
  /** Files indexed */
  filesIndexed: number;
  /** Chunks created */
  chunksCreated: number;
  errorMessage: string | null;
  createdAt: Date;
  completedAt: Date | null;
};

// ── Healing Types ─────────────────────────────────────────────────────────────

export type HealingStatus =
  | "pending"
  | "analyzing"
  | "healing"
  | "completed"
  | "failed"
  | "rejected"
  | "succeeded"
  | "in-progress";

export type HealingAttempt = {
  id: string;
  testRunId: string;
  testId: string;
  status: HealingStatus;
  /** Original error from test run */
  originalError: string;
  /** AI analysis of the failure (stored as JSON) */
  analysis: unknown;
  /** Proposed fix */
  proposedFix: string | null;
  /** Confidence score for the fix (0-1) */
  confidence: number | null;
  /** Whether fix was auto-applied (confidence >= threshold) */
  autoApplied: boolean;
  /** Whether fix was approved by human */
  humanApproved: boolean | null;
  /** Result after applying fix */
  healingResult: string | null;
  /** Timestamp of attempt */
  timestamp: Date;
  /** Generated fixes (stored as JSON) */
  fixes: unknown[];
  /** Applied fix (stored as JSON) */
  appliedFix: unknown;
  /** Verification run ID */
  verificationRunId: string | null;
  /** Error message */
  error: string | null;
  createdAt: Date;
  completedAt: Date | null;
};

// ── Generator Types ───────────────────────────────────────────────────────────

export type GenerationStatus = "pending" | "generating" | "reviewing" | "completed" | "failed";

export type TestGenerationJob = {
  id: string;
  applicationId: string;
  status: GenerationStatus;
  /** User prompt or automatic trigger description */
  prompt: string;
  /** Retrieved context chunks used for generation */
  contextChunkIds: string[];
  /** Generated test ID (if successful) */
  generatedTestId: string | null;
  /** Generation confidence score */
  confidence: number | null;
  /** Requires human review before activation */
  requiresReview: boolean;
  errorMessage: string | null;
  createdAt: Date;
  completedAt: Date | null;
};

// ── Export Types ──────────────────────────────────────────────────────────────

export type ExportFormat = "playwright" | "standalone" | "json" | "zip" | "file" | "directory" | "single-file";
export type ExportPlatform = "macos" | "windows" | "linux";

export type TestExport = {
  id: string;
  applicationId: string;
  testIds?: string[];
  format: ExportFormat;
  platform?: ExportPlatform;
  /** Output directory path */
  outputPath: string;
  /** Whether credentials are sanitized */
  credentialsSanitized?: boolean;
  /** Export package size in bytes */
  sizeBytes?: number;
  /** Number of tests in export */
  testCount?: number;
  createdAt: Date;
};

// ── Stored Types (SQLite row shapes) ──────────────────────────────────────────

export type StoredApplication = {
  id: string;
  name: string;
  description: string;
  repository_url: string;
  github_pat_ref: string | null;
  base_url: string;
  status: string;
  mtls_enabled: number;
  mtls_config_json: string | null;
  export_repo_url: string | null;
  metadata_json: string;
  created_at: string;
  updated_at: string;
};

export type StoredTest = {
  id: string;
  application_id: string;
  name: string;
  description: string;
  type: string;
  code: string;
  version: string;
  status: string;
  pom_dependencies_json: string;
  selectors_json: string;
  embedding_id: string | null;
  generation_confidence: number | null;
  code_hash: string;
  tags_json: string;
  metadata_json: string;
  created_at: string;
  updated_at: string;
};

export type StoredTestRun = {
  id: string;
  application_id: string;
  test_id: string;
  status: string;
  trigger: string;
  browser: string;
  environment: string;
  duration_ms: number | null;
  error_message: string | null;
  error_stack: string | null;
  retry_attempt: number;
  vault_role_id: string | null;
  task_id: string | null;
  metadata_json: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

export type StoredArtifact = {
  id: string;
  test_run_id: string;
  type: string;
  file_path: string;
  mime_type: string;
  size_bytes: number;
  step_name: string | null;
  metadata_json: string;
  created_at: string;
};

export type StoredVaultRole = {
  id: string;
  application_id: string;
  role_type: string;
  name: string;
  description: string;
  username_ref: string;
  password_ref: string;
  additional_refs_json: string;
  is_active: number;
  metadata_json: string;
  created_at: string;
  updated_at: string;
};

// ── Acceptance Criteria Types ─────────────────────────────────────────────────

export type AcceptanceCriteriaStatus = "draft" | "approved" | "implemented" | "deprecated";

export type AcceptanceCriteriaScenario = {
  given: string;
  when: string;
  then: string;
};

export type TalosAcceptanceCriteria = {
  id: string;
  applicationId: string;
  requirementChunkId?: string;
  title: string;
  description: string;
  scenarios: AcceptanceCriteriaScenario[];
  preconditions: string[];
  dataRequirements: string[];
  nfrTags: string[];
  status: AcceptanceCriteriaStatus;
  confidence: number;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
};

export type CreateAcceptanceCriteriaInput = {
  applicationId: string;
  requirementChunkId?: string;
  title: string;
  description: string;
  scenarios?: AcceptanceCriteriaScenario[];
  preconditions?: string[];
  dataRequirements?: string[];
  nfrTags?: string[];
  status?: AcceptanceCriteriaStatus;
  confidence?: number;
  tags?: string[];
};

export type UpdateAcceptanceCriteriaInput = Partial<
  Pick<
    TalosAcceptanceCriteria,
    | "requirementChunkId"
    | "title"
    | "description"
    | "scenarios"
    | "preconditions"
    | "dataRequirements"
    | "nfrTags"
    | "status"
    | "confidence"
    | "tags"
  >
>;

export type StoredAcceptanceCriteria = {
  id: string;
  application_id: string;
  requirement_chunk_id: string | null;
  title: string;
  description: string;
  scenarios_json: string;
  preconditions_json: string;
  data_requirements_json: string;
  nfr_tags_json: string;
  status: string;
  confidence: number;
  tags_json: string;
  created_at: string;
  updated_at: string;
};

// ── Traceability Types ────────────────────────────────────────────────────────

export type CoverageStatus = "uncovered" | "partial" | "covered";

export type TraceabilityLink = {
  id: string;
  applicationId: string;
  requirementChunkId: string;
  acceptanceCriteriaId: string | null;
  testId: string | null;
  coverageStatus: CoverageStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateTraceabilityLinkInput = {
  applicationId: string;
  requirementChunkId: string;
  acceptanceCriteriaId?: string;
  testId?: string;
  coverageStatus?: CoverageStatus;
};

export type StoredTraceabilityLink = {
  id: string;
  application_id: string;
  requirement_chunk_id: string;
  acceptance_criteria_id: string | null;
  test_id: string | null;
  coverage_status: string;
  created_at: string;
  updated_at: string;
};

export type TraceabilityReport = {
  totalRequirements: number;
  coveredRequirements: number;
  totalCriteria: number;
  implementedCriteria: number;
  coveragePercentage: number;
  unmappedRequirements: string[];
  untestedCriteria: string[];
};

// ── Data Source Types ─────────────────────────────────────────────────────────

export type JdbcDriverType = "oracle" | "postgresql" | "mysql" | "sqlserver" | "sqlite" | "other";

export type TalosDataSource = {
  id: string;
  applicationId: string;
  label: string;
  driverType: JdbcDriverType;
  jdbcUrl: string;
  usernameVaultRef: string;
  passwordVaultRef: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateDataSourceInput = {
  applicationId: string;
  label: string;
  driverType: JdbcDriverType;
  jdbcUrl: string;
  usernameVaultRef: string;
  passwordVaultRef: string;
};

export type UpdateDataSourceInput = Partial<
  Pick<TalosDataSource, "label" | "driverType" | "jdbcUrl" | "usernameVaultRef" | "passwordVaultRef" | "isActive">
>;

export type StoredDataSource = {
  id: string;
  application_id: string;
  label: string;
  driver_type: string;
  jdbc_url: string;
  username_vault_ref: string;
  password_vault_ref: string;
  is_active: number;
  created_at: string;
  updated_at: string;
};

// ── Atlassian Config Types ────────────────────────────────────────────────────

export type AtlassianDeploymentType = "cloud" | "datacenter";

export type TalosAtlassianConfig = {
  id: string;
  applicationId: string;
  deploymentType: AtlassianDeploymentType;
  jiraUrl: string;
  jiraProject: string;
  jiraUsernameVaultRef: string;
  jiraApiTokenVaultRef: string;
  jiraPersonalTokenVaultRef: string;
  jiraSslVerify: boolean;
  confluenceUrl: string;
  confluenceSpaces: string[];
  confluenceUsernameVaultRef: string;
  confluenceApiTokenVaultRef: string;
  confluencePersonalTokenVaultRef: string;
  confluenceSslVerify: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateAtlassianConfigInput = {
  applicationId: string;
  deploymentType: AtlassianDeploymentType;
  jiraUrl?: string;
  jiraProject?: string;
  jiraUsernameVaultRef?: string;
  jiraApiTokenVaultRef?: string;
  jiraPersonalTokenVaultRef?: string;
  jiraSslVerify?: boolean;
  confluenceUrl?: string;
  confluenceSpaces?: string[];
  confluenceUsernameVaultRef?: string;
  confluenceApiTokenVaultRef?: string;
  confluencePersonalTokenVaultRef?: string;
  confluenceSslVerify?: boolean;
};

export type UpdateAtlassianConfigInput = Partial<
  Pick<
    TalosAtlassianConfig,
    | "deploymentType"
    | "jiraUrl"
    | "jiraProject"
    | "jiraUsernameVaultRef"
    | "jiraApiTokenVaultRef"
    | "jiraPersonalTokenVaultRef"
    | "jiraSslVerify"
    | "confluenceUrl"
    | "confluenceSpaces"
    | "confluenceUsernameVaultRef"
    | "confluenceApiTokenVaultRef"
    | "confluencePersonalTokenVaultRef"
    | "confluenceSslVerify"
    | "isActive"
  >
>;

export type StoredAtlassianConfig = {
  id: string;
  application_id: string;
  deployment_type: string;
  jira_url: string;
  jira_project: string;
  jira_username_vault_ref: string;
  jira_api_token_vault_ref: string;
  jira_personal_token_vault_ref: string;
  jira_ssl_verify: number;
  confluence_url: string;
  confluence_spaces_json: string;
  confluence_username_vault_ref: string;
  confluence_api_token_vault_ref: string;
  confluence_personal_token_vault_ref: string;
  confluence_ssl_verify: number;
  is_active: number;
  created_at: string;
  updated_at: string;
};

// ── App Intelligence Types ────────────────────────────────────────────────────

export type TechStackCategory = "framework" | "library" | "language" | "build" | "test" | "lint" | "other";

export type TechStackItem = {
  name: string;
  version?: string;
  category: TechStackCategory;
  source: string;
};

export type DetectedDatabase = {
  type: string;
  connectionPattern: string;
  source: string;
  environment?: string;
};

export type DetectedTestUser = {
  variableName: string;
  source: string;
  roleHint?: string;
};

export type DetectedDocument = {
  filePath: string;
  type: "readme" | "api-spec" | "guide" | "contributing" | "changelog" | "other";
  title?: string;
};

export type DetectedConfigFile = {
  filePath: string;
  type: string;
};

export type AppIntelligenceReport = {
  id: string;
  applicationId: string;
  techStack: TechStackItem[];
  databases: DetectedDatabase[];
  testUsers: DetectedTestUser[];
  documentation: DetectedDocument[];
  configFiles: DetectedConfigFile[];
  scannedAt: Date;
};

export type StoredAppIntelligence = {
  id: string;
  application_id: string;
  report_json: string;
  scanned_at: string;
};
