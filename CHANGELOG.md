# Changelog

All notable changes to the Talos project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **GHE_PERSONAL_ACCESS_TOKEN support for GitHub Enterprise discovery**: Discovery engine now checks `GHE_PERSONAL_ACCESS_TOKEN` first for non-github.com repo hosts and falls back to `GITHUB_PERSONAL_ACCESS_TOKEN`. Exposed as a configurable env var in Admin > Environment Variables.

### Fixed

- **Discovery race condition — fire-and-forget returns zero counts** (#447): `DiscoveryEngine.startDiscovery()` now `await`s the full discovery run instead of detaching with `.catch()`. The returned `DiscoveryJob` contains real `filesDiscovered`, `filesIndexed`, and `chunksCreated` values. An optional `onProgress` callback streams per-file progress to callers. The `/api/talos/applications/:id/discover` endpoint passes this callback to emit `discovery:progress` Socket.IO events during the scan, giving the UI real-time file-level updates.
- **Criteria generator 503 on startup**: `CriteriaGenerator` was captured before async `initRag()` completed, leaving it undefined in the router closure. Router now uses a getter `() => criteriaGenerator` so it resolves lazily after initialization.
- **Jira/Confluence import HTTP errors show actionable detail**: Import endpoint now reads the Jira/Confluence JSON error body (`errorMessages`, `errors`, `message`) and surfaces it in the error response instead of the empty `statusText`.
- **Intelligence endpoint no longer returns 404 before first scan**: `GET /intelligence` returns `200 null` when no report exists (was `404`), eliminating console noise on every page load in the setup wizard.

- **Discovery endpoint wired to DiscoveryEngine** (#407): `POST /api/talos/applications/{id}/discover` now invokes the real `DiscoveryEngine`, runs `AppIntelligenceScanner` after discovery, and emits Socket.IO progress/complete/error events.
- **CriteriaGenerator instantiated on startup** (#406): `CriteriaGenerator` is now created when Copilot SDK is available and passed to criteria routes. 503 error messages are descriptive with configuration guidance.
- **Intelligence 404 no longer breaks step completion** (#408): `handleSelectApp` step detection now correctly treats a 404 intelligence response as "not started" rather than an error, and uses criteria count as an independent signal for Generate Criteria step completion.
- **AI mutation error handlers added** (#409): All AI-related `useMutation` hooks in the setup wizard now have `onError` callbacks that display inline error alerts with user-friendly messages, including specific guidance for 503 (Copilot config) and network errors.

### Security

- **Atlassian PAT fields masked** (#410): All token/PAT input fields in the Atlassian step now use `type="password"` to prevent plaintext exposure of secrets on screen.

### Added

- **GitHub Enterprise Support** (Epic #437): Discovery engine and API client now support GitHub Enterprise Server (GHE) alongside github.com.
  - **#438** — `parseRepoUrl` now handles any git host: `https://git.example.com/org/repo`, `git@ghe.corp.com:org/repo.git`, and shorthand `org/repo` (defaults to github.com). Returns `{ host, owner, repo }`.
  - **#439** — `GitHubApiClient` accepts a configurable `baseUrl` option (defaults to `https://api.github.com`). Static helper `apiBaseFromHost(host)` maps `github.com` → `https://api.github.com` and any other host → `https://{host}/api/v3`.
  - **#441** — Discovery engine wires the parsed host to the API client, so GHE repositories are discovered using the correct API endpoint.
  - **#443** — Unit tests for GHE URL parsing, custom API base URL, and PAT fallback logic.
  - **#444** — E2E Playwright test for the discovery step: verifies Start Discovery button, API call interception, and error display.
- **Pipeline Integration** (Epic #426): Wire discovery, intelligence, and Atlassian data through the RAG and generation pipelines.
  - **#431** — Discovery chunks are now indexed into the RAG vector store (LanceDB) after repository discovery completes. Progress events emitted via Socket.IO (`discovery:progress` with `phase: "indexing"`).
  - **#429** — App intelligence scan data (tech stack, databases, test users, documentation paths) is now fed to `PromptBuilder` and `CriteriaGenerator` for richer, context-aware test generation and acceptance criteria.
  - **#430** — New `POST /api/talos/applications/:id/atlassian/import` endpoint fetches Jira issues and Confluence pages, converts them to markdown, and ingests into RAG via `DocumentIngester`. "Import Data" button added to wizard Atlassian step with real-time Socket.IO progress.
  - **#427** — Test generation endpoint now logs which fallback path is used (`rag-backed`, `raw-copilot`, or `skeleton-template`) and includes `generationPath` in the API response.

### Changed

- **#440** — Discovery engine initialization no longer requires a Copilot token. If only `GITHUB_PERSONAL_ACCESS_TOKEN` is set, discovery works independently while the RAG pipeline remains disabled.
- **#442** — Setup wizard discovery step now shows the actual server error message (parsed from JSON response body) instead of generic "API error: 503 Service Unavailable". Troubleshooting hints are displayed when the error relates to PAT/initialization.
- **#432** — Renamed `GitHubMcpClient` → `GitHubApiClient` and `github-mcp-client.ts` → `github-api-client.ts` to accurately reflect that the class is a REST API client, not an MCP client.
- **#428** — Data Sources wizard step (Step 2) now shows a "Coming Soon" badge with disabled form fields, since JDBC support is not yet available. Users can skip to the next step.

### Fixed

- **Setup Wizard UX & Discovery** (Epic #412): Comprehensive validation, Socket.IO wiring, and UX polish across the setup wizard.
  - **#413** — Skip button in Atlassian step now uses `variant="outline"` consistently with all other Skip buttons in the wizard.
  - **#417** — Register App step: `Create Application` button now requires all three fields (name, repoUrl, baseUrl); inline URL format validation for `repositoryUrl` and `baseUrl` (must start with `http://` or `https://`); inline error display when the create API call fails.
  - **#414** — Upload Docs step: replaced boolean `isIngesting` with `ingestingCount` counter to correctly handle concurrent multi-file uploads — the Continue button now stays disabled until ALL in-flight ingestion requests complete, not just the last one to finish.
  - **#415** — Upload Docs step: Continue button label is now context-aware — "Skip This Step →" when no files are uploaded, "Continue (N file(s) uploaded)" when files are done, and a spinner while ingestion is in progress.
  - **#419** — Discovery step: no longer treats HTTP 200 as "complete". The step now subscribes to Socket.IO events (`discovery:progress`, `discovery:complete`, `discovery:error`) and shows real-time progress (phase, percentage, message). Completion state shows actual file/chunk counts. Events are filtered by `jobId` to avoid cross-app interference. A 5-minute timeout fires if no completion event arrives.
  - **#416** — Generate Tests step: added "Go to Test Library" navigation button after successful test generation, and a "Skip & Go to Test Library →" link so users can exit the wizard without generating tests.

### Added

- **Session Mode Orchestration** (Epic #391): Multi-agent orchestration with two execution modes — Session (~2 API calls via SDK subagent delegation) and Task (N+1 parallel background tasks).
  - `enableSubagents` and `customAgents` wired through `CopilotWrapper.chat()` to `@github/copilot-sdk` session creation (#392).
  - `CustomAgentDefinition` type with `name`, `displayName`, `description`, `prompt`, `tools?`, `infer?` fields (#392).
  - `getCustomAgents()` / `setCustomAgents()` on `CopilotWrapper` for runtime agent injection (#392).
  - `talos-orchestrate-agents` MCP tool: Zod-validated schema with `agents[]`, `aggregation_prompt?`, `timeout_seconds?`, `mode?`; session mode composes prompt and delegates via SDK; task mode fans out via `PlatformRepository.createTask()` (#393).
  - `talos-spawn-agent` MCP tool: single-agent dispatch that uses session mode when orchestration context is active, otherwise creates a background task (#394).
  - Module-level orchestration context setters (`setActiveOrchestrateContext` / `clearActiveOrchestrateContext` / `getActiveOrchestrateContext`) for cross-boundary context propagation (#395).
  - `orchestration.defaultMode` config option (`"task"` | `"session"`, default `"task"`) in `TalosConfig` Zod schema (#396).
  - Orchestration mode selector (Task/Session toggle) in the Workbench UI configure step (#397).
  - `orchestrationMode` field on `ScheduledJob` type and `scheduled_jobs` SQLite table with migration (#398).
  - Orchestration tools registered in server startup alongside existing testing tools (#399).
  - `GET /api/admin/copilot365/status` endpoint: checks if a Copilot365 MCP server is configured and returns `{ available, serverName, enabled }` (#400).
  - `copilot365:suggest-research` Socket.IO event emitted on application creation when Copilot365 is available, enabling UI prompts for M365 document ingestion (#401).
  - `getCopilot365Status()` API client function in `ui/lib/api.ts` (#401).
  - Agent Orchestration section in `docs/ARCHITECTURE.md` with session/task mode diagrams, context propagation, and Copilot365 integration (#402).
  - Agent Orchestration section and Copilot365 Integration docs in `docs/USER_GUIDE.md` (#403).

- **App Intelligence** (Epic #379): Automated repository analysis that detects tech stack, databases, test users, and documentation from config files — no AI required, pure regex/string matching.
  - `AppIntelligenceReport` type and Zod schema with `techStack`, `databases`, `testUsers`, `documentation`, and `configFiles` arrays (#380).
  - Tech Stack Detector: parses `package.json`, `pom.xml`, `build.gradle`, `requirements.txt`, `go.mod`, `Cargo.toml`, `Gemfile` and maps dependencies to known frameworks/libraries (#381).
  - Database Connection Scanner: regex-based detection of JDBC URLs, PostgreSQL/MySQL/MongoDB connection strings in `.env*` files, Docker Compose DB services, ORM configs (`schema.prisma`, `ormconfig.ts`, Django `DATABASES`) (#382).
  - Test User Scanner: detects test credential patterns (`TEST_USER_*`, `ADMIN_*`, `E2E_*`, `SEED_*`) in `.env` files, and Playwright config patterns (`globalSetup`, `storageState`, `httpCredentials`) (#383).
  - Documentation Collector: identifies READMEs, `docs/**/*.md`, OpenAPI/Swagger specs, CONTRIBUTING.md, CHANGELOG.md from the file tree (#384).
  - `talos_app_intelligence` SQLite table with `report_json` column for persisting intelligence reports per application, including cascade delete (#385).
  - `AppIntelligenceScanner` orchestrator class that coordinates all 4 detectors against a GitHub file tree with content fetching (#386).
  - Discovery Engine integration: `POST /api/talos/applications/:appId/intelligence/refresh` triggers a full scan (#387).
  - API endpoints: `GET /api/talos/applications/:appId/intelligence` and `POST /api/talos/applications/:appId/intelligence/refresh` (#388).
  - App Intelligence UI panel (`ui/components/talos/app-intelligence-panel.tsx`): tech stack badges grouped by category, detected databases with "Configure" action, test user references with "Create Vault Role" action, documentation inventory with type icons, and "Scan/Rescan" button (#389).

- **GitHub Export** (Epic #354): Push AI-generated Playwright test suites from Talos to a user-chosen GitHub repository.
  - `exportRepoUrl` field added to `TalosApplication` type and `talos_applications` SQLite table via idempotent `ALTER TABLE` migration (#366).
  - `GitHubExportService` (`src/talos/export/github-export-service.ts`): wraps the GitHub REST API to ensure a repo exists, create it if needed (`POST /user/repos`), and push files with SHA-based conflict-free updates (#367).
  - `POST /api/talos/applications/:appId/export-to-github` endpoint: orchestrates `ExportEngine` + `GitHubExportService`, resolves PAT from request body / `GITHUB_TOKEN` env, saves `exportRepoUrl`, and emits `export:complete` via Socket.IO (#368).
  - `GET /api/talos/applications/:appId/export-info` endpoint: returns `exportRepoUrl` and `lastExportedAt` (#368).
  - `GitHubExportDialog` component (`ui/components/talos/github-export-dialog.tsx`): dialog with target repo, branch, and create-if-not-exists fields. Shows success with a "View on GitHub" link after export (#369).
  - Export to GitHub button added to the Test Library toolbar (visible when a specific app is selected); export info bar shows the last exported repository when available (#369, #370).
- **Monaco Editor + AI Test Explanation** (Epic C, #355): Replaced `react-syntax-highlighter` with Monaco Editor (the VS Code engine) for viewing and editing test code, and added an AI-powered "Explain Test" side panel powered by GitHub Copilot.
  - Installed `@monaco-editor/react` with SSR-safe dynamic import via `ui/components/talos/lazy-monaco.tsx` (#371).
  - `useMonacoTheme()` hook in `ui/lib/monaco.ts` that returns `"vs-dark"` or `"vs"` based on the active theme (#371).
  - `TestCodeViewer` component (`ui/components/talos/test-code-viewer.tsx`) with Monaco Editor, read-only mode with Edit/Save/Cancel toggle, Cmd+S shortcut, selection-change callback, line count display, and TypeScript syntax highlighting (#372).
  - `TestExplainPanel` component (`ui/components/talos/test-explain-panel.tsx`) — collapsible AI explanation panel with "Explain Test" and "Explain Selection" buttons, loading skeletons, and error handling (#374).
  - `POST /api/talos/tests/:id/explain` endpoint accepts optional `selection` body field; streams explanation from GitHub Copilot with fallback when Copilot is not configured (#373).
  - `updateTest` and `explainTest` functions added to `ui/lib/api.ts` (#375).
  - `TestMatrix` code viewer dialog replaced with two-panel layout: Monaco-based `TestCodeViewer` (left) + `TestExplainPanel` (right), mobile-responsive via `flex-col md:flex-row` (#375).
  - `Skeleton` UI component added at `ui/components/ui/skeleton.tsx` (#374).
- **Wire Real Talos Pipeline — DiscoveryEngine, RAG, TestGenerator, PlaywrightRunner** (Epic #353): All pipeline engines are now instantiated at startup and wired into orchestration for end-to-end test generation and execution.
  - `SdkAttachment` type and `attachments?: SdkAttachment[]` option in `CopilotWrapper.chat()` for passing file context into LLM requests (#357).
  - `getGithubToken()` method on `CopilotWrapper` exposing the authenticated GitHub PAT for use by downstream services (e.g., GitHub Models embeddings) (#357).
  - GitHub Models REST API embedding provider (`github-models`) in `EmbeddingService` with batch support; `EmbeddingConfig.provider` defaults to `"github-models"` (#358).
  - `initRag()` server startup function instantiates `RagPipeline`, `DiscoveryEngine`, `PlaywrightRunner`, and `TestGenerator` and wires them into the application engines map (#359).
  - Orchestration pipeline `discover` step calls `DiscoveryEngine.startDiscovery()` to crawl the application repository (#360).
  - Orchestration pipeline `index` step passes discovered chunks through `RagPipeline.indexChunks()` (#361).
  - Orchestration pipeline `generate` step calls `TestGenerator.generate()` (RAG-backed) to produce Playwright test code (#362).
  - Orchestration pipeline `execute` step calls `PlaywrightRunner.executeTest()` for each generated test and persists results (#363).
  - `/api/talos/tests/generate` endpoint uses `TestGenerator` when the RAG pipeline is available, with a Copilot-only fallback for environments without GitHub Models (#364).
  - Integration smoke tests (`orchestration.test.ts`) covering all four pipeline steps with mocked engines, verifying DB writes, Socket.IO events, and fallback paths (#365).

- **Admin Panel Overhaul — MCP Server Management** (Epic #343): Redesigned MCP server management with preset-based provisioning, multi-instance support, and categorized server views.
  - Admin sidebar navigation now uses controlled `SectionCard` with programmatic open/close, replacing hash-based `<a>` links with `<button>` elements and `scrollIntoView` (#344).
  - New `McpPanel` component (`ui/components/talos/mcp-panel.tsx`) extracted from inline admin code with 9 built-in MCP presets: GitHub Cloud, GitHub Enterprise, JDBC, AWS API, Docker, Atlassian, Salesforce, Context7, and Playwright (#345).
  - Multi-instance support for JDBC and Salesforce presets with auto-generated unique names and per-instance credential editing (#346).
  - Backend `mcp_servers` schema extended with `category TEXT` and `tags_json TEXT` columns; v3 migration adds columns to existing tables without data loss (#347).
  - `McpServerConfig`, `CreateMcpServerInput`, `StoredMcpServer`, and UI `McpServer` types extended with `category` and `tags` fields (#347, #348).
  - Server cards grouped by category (GitHub, JDBC, Cloud, DevTools, Collaboration) with inline enable/disable toggle, expand/collapse details, and environment variable editing (#345, #346).
  - Unit tests for category/tags CRUD and v3 migration covering creation defaults, update preservation, and legacy database migration (#349).

- **JDBC Database Data Sources & Atlassian Integration** (Epic #328): Connect to external databases and Atlassian tools as supplementary context sources for test generation.
  - JDBC data source config schema (`jdbcDataSourceConfigSchema`) and Atlassian config schema (`atlassianConfigSchema`) with Zod validation (#329).
  - `TalosDataSource` and `TalosAtlassianConfig` domain types with full Create/Update input and SQLite stored row types (#329).
  - `talos_data_sources` and `talos_atlassian_configs` SQLite tables with migrations, indexes, and full CRUD methods on `TalosRepository` (#330, #331).
  - `DockerMcpManager` class: start/stop/track Docker containers for JDBC (jbang) and Atlassian MCP servers with resource limits and shutdown hooks (#332).
  - JDBC MCP tools: `talos_db_query` (read-only SQL with injection guard), `talos_db_describe`, `talos_db_list_tables` (#333).
  - Atlassian MCP tools: `talos_jira_search` (JQL auto-scoped to project), `talos_confluence_search` (CQL auto-scoped to spaces) (#334).
  - REST API endpoints for data sources and Atlassian config CRUD under `/api/talos/applications/:appId/data-sources` and `/api/talos/applications/:appId/atlassian` (#335).
  - Setup Wizard new steps: "Data Sources" (step 2) and "Atlassian" (step 3) with multi-source support, driver selection, and connection testing (#336, #337).
  - Settings UI panels: `DataSourceSettings` and `AtlassianSettings` components for managing integrations on existing applications (#338, #339).
  - RAG Knowledge Base integration: `ingestSchemaData()` and `ingestAtlassianContent()` methods on `DocumentIngester` for auto-ingesting database schemas and Jira/Confluence content (#340).
  - Auto-tagger extended with `database`, `schema`, `jira`, `confluence` functional area categories (#340).
  - Architecture and User Guide documentation updated with new Integration module, updated wizard steps, and configuration reference (#341).

- **Microsoft 365 Copilot Integration** (Epic #310): Search, fetch, and convert M365 documents from within Talos.
  - M365 config schema (`m365ConfigSchema`) with URL, browser data dir, docs dir, and MFA timeout settings (#317).
  - `BrowserAuth` class: Playwright persistent-context authentication with MFA support and corporate proxy passthrough (#313).
  - `CopilotScraper` class: Lexical editor manipulation, model selection, result extraction, and SharePoint SSO file download (#313).
  - `EphemeralStore` class: path-traversal-safe file storage for downloaded M365 documents (#313).
  - `parseFile` router: converts DOCX (mammoth), PDF (pdf-parse), XLSX (ExcelJS), and PPTX (officeparser) to Markdown (#313).
  - M365 session lifecycle: background browser initialization and graceful shutdown in server entry point (#315).
  - M365 REST API routes (`/api/talos/m365`): POST /search, POST /fetch, GET /status, POST /cleanup, POST /convert (#316).
  - Setup Wizard M365 tab: search M365 documents, select results, fetch and ingest into RAG knowledge base (#318).

- **Corporate Proxy Support** (Epic #312): Route outbound traffic through an enterprise HTTP/HTTPS proxy.
  - Proxy config schema (`proxyConfigSchema`) with enabled flag, HTTP/HTTPS proxy URLs, and no-proxy list (#322).
  - Automatic `HTTP_PROXY`, `HTTPS_PROXY`, and `NO_PROXY` env var application from config on server start (#321).
  - Network / Proxy admin UI panel with proxy settings, enable/disable toggle, and connection test button (#320).

- **Playwright mTLS Authentication** (Epic #311): Mutual TLS client certificate support for test execution.
  - mTLS config schema (`mtlsConfigSchema`) with vault refs for client cert, key, CA, PFX, and passphrase (#323).
  - `TalosApplication` extended with `mtlsEnabled` and `mtlsConfig` fields; SQLite migration for new columns (#323).
  - `PlaywrightRunner` passes `clientCertificates` to browser context when mTLS is enabled for the application (#325).
  - Setup Wizard mTLS toggle: enable mTLS per application with vault reference fields for certificates (#324).

- **Open Source Release**: Added `README.md`, `LICENSE.md` (FSL-1.1-MIT), `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, and `SECURITY.md`. Removed `"private": true` from `package.json`. Updated `.gitignore` to exclude log files, build output, and OS artifacts.

- **Knowledge Base Enhancement** (Epic #276): New `src/talos/knowledge/` module for requirements document ingestion and knowledge-base auto-tagging.
  - Extended `TalosChunk` type with new chunk types (`requirement`, `api_spec`, `user_story`) and optional metadata fields (`docId`, `sourceVersion`, `confidence`, `tags`, `links`) (#281).
  - `DocumentIngester` class: ingests Markdown and OpenAPI (JSON/YAML) documents into the RAG knowledge base with semantic section chunking, 10-15% overlap, and stable chunk IDs (#282).
  - `AutoTagger` class: NLP-heuristic auto-tagging with controlled vocabulary for personas, NFR keywords, environments, and functional areas (#283).
  - Hybrid search (`VectorStore.hybridSearch`): combines vector similarity with keyword boosting and metadata filtering (types, tags, docType, persona, minConfidence). Exposed via `RagPipeline.retrieveWithFilters()` (#284).
- **Acceptance Criteria System** (Epic #277): AI-powered acceptance criteria generation, management, and requirements traceability.
  - `TalosAcceptanceCriteria` data model with Given/When/Then scenarios, NFR tags, confidence scores, and full CRUD in `TalosRepository` (#285).
  - `CriteriaGenerator` class: RAG-powered LLM generation of structured acceptance criteria from ingested requirements, with bulk generation and single-criterion AI-suggest (#286).
  - Requirements Traceability Matrix (RTM): `talos_traceability` table linking requirements → criteria → tests, with coverage reporting, unmapped requirements, and untested criteria queries (#287).
  - REST API for criteria management (`/api/talos/criteria`): CRUD endpoints, bulk AI generation, AI-suggest, and traceability report — all inputs validated with Zod schemas (#288).
- **MCP Tools for Knowledge & Criteria** (Epic #280): Seven new MCP tool definitions in `src/talos/tools.ts` exposing the knowledge base and criteria subsystem to AI agents.
  - `talos_ingest_document`: Ingest Markdown/OpenAPI documents into the RAG knowledge base via `DocumentIngester` (#297).
  - `talos_generate_criteria`: AI-powered acceptance criteria generation from knowledge base via `CriteriaGenerator` (#298).
  - `talos_get_traceability`: Requirements traceability report (coverage %, unmapped requirements, untested criteria) via `TalosRepository.getCoverageReport()` (#299).
  - Criteria CRUD tools — `talos_create_criteria`, `talos_update_criteria`, `talos_list_criteria`, `talos_delete_criteria` — with full Zod validation and appropriate risk levels (#300).
- **Testing Agents & Skills** (Epic #279): Agent definitions and skill workflows for the autonomous testing pipeline.
  - Test Orchestrator agent: coordinates the full testing lifecycle — ingest requirements → generate criteria → generate tests → execute → heal → report (#293).
  - Test Planner skill: analyzes requirements and codebase to create a prioritized test plan with risk-based prioritization, test type recommendations, and coverage gap analysis (#294).
  - Criteria Generator skill: converts ingested requirements into structured Given/When/Then acceptance criteria using RAG-powered LLM prompts with few-shot examples, confidence scoring, and auto-tagging (#295).
  - Test Reviewer skill: reviews generated tests against acceptance criteria for scenario coverage, assertion completeness, POM compliance, and accessible locator usage (#296).
- **Setup Wizard** (Epic #278): Multi-step guided test configuration wizard in the UI.
  - Setup Wizard component (`/talos/setup`): 7-step guided workflow — Register App → Upload Docs → Vault Roles → Discovery → Generate Criteria → Review Criteria → Generate Tests — with progress bar and step navigation (#289).
  - Document upload step: file selection for Markdown/OpenAPI, document type selector, client-side ingestion with chunk count reporting (#290).
  - Criteria generation and review steps: AI bulk generation with confidence stats, criteria review with Given/When/Then display, approve/reject actions, and AI-suggest for new criteria (#291).
  - Test generation step: generates Playwright tests from approved criteria with traceability stats and coverage summary (#292).
  - Acceptance criteria API client functions added to `ui/lib/api.ts` for all criteria endpoints.
  - "Setup" tab added to NavTabs navigation.
- **Document Ingestion API Endpoint**: Added `POST /api/talos/applications/:appId/ingest` backend route for the Setup Wizard's document upload step.
- **Prebuilt Testing Agents & Skills**: Test Orchestrator agent, Test Planner, Criteria Generator, and Test Reviewer skills are now seeded into the app's database on startup — available in the Agents and Skills pages out of the box.

### Fixed

- **Duplicate Navigation Menus**: Removed redundant `NavTabs` rendering from 7 pages (skills, agents, library, scheduler, tasks, workbench, talos layout). The root layout's `NavBar` is now the single navigation across the entire app.
- **Setup Wizard not accessible**: Added Setup Wizard to the NavBar's Testing dropdown menu so it's discoverable from any page.
- **Copilot SDK `onPermissionRequest`** (#256): `createSession` now passes `approveAll` (imported from `@github/copilot-sdk`) as `onPermissionRequest`, resolving the root cause of chat sessions failing with permission errors.
- **Tool wiring via `defineTool`** (#257): Talos tools from `src/talos/tools.ts` are now wrapped with `defineTool()` and passed to every SDK session. `ChatOptions` gains a `tools?: ToolDefinition[]` parameter. Tool handlers emit `tool:call` events and surface errors gracefully.
- **`listModels()` + `modelSupportsReasoning()`** (#258): Model listing now guards against `startFailed` (throws a clear error instead of hanging). Model capabilities are cached after the first `listModels()` call. `reasoningEffort` is only forwarded to sessions whose model actually supports it — non-reasoning models (gpt-4.1, claude-sonnet-4, etc.) no longer receive the parameter.

### Changed

- **Dependency Upgrades Round 2** (Epic #302): Consolidated upgrades from 11 Dependabot PRs.
  - `typescript-eslint` 8.57.1 → 8.57.2 (root devDep — patch)
  - `vite` 8.0.1 → 8.0.2 (root + ui devDep — patch)
  - `vitest` 4.1.0 → 4.1.1 (ui devDep — patch)
  - `@tanstack/react-query` 5.95.0 → 5.95.2 (ui — patch)
  - `lucide-react` 0.577.0 → 1.6.0 (ui — major, no code changes needed — no brand icons used)
  - `zod` 3.25.76 → 4.3.6 (root — major, error customization API unified; our schemas remained compatible)
  - `typescript` 5.8.x → 6.0.2 (root + ui — major, added `"types": ["node"]` to root tsconfig)
  - **Skipped**: ESLint 10 upgrade deferred — `eslint-plugin-react` not yet compatible (tracked upstream at #3977, #3979)

- **Root layout** (#259): Font switched from Inter to Space Grotesk (matching OpenZigs). `NavBar` added to root layout. Footer added. Body grid uses `auto 1fr auto` row template.
- **Color palette** (#260): CSS variables updated to the stone/ink/ember/tide token set from OpenZigs. Border radius bumped to `0.75rem`. Selection highlight updated to ember (`hsla(16, 100%, 59%, 0.3)`).
- **NavBar** (#261): Replaced flat `NavTabs` header with OpenZigs-style sticky `NavBar` featuring dropdown groups (Testing, Automation, Admin), active-route highlights, and `ModeToggle`.
- **Admin page layout** (#262): Admin page now uses a centered `max-w-6xl` container with a hero header (uppercase label, large title, description). `NavTabs` removed from admin and chat pages.

### Added

- **Comprehensive Test Suite** (PR #234): 375 tests across 26 test files achieving 80.77% statement coverage / 84.07% line coverage. Covers all Talos subsystems: repository, config, tools, discovery engine, RAG pipeline, vector store, embedding service, test generator, healing engine, failure analyzer, fix generator, code validator, credential injector/sanitizer, file chunker, artifact manager, playwright runner, export engine, package builder, GitHub MCP client, admin API, orchestration endpoints, copilot wrapper, and environment manager.
- **Token-Based Auth** (#240): CopilotWrapper now accepts `githubToken` option for API key authentication, with support for `GITHUB_TOKEN` and `COPILOT_GITHUB_TOKEN` environment variables.
- **Auth Connectivity Test** (#241): `GET /api/admin/auth/test` endpoint to verify GitHub Copilot SDK connection by calling `listModels()`.
- **Auth Panel Redesign** (#242): Admin auth panel updated for API key mode with "Test Connection" button, environment variable status, and auth mode reporting.
- **AI Enhance Bar** (#244, #245, #246): Reusable `AiEnhanceBar` component with inline model picker and "AI Enhance" button. Integrated across Skills, Library, Workbench, and Admin personality editors. Backend `POST /api/admin/ai/enhance` endpoint with Zod validation.
- **Inline Model Picker** (#244): Reusable `InlineModelPicker` select component fetching available models from the API.
- **Agent Orchestration** (Epic #237): Full agent management system with SQLite-backed CRUD, skill assignments, parent-child relationships, and tool whitelists.
  - Agent schema (#247): `agents` and `agent_skills` tables with migration, `toAgent` converter, and all repository CRUD methods.
  - Agent API (#248): REST endpoints for agent CRUD (`GET/POST/PUT/DELETE /api/admin/agents`), skill management (`GET/PUT /agents/:id/skills`).
  - Agent List Page (#249): Grid view with search/filter, skeleton loading states, enable/disable toggle, and edit/delete actions.
  - Agent Form (#250): Create/edit form with persona editor (AiEnhanceBar), tool whitelist, parent agent picker, and skill assignment toggles.
- **Skills Redesign** (#251): Added `requiredTools` field to skills with ALTER TABLE migration, updated skill CRUD, tool count badges in list view, and agent assignment display.
- **Navigation**: Added "Agents" link with Bot icon to nav tabs.

### Changed

- **Layout Grid** (#252): Root layout updated from `min-h-screen` to `grid h-dvh overflow-hidden` for proper viewport containment. Talos layout uses flex-based footer with version display.
- **Spacing Audit** (#253): All pages updated with consistent `px-4 md:px-6 py-4 md:py-6` padding, `overflow-auto` scroll containers, and `h-full` wrappers for grid layout compatibility.
- **SDK References** (#243): Updated Model Configuration description from "OpenAI" to "GitHub Copilot SDK".
- **Environment Variables** (#242): Added `GITHUB_TOKEN` and `COPILOT_GITHUB_TOKEN` to known env vars in the Environment panel.
- **React 18 → 19** (#195): Upgraded to React 19 with new lint rules, ref-as-prop support. Fixed `useSocket` to use initializer function pattern instead of setState-in-effect.
- **Next.js 14 → 16** (#192): Upgraded to Next.js 16.2.1 with Turbopack default. Removed deprecated `reactStrictMode` option (now default). Replaced `next lint` with direct ESLint invocation (removed in Next 16).
- **Tailwind CSS 3 → 4** (#196): Migrated to Tailwind v4 CSS-first configuration. Replaced `tailwind.config.ts` with `@theme inline` block in `globals.css`. Switched PostCSS plugin to `@tailwindcss/postcss`. Removed `autoprefixer` (built-in) and `tailwindcss-animate` (animations defined in CSS).
- **ESLint 8 → 9** (#193): Migrated to ESLint flat config format. Replaced `.eslintrc.cjs`/`.eslintrc.json` with `eslint.config.js`/`eslint.config.mjs`. Upgraded `typescript-eslint` to v8 (unified package). Updated `eslint-config-next` to v16 with native flat config support.
- **Vitest 2/3 → 4** (#194): Upgraded Vitest to v4.1.0 across root and UI packages. Added Vite 8 as explicit dependency.
- **Vite 5 → 8**: Added explicit Vite 8 dependency to satisfy Vitest 4 and @vitejs/plugin-react 6 peer requirements.
- **@vitejs/plugin-react 5 → 6** (#197): Upgraded Vite React plugin to v6.0.1.
- **@lancedb/lancedb 0.26 → 0.27** (#191): Bumped LanceDB vector store dependency.
- **@types/node 22 → 25** (#191): Bumped Node.js type definitions.
- **GitHub Actions** (#190): Updated `actions/checkout` v4→v6, `actions/setup-node` v4→v6, `github/codeql-action` v3→v4 across all workflows.

### Removed

- **`openai` npm package** (#189): Removed unused dependency — embedding service uses raw `fetch()` to hit the OpenAI API directly.

### Added

- **Copilot SDK Integration** (Epic #95): Device-flow authentication with GitHub Copilot, streaming chat via `@github/copilot-sdk`, per-session token usage tracking, model selection and reasoning effort configuration.
- **Model/LLM Configuration** (Epic #98): Admin API for listing available models, selecting active model, configuring reasoning effort (low/medium/high/xhigh), and provider management.
- **Admin Settings Dashboard** (Epic #102): Tabbed admin page with Authentication, Personality, Models, and MCP Servers panels. Full CRUD for system personality profiles with activation toggle.
- **Chat Interface** (Epic #103): Real-time streaming chat page using Socket.IO, message history with user/assistant bubbles, auto-scroll, and connection status indicator.
- **MCP Server Management** (Epic #96): Admin CRUD for Model Context Protocol server configurations (stdio, http, sse, docker types) with enable/disable toggle, stored in SQLite.
- **Prompt Library** (Epic #100): Saved prompts with category filtering, full-text search, `{{variable}}` template interpolation support, staged pipeline definitions, and preferred tool scoping.
- **Skills Management** (Epic #101): Skill definitions with name, description, content, tags, and enable/disable toggle. Grid-based management UI with inline editing.
- **Scheduler** (Epic #97): Cron-based job scheduling with preset expressions, enable/disable toggle, last/next run tracking, and admin CRUD API backed by SQLite.
- **Task Queue** (Epic #99): Agent task queue with status tracking (pending/running/completed/failed/cancelled), parent-child DAG support, recursion depth limits, stats dashboard with real-time polling.
- **Workbench** (Epic #94): Markdown editor with live preview, file open/save, keyboard shortcuts (Cmd+S, Tab indent), line/char count, and basic Markdown rendering (headings, lists, code blocks, blockquotes).
- **Platform Repository**: SQLite data access layer (`src/platform/repository.ts`) with auto-migrating schema for personality, saved_prompts, scheduled_jobs, agent_tasks, mcp_servers, and skills tables.
- **Admin API Router**: Comprehensive REST API at `/api/admin` with endpoints for auth, models, personality, prompts, scheduler jobs, tasks, MCP servers, and skills.
- **Navigation**: Updated nav tabs with routes for Chat, Prompts, Skills, Scheduler, Tasks, Workbench, and Admin pages.
- **Talos Full Feature Buildout** (Epic #199): 25 sub-issues (#209–#233) across 5 phases — Foundation, AI Infrastructure, Generate & Chat, Prompt Library & Skills, and Workbench Orchestration.
  - **Application Management** (#209): CRUD for Talos applications with name, URL, status, description, platform type, and created/updated timestamps.
  - **Talos Admin Page** (#210): Dedicated `/talos` admin page with application registry grid, add/edit dialog, and inline delete.
  - **Environment Variable Management** (#211): `EnvManager` class managing `~/.talos/.env` with masking for sensitive keys (tokens, secrets, passwords), rejection of dangerous keys (`PATH`, `HOME`, etc.), and admin API endpoints.
  - **Knowledge Base & RAG** (#212): LanceDB-backed vector store with document indexing, semantic search, and knowledge config management. Admin UI panel with document list, search, reindex, and stats.
  - **Model Health Dashboard** (#213): `/api/admin/models/health` endpoint and admin panel showing per-model connectivity status.
  - **Discovery Engine** (#214): Web crawler for application discovery — extracts pages, forms, links, and metadata for test generation context.
  - **RAG Indexer** (#215): Pipeline to chunk discovered content and index into LanceDB with OpenAI embeddings for retrieval-augmented test generation.
  - **RAG Context Indicator** (#216): Inline UI component on assistant messages showing expandable RAG source citations with file paths, relevance scores, and content snippets.
  - **Test Runner** (#217): Playwright-based test execution engine with configurable browser, viewport, timeout, and structured result reporting.
  - **Healing Engine** (#218): Auto-fix for broken selectors — detects stale locators and suggests or applies updated selectors based on DOM similarity.
  - **Test Generator** (#219, #220): AI-powered test generation from application context — `POST /api/talos/tests/generate` creates test code via Copilot with RAG context and application metadata.
  - **Test Refinement** (#221): Iterative AI refinement of generated tests — `POST /api/talos/tests/:id/refine` re-prompts Copilot with feedback to improve test quality.
  - **Chat Session Management** (#222): Session sidebar with history list, search, delete, and create. Session CRUD endpoints (`GET/DELETE /api/talos/sessions`). JSONL-backed session persistence.
  - **Chat Header** (#223): Enhanced chat header with inline model picker and quick-action buttons (generate test, clear chat).
  - **Pipeline Builder** (#224): Multi-stage prompt pipeline editor — add/remove/reorder stages via drag handles, per-stage name and content editing.
  - **Template Variables UI** (#225): Live `{{variable}}` extraction from prompt content, fill-in-the-blank value inputs, and real-time interpolated preview.
  - **Prompt Import/Export** (#226): JSON file export/import for prompt library entries with full metadata, pipeline stages, and variable definitions.
  - **Skill Templates** (#227): 5 built-in skill templates (Web Scraper, Code Reviewer, Test Generator, API Tester, Documentation Writer) with one-click creation.
  - **Inline Skill Execution** (#228): Execute skills directly from the skills page — input panel, task creation via API, and output display.
  - **Skill Import/Export** (#229): JSON file export/import for skill definitions with full metadata and tags.
  - **Test Orchestration Workbench** (#230–#233): 4-step wizard replacing the markdown editor — Select Application → Configure Pipeline Steps (discover, index, generate, execute) → Live Execution with WebSocket progress → Results Dashboard with completion metrics, pass/fail counts, and step-by-step detail table.
