# TALOS Architecture

> **Test Automation & Logic Orchestration System**
>
> Autonomous E2E testing engine that discovers application source code, builds semantic context via RAG, generates Playwright tests with AI, executes them across browsers, self-heals failures, and exports portable test packages.

---

## Table of Contents

- [System Overview](#system-overview)
- [High-Level Architecture](#high-level-architecture)
- [Technology Stack](#technology-stack)
- [Module Architecture](#module-architecture)
  - [Core Layer](#core-layer)
  - [Discovery Module](#discovery-module)
  - [RAG Module](#rag-module)
  - [Generator Module](#generator-module)
  - [Runner Module](#runner-module)
  - [Healing Module](#healing-module)
  - [Export Module](#export-module)
  - [Knowledge Module](#knowledge-module)
  - [Integration Module](#integration-module)
  - [UI Module](#ui-module)
- [Data Architecture](#data-architecture)
  - [SQLite Schema](#sqlite-schema)
  - [Vector Store Schema](#vector-store-schema)
- [Configuration System](#configuration-system)
- [MCP Tool Interface](#mcp-tool-interface)
- [Agent Orchestration](#agent-orchestration)
- [Data Flow](#data-flow)
  - [Discovery → Index Pipeline](#discovery--index-pipeline)
  - [Test Generation Pipeline](#test-generation-pipeline)
  - [Test Execution Pipeline](#test-execution-pipeline)
  - [Self-Healing Loop](#self-healing-loop)
  - [Export Pipeline](#export-pipeline)
- [Security Architecture](#security-architecture)
- [File System Layout](#file-system-layout)
- [CI/CD](#cicd)

---

## System Overview

TALOS is a monorepo containing two packages:

| Package | Path | Description |
|---------|------|-------------|
| `talos` (root) | `/` | Core engine — discovery, RAG, generation, execution, healing, export |
| `talos-ui` | `/ui` | Next.js 14 command center dashboard |

The engine exposes its functionality through **MCP tools** (Model Context Protocol) that can be invoked by AI agents, CLI scripts, or the UI's API layer. Every subsystem is independently testable and loosely coupled through well-defined TypeScript interfaces.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        TALOS Command Center (UI)                    │
│  Next.js 14 · React Query · Socket.IO · Tailwind · Radix UI        │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ REST + WebSocket
┌──────────────────────────────┴──────────────────────────────────────┐
│                          MCP Tool Layer                              │
│  21 tools · Zod validation · Risk-level gating · JSON responses      │
├─────────┬──────────┬──────────┬──────────┬──────────┬──────────┬─────────┬─────────────┤
│Discovery│   RAG    │Generator │  Runner  │ Healing  │  Export  │Knowledge│ Integration │
│         │          │          │          │          │          │         │             │
│ GitHub  │ Embed    │ Prompt   │Playwright│ Failure  │ Package  │Document │Docker MCP   │
│ MCP     │ Service  │ Builder  │ Runner   │ Analyzer │ Builder  │Ingester │Manager      │
│ Client  │          │          │          │          │          │         │             │
│         │ Vector   │ Code     │ Artifact │ Fix      │Credential│ Auto    │JDBC Tools   │
│ File    │ Store    │ Validator│ Manager  │ Generator│Sanitizer │ Tagger  │             │
│ Chunker │          │          │          │          │          │         │Atlassian    │
│         │ RAG      │ Test     │Credential│ Healing  │ Export   │         │Tools        │
│         │ Pipeline │ Generator│ Injector │ Engine   │ Engine   │         │             │
├─────────┴──────────┴──────────┴──────────┴──────────┴──────────┴─────────┴─────────────┤
│                        Core Layer                                    │
│  TalosRepository (SQLite) · TalosConfig (Zod) · Types · initTalos   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

### Backend (Root Package)

| Concern | Technology | Version | Purpose |
|---------|-----------|---------|---------|
| Runtime | Node.js | ≥22 | ES2022 modules, native fetch |
| Language | TypeScript | ^5.8 | Strict mode, NodeNext resolution |
| Module System | ESM | — | `"type": "module"` in package.json |
| Database | better-sqlite3 | ^12.6 | WAL mode, synchronous DAL |
| Vector DB | LanceDB | ^0.26 | Embedded vector store, ANN search |
| Embeddings | GitHub Models REST API | — | `text-embedding-3-small`, 1536 dims, via `https://models.github.ai/inference/embeddings` |
| E2E Framework | Playwright | ^1.52 | Multi-browser, traces, video |
| Schema Validation | Zod | ^3.25 | Config parsing, tool input validation |
| ID Generation | nanoid | ^5.1 | URL-safe unique IDs |
| Testing | Vitest | ^2.1 | Node environment, coverage via v8 |
| Linting | ESLint | ^8.57 | @typescript-eslint plugin |
| Formatting | Prettier | ^3.8 | Consistent code style |
| Package Manager | pnpm | 10.28.2 | Workspace protocol, strict deps |

### Frontend (UI Package)

| Concern | Technology | Version | Purpose |
|---------|-----------|---------|---------|
| Framework | Next.js | ^14.2 | App Router, SSR/SSG, API routes |
| UI Library | React | ^18.3 | Component model |
| Styling | Tailwind CSS | ^3.4 | Utility-first, `tailwindcss-animate` |
| Components | Radix UI | latest | Dialog, Select, Tabs, Switch, Tooltip |
| Data Fetching | React Query | ^5.90 | Cache, refetch, optimistic updates |
| Real-time | Socket.IO Client | ^4.8 | Live test-run and discovery events |
| Icons | Lucide React | ^0.575 | SVG icon library |
| Syntax Highlighting | react-syntax-highlighter | ^16.1 | Code display in viewers |
| Theme | next-themes | ^0.4 | Dark/light mode toggle |
| Testing | Vitest + Testing Library | ^3.1 / ^16.3 | Component + hook tests in jsdom |

---

## Module Architecture

### Core Layer

**Location:** `src/talos/`

The core layer provides the foundational services used by every subsystem.

#### `types.ts` (~600 lines)

Central type definitions for the entire domain model:

- **`TalosApplication`** — Target application under test (name, repositoryUrl, baseUrl, githubPatRef, status, metadata).
- **`TalosTest`** — Generated Playwright test (code, type, version, POM dependencies, selectors, codeHash, generationConfidence, tags).
- **`TalosTestRun`** — Execution record (status, trigger, browser, environment, durationMs, error details, retryAttempt, vaultRoleId).
- **`TalosTestArtifact`** — Run artifact (screenshot, video, trace, log, report, diff — with filePath, mimeType, sizeBytes).
- **`TalosVaultRole`** — Credentials for a role type (admin, standard, guest, service, user — with usernameRef, passwordRef, additionalRefs).
- **`TalosChunk`** — Code chunk for RAG indexing (content, filePath, startLine/endLine, contentHash, chunkType: code/test/documentation/config/schema).
- **`DiscoveryJob`** — Repository crawl job progress.
- **`HealingAttempt`** — Self-healing audit record (analysis, proposedFix, confidence, autoApplied, verificationRunId).
- **`TestGenerationJob`** — AI generation request tracking.

Every entity has `Create*Input` and `Update*Input` companion types using `Partial<Pick<>>` for type-safe mutations.

#### `config.ts`

Zod-validated configuration with sensible defaults. Parsed via `parseTalosConfig(input)` or `getDefaultTalosConfig()`.

| Subsystem | Key Defaults |
|-----------|-------------|
| `vectorDb` | LanceDB at `~/.talos/vectordb`, collection `talos_chunks` |
| `embedding` | GitHub Models REST API `text-embedding-3-small` (via `https://models.github.ai/inference/embeddings`), 1536 dimensions, batch size 100 |
| `runner` | Chromium, 30s timeout, 60s navigation timeout, headless, 2 retries |
| `healing` | 85% confidence threshold, 3 max retries, 5s cooldown |
| `generator` | 80% confidence threshold, human review required, 10 context chunks, POM enabled |
| `export` | Output to `~/.talos/exports`, sanitize credentials, include `.env` template |
| `artifacts` | Stored at `~/.talos/artifacts`, 30 day retention, 5 GB cap |
| `discovery` | Includes `.ts/.tsx/.js/.jsx/.vue/.svelte/.html/.css`, 1 MB max file, 1000-char chunks with 200-char overlap |
| `githubMcp` | 5000 req/hr, exponential backoff 1s→60s, 5-min cache TTL |

#### `repository.ts` (~1000 lines)

Synchronous SQLite data access layer using `better-sqlite3`.

- **7 tables** with foreign keys, `CHECK` constraints, and indexes.
- **Automatic migrations** via `migrate()` — creates tables and indexes if they don't exist.
- **CRUD methods** for: Applications, Tests, TestRuns, Artifacts, VaultRoles, AcceptanceCriteria, Traceability.
- **Transaction support**: `runInTransaction()` for atomic batch operations.
- **Aggregate queries**: `getApplicationStats()` returns totalTests, activeTests, totalRuns, passedRuns, failedRuns, lastRunAt.
- **JSON serialization**: Fields like `metadata_json`, `tags_json`, `pom_dependencies_json` are stored as TEXT and parsed on read.
- **ID generation**: `nanoid()` for all primary keys.
- **Clock injection**: Optional `clock: () => Date` for deterministic testing.

#### `tools.ts`

Factory function `createTalosTools()` returns an array of **21 MCP tool definitions**, each with:

- `name`, `description`, `inputSchema` (JSON Schema for MCP compatibility)
- `zodSchema` (Zod schema for runtime validation)
- `handler` (async function returning `{ text: string; isError?: boolean }`)
- `category: "testing" | "knowledge"`, `riskLevel: "low" | "medium" | "high"`, `source: "talos"`

#### `index.ts`

Entry point that exports all types, classes, and the `initTalos()` function:

```typescript
function initTalos(options: {
  db: Database.Database;
  config?: unknown;
  clock?: () => Date;
}): {
  repository: TalosRepository;
  config: TalosConfig;
  tools: ToolDefinition[];
}
```

Initialization flow:
1. Parse config with Zod (applies defaults for missing fields).
2. Create `TalosRepository` with the provided SQLite database.
3. Run migrations (idempotent).
4. Create MCP tools wired to the repository and config.

---

### Discovery Module

**Location:** `src/talos/discovery/`

Crawls a GitHub repository, filters relevant source files, and chunks them for RAG indexing.

#### Components

| Class | Responsibility |
|-------|---------------|
| `DiscoveryEngine` | Orchestrates the full discovery flow — resolves vault secrets, creates GitHub client, filters files, chunks content, stores vectors |
| `GitHubApiClient` | GitHub REST API client with rate limiting, exponential backoff, response caching |
| `FileChunker` | Splits source files into semantically meaningful chunks using structural or sliding-window strategies |
| `AppIntelligenceScanner` | Coordinates 4 detectors (tech stack, databases, test users, docs) to produce an `AppIntelligenceReport` |

#### App Intelligence

**Location:** `src/talos/discovery/detectors/`

Pure regex/string-matching analysis of repository config files — no AI required.

| Detector | Input | Output |
|----------|-------|--------|
| `detectTechStack()` | `package.json`, `pom.xml`, `build.gradle`, `requirements.txt`, `go.mod`, `Cargo.toml`, `Gemfile` | `TechStackItem[]` + `DetectedConfigFile[]` |
| `detectDatabases()` | `.env*`, Docker Compose, ORM configs | `DetectedDatabase[]` |
| `detectTestUsers()` | `.env.example`, `.env.test`, `playwright.config.ts` | `DetectedTestUser[]` |
| `detectDocumentation()` | File tree paths | `DetectedDocument[]` |

Reports are persisted to `talos_app_intelligence` SQLite table and exposed via API endpoints.

#### GitHubApiClient

- **Authentication**: Personal Access Token (PAT) resolved from vault reference (e.g., `vault:github-pat-myapp`).
- **Operations**: `getTree()` (recursive file listing), `getFileContent()`, `getFileText()`, `listFiles()` (by extension).
- **Base URL**: Configurable via `baseUrl` option. Defaults to `https://api.github.com`. For GitHub Enterprise, use `https://{host}/api/v3`. Static helper `GitHubApiClient.apiBaseFromHost(host)` handles the mapping.
- **GHE Support**: `parseRepoUrl()` in `DiscoveryEngine` now returns `{ host, owner, repo }` for any git host (github.com, GHE, SSH, shorthand). The host is mapped to the correct API base URL automatically.
- **Rate limiting**: Reads `x-ratelimit-remaining` / `x-ratelimit-reset` headers. Defaults to 5000 req/hr.
- **Backoff**: Exponential with jitter — 1s base, 60s max, retries on 5xx errors.
- **Caching**: In-memory cache with configurable TTL (default 5 minutes). Keyed by `{owner}/{repo}/{path}@{ref}`.

#### FileChunker

Two chunking strategies:

1. **Structural chunking** (preferred): Regex-based detection of functions, classes, interfaces, type aliases, and const declarations. Produces one chunk per symbol with file path, start/end lines, and symbol metadata.
2. **Sliding window** (fallback): Fixed-size chunks (default 1000 chars) with overlap (default 200 chars). Used when structural parsing yields no results.

Chunk type inference from file extension:
- `.ts`, `.tsx`, `.js`, `.jsx` → `code`
- `.test.ts`, `.spec.ts` → `test`
- `.md`, `.txt` → `documentation`
- `.json`, `.yaml`, `.yml` → `config`
- `.graphql`, `.prisma` → `schema`

#### Discovery Flow

```
Application (repositoryUrl + githubPatRef)
  │
  ├─ 1. Parse owner/repo from URL
  ├─ 2. Resolve PAT from vault
  ├─ 3. getTree("HEAD", recursive=true)
  ├─ 4. Filter by extensions, patterns, max file size
  ├─ 5. For each file:
  │     ├─ getFileText(path)
  │     ├─ FileChunker.chunk(path, content, appId)
  │     └─ Emit chunks to RAG pipeline
  ├─ 6. Update progress (filesDiscovered, filesIndexed, chunksCreated)
  └─ 7. Mark job completed/failed
```

---

### RAG Module

**Location:** `src/talos/rag/`

Retrieval-Augmented Generation pipeline — embeds code chunks, stores them in a vector database, and retrieves semantically similar context for test generation.

#### Components

| Class | Responsibility |
|-------|---------------|
| `EmbeddingService` | Generates vector embeddings from text using OpenAI (extensible to local models) |
| `VectorStore` | LanceDB wrapper — stores, searches, and manages vector records |
| `RagPipeline` | Orchestrates embed → store → query lifecycle |

#### EmbeddingService

- **Provider**: GitHub Models REST API `text-embedding-3-small` (accessed via `https://models.github.ai/inference/embeddings`, default). Provider abstraction supports future local model backends.
- **Dimensions**: 1536 (configurable).
- **Batch processing**: Splits large arrays into batches of 100 (configurable). Returns per-batch token counts.
- **Utilities**: `cosineSimilarity(a, b)` for local similarity computation.

#### VectorStore

- **Backend**: LanceDB (embedded, zero-infrastructure).
- **Storage path**: `~/.talos/vectordb` (configurable, supports remote URIs).
- **Collection**: `talos_chunks` (configurable).
- **Schema**: `id`, `applicationId`, `content`, `filePath`, `startLine`, `endLine`, `type`, `contentHash`, `metadata` (JSON), `vector` (Float32 array), `docId` (source document ID), `sourceVersion` (document version), `confidence` (0-1 score), `tags` (JSON string array).
- **Deduplication**: `exists(applicationId, contentHash)` before insert.
- **Search**: ANN query filtered by `applicationId` and optional `type`, with minimum score threshold. Returns results ranked by similarity. Input validation prevents injection via filter expressions (alphanumeric + hyphens only).
- **Hybrid search**: `hybridSearch()` combines vector similarity with keyword boosting and metadata filtering (types, tags, docType, persona, minConfidence).
- **Cleanup**: `deleteByApplication(appId)` for re-indexing.

#### RagPipeline

Coordinates the full RAG lifecycle:

| Method | Purpose |
|--------|---------|
| `initialize()` | Connects to vector store |
| `indexChunks(appId, chunks)` | Dedup → embed → store. Returns `{ indexed, skipped, totalTokens }` |
| `retrieve(appId, query, options?)` | Embed query → ANN search → return ranked `RagContext` |
| `retrieveWithFilters(appId, query, options?)` | Hybrid search with type, tag, docType, and confidence filters |
| `findSimilar(appId, content, threshold)` | Semantic dedup / similarity analysis |
| `clearApplication(appId)` | Wipe all vectors for an app (used before re-index) |
| `getStats(appId)` | Return chunk count |

---

### Generator Module

**Location:** `src/talos/generator/`

AI-powered Playwright test generation with RAG context, iterative validation, and auto-fixing.

#### Components

| Class | Responsibility |
|-------|---------------|
| `TestGenerator` | Orchestrates generation: fetch context → build prompt → call LLM → validate → retry → save |
| `PromptBuilder` | Assembles system and user prompts with application context, RAG chunks, and existing tests |
| `CodeValidator` | Validates generated code for syntax, banned patterns, Playwright API usage, and common issues |
| `CriteriaGenerator` | AI-powered acceptance criteria generation from RAG knowledge base using Given/When/Then format |

#### TestGenerator Flow

```
User Request ("Generate login test for admin role")
  │
  ├─ 1. Load application from repository
  ├─ 2. Fetch existing tests (for style consistency)
  ├─ 3. Query RAG: embed request → retrieve relevant chunks
  ├─ 4. PromptBuilder.buildPrompt(context)
  │     ├─ System prompt: Expert test engineer constraints
  │     └─ User prompt: App info + code excerpts + request + instructions
  ├─ 5. Call LLM (generateWithLLM callback)
  ├─ 6. Extract code block from response
  ├─ 7. CodeValidator.validate(code)
  │     ├─ Pass → Save test to DB
  │     └─ Fail → Add validation errors to prompt → Retry (max 3x)
  ├─ 8. CodeValidator.autoFix(code) for minor issues
  └─ 9. Create TalosTest record (status: "draft", generationConfidence)
```

#### PromptBuilder

System prompt enforces:
- Clean, maintainable TypeScript
- Modern Playwright API (locators, `getByRole`, `getByTestId`)
- Proper error handling and assertions
- Page Object Model when configured
- Idempotent, self-contained tests

User prompt includes:
- Application context (name, base URL, description)
- Relevant code snippets from RAG (up to `maxContextChunks`)
- Existing test examples for consistency
- User request description with generation instructions

#### CodeValidator

**Banned patterns** (always errors):
- `eval()`, `Function()` constructor
- `require()` (must use ES imports)
- `process.exit()`
- `child_process` usage
- File deletion APIs (`fs.unlink`, `rmdir`, `rm`)

**Deprecated patterns** (warnings):
- `page.$()` → use `page.locator()`
- `page.$$()` → use `page.locator()`
- `page.waitForTimeout()` → use `expect` conditions

**Required patterns** (strict mode):
- At least one assertion (`expect`, `toBe`, `toEqual`, `toContain`, `toMatch`)

**Auto-fix** capabilities:
- Replace deprecated APIs with modern equivalents
- Fix common selector issues
- Add missing imports
- Format code

---

### Runner Module

**Location:** `src/talos/runner/`

Executes Playwright tests with cross-browser support, artifact collection, and credential injection.

#### Components

| Class | Responsibility |
|-------|---------------|
| `PlaywrightRunner` | Launches browsers, compiles test code, executes with retries, collects artifacts |
| `ArtifactManager` | Manages storage, retrieval, and cleanup of test artifacts (screenshots, videos, traces, logs) |
| `CredentialInjector` | Resolves vault roles to actual credentials, provides login helper functions |

#### PlaywrightRunner Execution Flow

```
TalosTest + TalosTestRun + ExecutionOptions
  │
  ├─ 1. Update run status → "running"
  ├─ 2. Select browser engine (chromium/firefox/webkit)
  ├─ 3. Launch browser (headless, slowMo settings)
  ├─ 4. Create browser context
  │     ├─ Video recording (if configured)
  │     └─ Viewport, locale, timezone
  ├─ 5. Start tracing (screenshots, snapshots, sources)
  ├─ 6. Compile test code into executable function
  ├─ 7. Execute test(page, expect, context)
  │     ├─ Success → status: "passed"
  │     └─ Failure → capture screenshot → status: "failed"
  ├─ 8. Stop tracing → save trace.zip
  ├─ 9. Collect video recordings
  ├─ 10. Save all artifacts via ArtifactManager
  ├─ 11. Update run: durationMs, error, completedAt
  └─ 12. Retry loop if configured (retryAttempt counter)
```

**Trace modes**: `off`, `on`, `retain-on-failure`, `on-first-retry`
**Video modes**: `off`, `on`, `retain-on-failure`, `on-first-retry`

#### ArtifactManager

Storage layout:

```
~/.talos/artifacts/
  {testRunId}/
    screenshot/
      failure.png
      step-login.png
    video/
      recording.webm
    trace/
      trace.zip
    log/
      test.log
    report/
      results.html
```

- **Retention**: 30 days (configurable via `artifacts.retentionDays`).
- **Storage cap**: 5 GB (configurable via `artifacts.maxStorageMb`).
- **Cleanup**: `cleanup()` deletes artifacts older than retention period, freed bytes logged.
- **MIME detection**: Automatic from file extension.

#### CredentialInjector

- **Vault integration**: Reads `TalosVaultRole` from repository, resolves `usernameRef` / `passwordRef` / `additionalRefs` via an async `resolveSecret` callback.
- **Role types**: `admin`, `standard`, `guest`, `service`, `user`.
- **Caching**: Results cached by `{appId}:{roleType}` to avoid repeated vault lookups.
- **Login helper**: `createLoginFunction()` returns a reusable `(page) => Promise<void>` that performs:
  1. Navigate to login URL
  2. Fill username field
  3. Fill password field
  4. Click submit
  5. Wait for success indicator
  6. Optional: Generate TOTP from MFA secret and fill MFA field

---

### Healing Module

**Location:** `src/talos/healing/`

Autonomous self-healing loop that analyzes test failures, generates fixes, verifies them, and applies with configurable confidence thresholds.

#### Components

| Class | Responsibility |
|-------|---------------|
| `FailureAnalyzer` | Categorizes failures, extracts affected selectors, suggests fix strategies |
| `FixGenerator` | Uses LLM + RAG context to generate code fixes for failed tests |
| `HealingEngine` | Orchestrates the full heal loop: analyze → fix → verify → apply/reject |

#### FailureAnalyzer

Categorizes errors into:

| Category | Pattern | Typical Fix |
|----------|---------|-------------|
| `selector-changed` | Element not found, strict mode violation | `update-selector` |
| `element-not-found` | Locator timeout, no matching element | `update-selector`, `add-wait` |
| `timeout` | Action/navigation exceeded timeout | `add-wait`, `add-retry` |
| `assertion-failed` | `expect()` mismatch | `update-assertion`, `manual-review` |
| `network-error` | `net::ERR_*`, fetch failures | `add-retry`, `manual-review` |
| `authentication-error` | 401/403, login failures | `manual-review` |
| `navigation-error` | `goto` failures | `manual-review`, `add-retry` |
| `script-error` | JS exceptions in test code | `update-logic` |
| `unknown` | Unclassifiable | `manual-review` |

Also extracts:
- Affected selectors with type (locator, assertion, action, navigation) and line numbers.
- Related failures (previous runs of same test with same category).
- Failure statistics per application.

#### FixGenerator

1. Takes original test code + `FailureAnalysis`.
2. Builds LLM prompt: "Expert test debugger, fix this code given the failure analysis."
3. Parses one or more fixes with `{ type, fixedCode, confidence, reasoning }`.
4. Validates each fix through `CodeValidator`.
5. Ranks by confidence, selects highest-confidence valid fix.

#### HealingEngine Orchestration

```
Failed TalosTestRun
  │
  ├─ 1. Guard checks:
  │     ├─ Healing enabled?
  │     ├─ Not already healing this test?
  │     ├─ Under max retries (3)?
  │     └─ Cooldown elapsed (5s)?
  │
  ├─ 2. FailureAnalyzer.analyze(testRun) → FailureAnalysis
  │
  ├─ 3. FixGenerator.generateFixes(test, run, analysis) → fixes[]
  │
  ├─ 4. Select best fix (confidence ≥ 0.85)
  │     ├─ Below threshold → Reject, require human review
  │     └─ Above threshold → Continue to verification
  │
  ├─ 5. Verification run:
  │     ├─ Execute test with fixedCode (trigger: "healing-verification")
  │     ├─ Pass → Auto-apply fix to test code
  │     └─ Fail → Revert, mark attempt failed
  │
  └─ 6. Record HealingAttempt (audit log)
        ├─ analysis, proposedFix, confidence
        ├─ autoApplied, humanApproved
        └─ verificationRunId
```

**Safety mechanisms**:
- `healingInProgress` Set prevents infinite loops (healing-verification runs don't trigger healing).
- Verification run must pass before fix is applied.
- Full audit trail for every attempt.
- Configurable confidence threshold (default 85%).
- Cooldown between attempts.

---

### Knowledge Module

**Location:** `src/talos/knowledge/`

Document ingestion and auto-tagging for the RAG knowledge base. Enables ingestion of requirements documents (PRDs, user stories, API specs) so the test generator can reason over domain knowledge.

#### Components

| Class | Responsibility |
|-------|---------------|
| `DocumentIngester` | Ingests Markdown and OpenAPI (JSON/YAML) documents — semantic chunking, stable IDs, integration with `RagPipeline` |
| `AutoTagger` | NLP-heuristic auto-tagging using controlled vocabulary for personas, NFRs, environments, and functional areas |

#### Document Formats

| Format | Chunking Strategy |
|--------|------------------|
| `markdown` | Split by heading sections (## / ###) with 10-15% paragraph overlap |
| `openapi_json` | One chunk per operation (path + HTTP method) |
| `openapi_yaml` | One chunk per operation (basic YAML parser) |

#### Controlled Vocabulary (`AutoTagger`)

| Category | Values |
|----------|--------|
| Doc Types | `prd`, `user_story`, `api_spec`, `functional_spec` |
| Personas | `admin`, `standard`, `guest`, `service`, `user` |
| NFR Tags | `performance`, `security`, `accessibility`, `reliability`, `usability` |
| Environments | `local`, `staging`, `production`, `ci` |
| Functional Areas | `auth`, `checkout`, `dashboard`, `profile`, `search`, `notifications`, `navigation`, `files`, `api`, `database`, `schema`, `jira`, `confluence` |

#### Chunk ID Format

Stable, deterministic IDs: `req:<appId>:<fileName>:<chunkIndex>:<version>`

#### Extended Chunk Types

`TalosChunkType` now includes: `code`, `test`, `documentation`, `config`, `schema`, **`requirement`**, **`api_spec`**, **`user_story`**

#### Hybrid Search (`VectorStore.hybridSearch`)

Combines vector similarity with keyword boosting and metadata filtering:
- Vector search (3× limit for re-ranking)
- Keyword hit boosting (+0.2 weight)
- Filter by: `types`, `tags`, `docType`, `persona`, `minConfidence`
- Exposed via `RagPipeline.retrieveWithFilters()`

---

### Integration Module

**Location:** `src/talos/integration/`

Manages external data source connectivity via Docker-hosted MCP servers. Supports JDBC databases and Atlassian (Jira + Confluence) as supplementary context sources for test generation.

#### Components

| Class | Responsibility |
|-------|---------------|
| `DockerMcpManager` | Starts, stops, and tracks Docker containers running MCP servers (JDBC via jbang, Atlassian via `ghcr.io/sooperset/mcp-atlassian`) |
| `createJdbcTools()` | Factory returning 3 MCP tools: `talos_db_query` (read-only SQL), `talos_db_describe`, `talos_db_list_tables` |
| `createAtlassianTools()` | Factory returning 2 MCP tools: `talos_jira_search` (JQL, auto-scoped to project), `talos_confluence_search` (CQL, auto-scoped to spaces) |

#### Security Controls

- **SQL injection guard**: `isReadOnlyQuery()` rejects any SQL containing write patterns (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `CREATE`, `TRUNCATE`, `GRANT`, `REVOKE`).
- **Vault-ref credentials**: Database passwords and Atlassian API tokens are stored as `vault:key-name` references, resolved at runtime.
- **Docker resource limits**: 512 MB memory, 1 CPU per container.
- **Shutdown hooks**: All containers are stopped on process exit / SIGINT / SIGTERM.

#### Docker Container Lifecycle

```
startJdbcServer(appId, sourceId, config) → docker run --rm -d eclipse-temurin:21-jre ... jbang
startAtlassianServer(appId, config)       → docker run --rm -d ghcr.io/sooperset/mcp-atlassian
stopServer(key)                           → docker stop <containerId>
stopAllForApp(appId)                      → stops all containers matching appId prefix
```

---

### Export Module

**Location:** `src/talos/export/`

Packages generated tests into portable, standalone projects that run anywhere without TALOS.

#### Components

| Class | Responsibility |
|-------|---------------|
| `ExportEngine` | Orchestrates export workflow — selects format, delegates to builder, writes output |
| `PackageBuilder` | Generates all package files: `playwright.config.ts`, `package.json`, test files, README, env template |
| `CredentialSanitizer` | Replaces hardcoded secrets with environment variable references |

#### Export Formats

| Format | Output | Use Case |
|--------|--------|----------|
| `zip` | Self-contained `.zip` archive | Distribution, CI pipeline integration |
| `directory` | Unzipped folder on disk | Local development, manual editing |
| `single-file` | One `.ts` file with all tests | Quick sharing, code review |
| `json` | Metadata + test array | API integration, programmatic consumption |

#### PackageBuilder Output

For `playwright` template:

```
exported-tests/
├── package.json            # Scripts: test, test:headed, test:ui, test:debug, report
├── playwright.config.ts    # Multi-browser, reporters, retries, baseURL
├── tsconfig.json           # TypeScript config for test files
├── README.md               # Setup instructions, project structure, commands
├── .env.example            # Placeholders for all credentials
├── tests/
│   ├── login.spec.ts       # One file per test
│   ├── checkout.spec.ts
│   └── ...
├── fixtures/               # Shared test fixtures (optional)
└── pages/                  # Page Object Model classes (optional)
```

#### CredentialSanitizer

Regex-based detection and replacement of sensitive values:

| Pattern | Replacement |
|---------|------------|
| Passwords (`password = "secret123"`) | `process.env.TEST_PASSWORD_1` |
| API keys (`api_key = "sk-..."`) | `process.env.TEST_API_KEY_1` |
| Tokens (`token = "abc..."`) | `process.env.TEST_TOKEN_1` |
| JWTs (`eyJ...`) | `process.env.TEST_JWT_1` |
| Bearer tokens | `Bearer ${process.env.TEST_BEARER_TOKEN_1}` |
| Secrets (`secret = "..."`) | `process.env.TEST_SECRET_1` |
| URLs (optional) | `${process.env.TEST_BASE_URL}` |
| Emails (optional) | `${process.env.TEST_EMAIL_1}` |

Output includes a `SanitizationResult` with the cleaned code, a list of replacements (with line numbers), and warnings for patterns that couldn't be automatically handled.

---

### M365 Integration Module

**Location:** `src/talos/m365/`

Bridges TALOS with Microsoft Copilot 365 for enterprise document discovery and ingestion via Playwright browser automation. Adapted from the standalone `copilot365-int` MCP server.

#### Components

| Class | Responsibility |
|-------|---------------|
| `BrowserAuth` | Playwright persistent context auth with MFA support. Launches headful for initial login, then runs headless using cached session cookies in `userDataDir`. |
| `CopilotScraper` | DOM scraping with retry + exponential backoff. Sends enriched queries to the Copilot 365 chat UI, waits for results, extracts structured search results, and downloads files via SharePoint API. |
| `EphemeralStore` | Path-traversal-safe ephemeral file storage. Sanitizes filenames, validates resolved paths stay within `docsDir`, and provides read/write/list/cleanup operations. |
| `parseFile()` | File parser router — dispatches to `parseDocx` (mammoth), `parsePdf` (pdf-parse), `parseXlsx` (ExcelJS), `parsePptx` (officeparser). Converts to Markdown. |

#### Architecture

```
┌──────────────────────────────────────────┐
│           M365 API Routes                │
│  POST /search, /fetch, /convert, /cleanup│
│  GET /status                             │
├──────────────┬───────────┬───────────────┤
│ BrowserAuth  │ Scraper   │ FileParser    │
│ (Playwright  │ (DOM      │ (mammoth,     │
│  persistent  │  scraping │  pdf-parse,   │
│  context)    │  + retry) │  ExcelJS,     │
│              │           │  officeparser)│
├──────────────┴───────────┴───────────────┤
│           EphemeralStore                 │
│  (path-safe docs dir, .md storage)       │
└──────────────────────────────────────────┘
```

#### Selectors (`selectors.ts`)

Frozen `SELECTORS` object with 16 CSS selectors for the Copilot 365 web UI. When the UI changes, update **only this file** — no selectors hardcoded elsewhere.

#### Security

- **Path traversal prevention**: `EphemeralStore` validates all paths with `path.resolve()` + `startsWith(docsDir)` check. The `/convert` API endpoint applies the same validation before reading files.
- **HTML sanitization**: `htmlToMarkdown()` decodes HTML entities before stripping tags (multi-pass) to prevent `&lt;script&gt;` from becoming injectable `<script>` after decode.

---

### Proxy Configuration System

**Location:** `src/talos/config.ts` (schema), `src/index.ts` (application)

Corporate proxy support for environments behind firewalls.

#### Config Schema (`proxyConfigSchema`)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | `boolean` | `false` | Master switch |
| `httpProxy` | `string?` | — | HTTP proxy URL (e.g., `http://proxy.corp:8080`) |
| `httpsProxy` | `string?` | — | HTTPS proxy URL |
| `noProxy` | `string?` | — | Comma-separated bypass list (e.g., `localhost,*.internal.com`) |

#### Application Flow

When `proxy.enabled` is `true` at server startup, the system sets `HTTP_PROXY`, `HTTPS_PROXY`, and `NO_PROXY` environment variables. These are picked up by Node.js `fetch()`, Playwright, and other HTTP clients automatically.

#### Admin API

- `POST /api/admin/proxy/test` — Tests connectivity through the configured proxy by hitting an external endpoint, returns `{ connected, latencyMs?, error? }`.
- Proxy settings are persisted via the environment manager (`PUT /api/admin/env`).

---

### mTLS Support (Playwright Runner)

**Location:** `src/talos/config.ts` (schema), `src/talos/runner/` (application)

Mutual TLS authentication for Playwright test execution against applications requiring client certificates.

#### Config Schema (`mtlsConfigSchema`)

Nested under `runner.mtls` in the main config:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | `boolean` | `false` | Enable mTLS for the Playwright runner |
| `clientCertVaultRef` | `string?` | — | Vault reference for client certificate (PEM) |
| `clientKeyVaultRef` | `string?` | — | Vault reference for client private key (PEM) |
| `caVaultRef` | `string?` | — | Vault reference for CA certificate (PEM) |
| `pfxVaultRef` | `string?` | — | Vault reference for PKCS12 bundle |
| `passphrase` | `string?` | — | Passphrase for key/PFX |

#### PlaywrightRunner Integration

When `mtls.enabled` is `true` and vault refs are resolved, the runner constructs a Playwright `clientCertificates` config:

```typescript
clientCertificates: [{
  origin: application.baseUrl,
  certPath: resolvedCertPath,
  keyPath: resolvedKeyPath,
  ...(caPath ? { caPath } : {}),
}]
```

This is passed to `browser.newContext()` so all requests to the application origin include the client certificate in the TLS handshake.

#### Database Schema

`TalosApplication` extended with:
- `mtlsEnabled` (`BOOLEAN DEFAULT 0`)
- `mtlsConfig` (`TEXT` — JSON-serialized `MtlsApplicationConfig`)

---

### UI Module

**Location:** `ui/`

Next.js 14 App Router dashboard serving as the TALOS command center.

#### Page Structure

| Route | Page | Component |
|-------|------|-----------|
| `/talos` | Dashboard | `<Dashboard />` — Application list, stats cards, add/scan dialogs |
| `/talos/tests` | Test Matrix | `<TestMatrix />` — Test grid, run/view controls, real-time status |
| `/talos/artifacts` | Artifact Viewer | `<ArtifactViewer />` — Screenshots, videos, traces, logs browser |
| `/talos/vault` | Vault Manager | `<VaultManager />` — Credential role management per application |

#### Navigation

`<NavTabs />` component provides tab-based navigation across the four pages. Rendered in the Talos layout (`ui/app/talos/layout.tsx`).

#### Real-time Updates

Socket.IO integration via custom hooks:

| Hook | Event | Data |
|------|-------|------|
| `useTestRunUpdates(callback)` | `talos:test-run-update` | `{ id, status, durationMs?, errorMessage? }` |
| `useDiscoveryUpdates(callback)` | `talos:discovery-update` | `{ jobId, status, filesDiscovered?, filesIndexed?, chunksCreated? }` |

#### API Client (`ui/lib/api.ts`)

Typed HTTP client wrapping `fetch` calls to the backend. Configurable base URL via `NEXT_PUBLIC_TALOS_API_BASE` environment variable.

Endpoint groups: Applications, Tests, TestRuns, Artifacts, VaultRoles, AppIntelligence — each with standard CRUD operations plus specialized triggers (e.g., `triggerTestRun`, `triggerDiscovery`, `refreshIntelligence`).

#### Design System

- **Component library**: Radix UI primitives (Dialog, Select, Tabs, Switch, Tooltip, Dropdown Menu) styled with Tailwind.
- **Variants**: `class-variance-authority` for component variant composition.
- **Class merging**: `tailwind-merge` + `clsx` via `cn()` utility.
- **Theme**: Dark/light mode via `next-themes`.
- **Fonts**: Inter (body) + JetBrains Mono (code).

---

## Data Architecture

### SQLite Schema

TALOS uses a normalized relational schema with 9 core tables:

```
┌──────────────────────┐       ┌──────────────────────┐
│  talos_applications   │───┐   │   talos_vault_roles   │
│  (id, name, status,   │   │   │  (id, application_id,  │
│   repositoryUrl,       │   │   │   roleType, name,      │
│   baseUrl, metadata)   │   ├──│   usernameRef,         │
└──────────┬───────────┘   │   │   passwordRef)          │
           │               │   └──────────────────────┘
           │               │
   ┌───────┴───────┐       │
   │  talos_tests   │◄──────┘
   │  (id, appId,   │
   │   name, code,   │
   │   type, status,  │
   │   codeHash)      │
   └───────┬───────┘
           │
   ┌───────┴──────────┐
   │  talos_test_runs   │
   │  (id, testId,       │
   │   appId, status,     │
   │   trigger, browser,   │
   │   durationMs, error)  │
   └───────┬──────────┘
           │
   ┌───────┴──────────────┐
   │  talos_test_artifacts  │
   │  (id, testRunId,       │
   │   type, filePath,       │
   │   mimeType, sizeBytes)  │
   └────────────────────────┘

   ┌────────────────────────────┐       ┌──────────────────────┐
   │  talos_acceptance_criteria  │◄──────│   talos_traceability  │
   │  (id, appId, title,         │       │  (id, appId,          │
   │   description, scenarios,   │       │   requirementChunkId, │
   │   status, confidence, tags) │       │   acceptanceCriteriaId,│
   └────────────────────────────┘       │   testId, coverage)   │
                                        └──────────────────────┘

   ┌────────────────────────────┐       ┌──────────────────────────────┐
   │  talos_data_sources         │       │   talos_atlassian_configs     │
   │  (id, application_id,       │       │  (id, application_id,         │
   │   label, driver_type,       │       │   deployment_type,            │
   │   jdbc_url, vault refs,     │       │   jira_url, jira_project,     │
   │   is_active, read_only)     │       │   confluence_url, vault refs, │
   └────────────────────────────┘       │   is_active, ssl_verify)      │
                                        └──────────────────────────────┘

   ┌────────────────────────────┐
   │  talos_app_intelligence     │
   │  (id, application_id,       │
   │   report_json, scanned_at)  │
   └────────────────────────────┘
```

**Index strategy**: Every foreign key is indexed. Additional indexes on `status`, `type`, `name`, and `created_at` for common query patterns.

**JSON columns**: `metadata_json`, `tags_json`, `pom_dependencies_json`, `selectors_json`, `additional_refs_json` — stored as TEXT, parsed on read, serialized on write.

### Vector Store Schema

LanceDB collection `talos_chunks`:

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Unique chunk ID |
| `applicationId` | String | Owning application |
| `content` | String | Chunk text content |
| `filePath` | String | Source file path |
| `startLine` | Int32 | Start line in source |
| `endLine` | Int32 | End line in source |
| `type` | String | code, test, documentation, config, schema, requirement, api_spec, user_story |
| `contentHash` | String | SHA-256 for dedup |
| `metadata` | String | JSON metadata |
| `vector` | FixedSizeList[Float32, 1536] | Embedding vector |
| `docId` | String | Source document identifier |
| `sourceVersion` | String | Document version tag |
| `confidence` | Float32 | Confidence score (0-1, -1 = unset) |
| `tags` | String | JSON array of filter tags |

---

## Configuration System

Configuration flows through a single Zod schema hierarchy:

```
TalosConfig
├── enabled: boolean (default: true)
├── vectorDb: VectorDbConfig
│   ├── type: "lancedb" | "qdrant"
│   ├── path: string
│   ├── collectionName: string
│   └── qdrantUrl?, qdrantApiKey?
├── embedding: EmbeddingConfig
│   ├── provider: "openai" | "local"
│   ├── model: string
│   ├── dimensions: number
│   └── batchSize: number
├── runner: RunnerConfig
│   ├── defaultBrowser, timeout, navigationTimeout
│   ├── traceMode, screenshotOnFailure, video
│   ├── retries, workers, headless, slowMo
├── healing: HealingConfig
│   ├── confidenceThreshold, maxRetries
│   ├── enabled, cooldownMs, model?
├── generator: GeneratorConfig
│   ├── confidenceThreshold, requireReview
│   ├── maxContextChunks, model?, usePom
├── export: ExportConfig
│   ├── outputDir, sanitizeCredentials
│   └── includeEnvTemplate
├── artifacts: ArtifactsConfig
│   ├── path, retentionDays, maxStorageMb
├── discovery: DiscoveryConfig
├── jdbcDataSources: JdbcDataSourceConfig[]
│   ├── enabled, label, driverType
│   ├── jdbcUrl, usernameVaultRef, passwordVaultRef
│   └── readOnly (default: true)
├── atlassian: AtlassianConfig
│   ├── enabled, deploymentType (cloud/datacenter)
│   ├── jiraUrl, jiraProject, jiraApiTokenVaultRef
│   ├── confluenceUrl, confluenceSpaces[]
│   └── sslVerifyJira, sslVerifyConfluence, transport
│   ├── includeExtensions[], excludePatterns[]
│   ├── maxFileSizeBytes, chunkSize, chunkOverlap
└── githubMcp: GitHubMcpConfig
    ├── rateLimitPerHour, cacheTtlSeconds
    └── backoffBaseMs, backoffMaxMs
```

Partial configs are accepted — Zod fills missing fields with defaults. Invalid values throw typed `ZodError` with path-specific messages.

---

## MCP Tool Interface

All 21 tools follow a uniform interface:

```typescript
interface ToolDefinition {
  name: string;                           // e.g., "talos-generate-test"
  description: string;                    // Human-readable purpose
  inputSchema: {                          // JSON Schema (MCP-compatible)
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  zodSchema: z.ZodSchema;                // Runtime validation
  handler: (args: Record<string, unknown>) => Promise<{
    text: string;
    isError?: boolean;
  }>;
  category: "testing";
  riskLevel: "low" | "medium" | "high";
  source: "talos";
}
```

### Tool Catalog

| Tool | Risk | Inputs | Description |
|------|------|--------|-------------|
| `talos-list-applications` | LOW | `status?` | List all registered applications |
| `talos-get-application` | LOW | `id` | Get application details + stats |
| `talos-create-application` | MEDIUM | `name, repositoryUrl, baseUrl, ...` | Register a new target application |
| `talos-list-tests` | LOW | `applicationId, status?` | List tests for an application |
| `talos-run-test` | MEDIUM | `testId, browser?, vaultRoleType?` | Execute a test with Playwright |
| `talos-generate-test` | MEDIUM | `applicationId, prompt, testType?` | Generate a test with AI |
| `talos-discover-repository` | MEDIUM | `applicationId, force?` | Crawl and index a GitHub repo |
| `talos-get-test-run` | LOW | `runId` | Get run details + artifacts |
| `talos-list-test-runs` | LOW | `applicationId?, testId?, limit?` | List recent test runs |
| `talos-heal-test` | HIGH | `testRunId, autoApply?` | Trigger self-healing for a failed run |
| `talos-export-tests` | MEDIUM | `applicationId, testIds?, format?, platform?` | Export tests as standalone package |
| `talos_ingest_document` | MEDIUM | `applicationId, content, format, fileName, docType, version?, tags?` | Ingest a requirements document into the knowledge base |
| `talos_generate_criteria` | MEDIUM | `applicationId, requirementFilter?, maxCriteria?` | Generate acceptance criteria from knowledge base via AI/RAG |
| `talos_get_traceability` | LOW | `applicationId` | Get requirements traceability report (coverage, gaps) |
| `talos_create_criteria` | MEDIUM | `applicationId, title, description, scenarios?, ...` | Create a new acceptance criterion |
| `talos_update_criteria` | MEDIUM | `id, title?, description?, status?, ...` | Update an existing acceptance criterion |
| `talos_list_criteria` | LOW | `applicationId, status?, tags?, nfrTags?` | List acceptance criteria with optional filters |
| `talos_delete_criteria` | HIGH | `id` | Permanently delete an acceptance criterion |
| `talos-orchestrate-agents` | MEDIUM | `agents[], mode?, aggregation_prompt?, timeout_seconds?` | Orchestrate multiple AI agents (session or task mode) |
| `talos-spawn-agent` | MEDIUM | `goal, context?, model?, auto_approve_tools?` | Spawn a single AI agent as a background task or session delegate |

---

## Agent Orchestration

Talos supports two modes for multi-agent orchestration:

### Session Mode (~2 API calls)

Uses `@github/copilot-sdk` subagent delegation. A single prompt composed from all agent goals is sent to `copilot.chat()` with `enableSubagents: true` and `customAgents`. The SDK handles sub-agent dispatch internally.

```
orchestrate-agents(mode: "session")
  ├─ Compose prompt from all agent goals
  ├─ copilot.chat(prompt, { enableSubagents: true, customAgents })
  └─ Return synthesized result
```

### Task Mode (N+1 API calls)

Fans out individual background tasks via `PlatformRepository.createTask()`. Each task runs independently and is polled for completion.

```
orchestrate-agents(mode: "task")
  ├─ Create N tasks via platformRepo.createTask()
  ├─ Poll tasks until completion or timeout
  └─ Return aggregated results
```

### Configuration

```typescript
// src/talos/config.ts
orchestration: {
  defaultMode: "task" | "session"  // default: "task"
}
```

### Context Propagation

Module-level setters (`setActiveOrchestrateContext` / `clearActiveOrchestrateContext`) propagate orchestration context to child tools like `spawn-agent`, following the same pattern as openzigs `setActiveChatContext()`.

### Copilot365 Integration

When a Copilot365 MCP server is configured, application creation emits a `copilot365:suggest-research` Socket.IO event. The UI can prompt the user to pull documents from Microsoft 365.

- `GET /api/admin/copilot365/status` — Returns `{ available, serverName, enabled }`

---

## Data Flow

### Discovery → Index Pipeline

The discovery pipeline is triggered by `POST /api/talos/applications/:id/discover`. The endpoint returns `{ jobId }` immediately and runs the full scan asynchronously, emitting progress via Socket.IO.

**Socket.IO Event Contract**

| Event | Payload | When |
|-------|---------|------|
| `discovery:started` | `{ jobId, applicationId }` | Immediately on POST |
| `discovery:progress` | `{ jobId, phase, progress, message }` | After `DiscoveryEngine.startDiscovery()` completes |
| `discovery:complete` | `{ jobId, filesDiscovered, chunksCreated }` | After AppIntelligenceScanner finishes |
| `discovery:error` | `{ jobId, error }` | On any failure (error message is sanitized before broadcast) |

All events include the `jobId` so clients can correlate events to the correct discovery run.

**Requires**: GitHub PAT available to the RAG initializer (via `GITHUB_TOKEN`, `GITHUB_PERSONAL_ACCESS_TOKEN`, or `COPILOT_GITHUB_TOKEN` env vars, or the same keys in `~/.talos/.env`). If RAG is not initialized, the endpoint returns `503 Service Unavailable`.

```
POST /api/talos/applications/:id/discover
  │
  ├─ res.json({ jobId })          ← immediate HTTP response
  │
  └─ async pipeline:
       │
       ▼
     GitHubApiClient.getTree("HEAD", recursive=true)
       │
       ▼
     Filter (extensions, patterns, size)
       │
       ▼
     GitHubApiClient.getFileText(path)  ← per file
       │
       ▼
     FileChunker.chunk(path, content, appId)
       │  ├─ Structural: function/class boundaries
       │  └─ Sliding window: fixed-size overlapping
       ▼
     RagPipeline.indexChunks(appId, chunks)
       │
       ├─ Dedup (contentHash)
       ├─ EmbeddingService.embedBatch(texts)
       └─ VectorStore.add(records)
       │
       ▼
     io.emit("discovery:progress", { jobId, ... })
       │
       ▼
     AppIntelligenceScanner.scan(tree, getFileText)
       │  ├─ detectTechStack()
       │  ├─ detectDatabases()
       │  ├─ detectTestUsers()
       │  └─ detectDocumentation()
       ▼
     repo.saveIntelligenceReport(report)
     io.emit("intelligence:scanned", { applicationId, report })
     io.emit("discovery:complete", { jobId, filesDiscovered, chunksCreated })
```

### Test Generation Pipeline

```
User Prompt + Application ID
  │
  ▼
RagPipeline.retrieve(appId, prompt)
  │
  ▼
PromptBuilder.buildPrompt({
  application, existingTests, relevantCode, userRequest
})
  │
  ▼
LLM Call (system + user prompts)
  │
  ▼
Extract code block from response
  │
  ▼
CodeValidator.validate(code)
  │
  ├─ Valid → CodeValidator.autoFix(code) → Save TalosTest
  └─ Invalid → Append errors to prompt → Retry (max 3x)
```

### Test Execution Pipeline

```
TalosTest + RunOptions
  │
  ├─ CredentialInjector.getCredentials(appId, roleType)
  │
  ▼
PlaywrightRunner.executeWithRetries(test, run, options)
  │
  ├─ Launch browser (chromium/firefox/webkit)
  ├─ Create context (video, viewport)
  ├─ Start trace
  ├─ Compile & execute test code
  ├─ On failure: screenshot, error capture
  ├─ Stop trace, collect artifacts
  └─ ArtifactManager.save(screenshots, videos, traces, logs)
  │
  ▼
TalosTestRun updated (status, duration, error, artifacts)
```

### Self-Healing Loop

```
Failed TalosTestRun
  │
  ▼
Guard: enabled? not healing? retries < max? cooldown?
  │
  ▼
FailureAnalyzer.analyze(run)
  │  ├─ Categorize (selector-changed, timeout, etc.)
  │  ├─ Extract affected selectors
  │  └─ Suggest fix strategies
  │
  ▼
FixGenerator.generateFixes(test, run, analysis)
  │  ├─ LLM call with test code + analysis
  │  ├─ Parse fixes with confidence scores
  │  └─ Validate each fix
  │
  ▼
Select best fix (confidence ≥ 85%)
  │
  ├─ Below threshold → Reject → Require human review
  │
  ▼
Verification run (trigger: "healing-verification")
  │
  ├─ Pass → Apply fix → Update test code
  └─ Fail → Revert → Log attempt
  │
  ▼
HealingAttempt recorded (audit trail)
```

### Pipeline Implementation (v2)

As of this version, all orchestration steps are wired to real engine implementations:

| Step | Engine | Fallback |
|------|--------|---------|
| `discover` | `DiscoveryEngine` → `GitHubApiClient` | Emits warning, step result includes `reason: "Discovery engine not configured"` |
| `index` | `RagPipeline.indexChunks()` via `EmbeddingService` | Skipped with `{ indexed: 0, reason: "RAG not configured" }` |
| `generate` | `TestGenerator.generate()` with RAG context | Falls back to direct Copilot chat if TestGenerator unavailable |
| `execute` | `PlaywrightRunner.executeTest()` | DB records created with pending status if runner unavailable |

#### Embedding Provider

Talos uses the **GitHub Models REST API** for embeddings — no separate OpenAI API key is required. The same GitHub PAT used by the Copilot SDK is reused for embedding requests to `https://models.github.ai/inference/embeddings` with model `openai/text-embedding-3-small`.

Set `TALOS_ALLOW_PRIVATE_URLS=true` to allow using `http://localhost` application URLs in development.

#### AI Generation Pipeline

Test generation uses `@github/copilot-sdk` exclusively:
1. `CopilotWrapperService.chat()` is the entry point for all LLM requests
2. `RagPipeline.search()` retrieves relevant code context chunks
3. `PromptBuilder` constructs structured prompts combining RAG context + user request
4. `TestGenerator` validates generated code via `CodeValidator`
5. Tests below the confidence threshold (80%) are stored as `draft` status

### Export Pipeline

```
Application + ExportOptions
  │
  ▼
PackageBuilder.build(appId, options)
  │
  ├─ Generate playwright.config.ts
  ├─ Generate package.json with scripts
  ├─ Generate tsconfig.json
  ├─ Per test:
  │   ├─ CredentialSanitizer.sanitize(code)
  │   └─ Write tests/{name}.spec.ts
  ├─ Generate README.md
  ├─ Generate .env.example
  └─ Optional: fixtures/, pages/
  │
  ▼
ExportEngine.export(appId, { format, outputPath })
  │
  ├─ zip → Create in-memory ZIP → Write to outputDir
  ├─ directory → Write files to disk
  ├─ single-file → Concatenate all tests
  └─ json → Serialize metadata + tests
```

---

## Security Architecture

### Credential Protection

- **Vault references**: Credentials are never stored in the database. `usernameRef` and `passwordRef` are opaque references (e.g., `vault:github-pat-myapp`) resolved at runtime via an async callback.
- **Sanitization on export**: `CredentialSanitizer` replaces hardcoded secrets with `process.env.*` references. Generates `.env.example` with placeholder keys.
- **Cache isolation**: `CredentialInjector` caches resolved secrets in memory per `{appId}:{roleType}`. Cache can be cleared per-app or globally.
- **TOTP generation**: MFA secrets handled internally — cleartext secret never exposed to test code.

### Code Safety

- **Banned patterns**: `eval()`, `Function()`, `require()`, `process.exit()`, `child_process`, file deletion APIs are rejected by `CodeValidator`.
- **Input validation**: All MCP tool inputs validated via Zod schemas before handler execution.
- **SQL injection prevention**: Parameterized queries throughout `TalosRepository` (better-sqlite3 prepared statements).
- **Foreign key constraints**: `ON DELETE CASCADE` prevents orphan records.

### GitHub API

- **Rate limit awareness**: Tracks `x-ratelimit-remaining`, backs off exponentially.
- **PAT scoping**: GitHub PAT resolved per-application — each app can use a different token with minimal scope.
- **Cache TTL**: Prevents stale data persisting beyond 5 minutes.

---

## File System Layout

```
~/.talos/                          # TALOS data directory
├── talos.db                       # SQLite database (WAL mode)
├── auth.json                      # Copilot device auth token
├── sessions/                      # Chat session history (JSONL)
├── logs/                          # Audit logs
├── vectordb/                      # LanceDB storage
│   └── talos_chunks/              # Vector collection
├── artifacts/                     # Test run artifacts
│   └── {testRunId}/
│       ├── screenshot/
│       ├── video/
│       ├── trace/
│       └── log/
└── exports/                       # Exported test packages
    └── {app-slug}-{timestamp}/
```

---

## Platform Module

**Location:** `src/platform/`, `src/copilot/`, `src/api/`

The platform module provides shared services for AI chat, configuration, and automation.

### Platform Repository (`src/platform/repository.ts`)

SQLite-backed data access layer with auto-migrating schema. Tables:

| Table | Purpose |
|-------|---------|
| `personality` | System personality profiles (name, systemPrompt, isActive) |
| `saved_prompts` | Prompt library with stages, preferred tools, categories |
| `scheduled_jobs` | Cron-scheduled automation jobs |
| `agent_tasks` | Task queue with status tracking and parent-child DAG |
| `mcp_servers` | MCP server configurations (stdio/http/sse/docker); v3 migration adds `category TEXT` and `tags_json TEXT` columns |
| `skills` | Skill definitions with tags and enable/disable |

### Copilot Wrapper (`src/copilot/copilot-wrapper.ts`)

Wraps `@github/copilot-sdk` for:
- **Device-flow authentication** — writes token to `~/.talos/auth.json`
- **Streaming chat** — AsyncGenerator<string> via internal queue
- **Model management** — list, select, configure reasoning effort
- **Token tracking** — per-session usage accumulator

### Admin API (`src/api/admin.ts`)

Express Router at `/api/admin` with full CRUD for all platform entities:
- `GET/POST /auth/*` — device auth flow
- `GET/PUT /models/*` — model selection and configuration
- `GET/POST/PUT /personality/*` — personality management
- CRUD: `/prompts`, `/scheduler/jobs`, `/tasks`, `/mcp-servers`, `/skills`

### Criteria API (`src/api/criteria.ts`)

Express Router at `/api/talos/criteria` with endpoints for acceptance criteria management:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/:appId` | List criteria for an application (optional `status`, `tags` query params) |
| `POST` | `/:appId` | Create a new criterion (Zod-validated body) |
| `PUT` | `/:id` | Update an existing criterion by ID |
| `DELETE` | `/:id` | Delete a criterion by ID |
| `POST` | `/:appId/generate` | Bulk AI generation of criteria from knowledge base |
| `POST` | `/:appId/suggest` | AI suggest a single criterion from natural language |
| `GET` | `/traceability/:appId` | Get traceability coverage report |

### UI Pages

| Route | Page | Features |
|-------|------|----------|
| `/chat` | Chat Interface | Socket.IO streaming, message history |
| `/admin` | Admin Settings | Auth, Personality, Models, MCP Servers tabs |
| `/library` | Prompt Library | CRUD, search, category filter, template variables |
| `/skills` | Skills Management | CRUD, tag filtering, enable/disable |
| `/scheduler` | Scheduler | Cron jobs with presets, run tracking |
| `/tasks` | Task Queue | Status dashboard, stats cards, real-time polling |
| `/workbench` | Workbench | Markdown editor with preview, file I/O |

---

## CI/CD

### Workflows

| Workflow | Trigger | Runner | Jobs |
|----------|---------|--------|------|
| `ci.yml` | Push to `main`, PRs | `ubuntu-latest` | `api` (lint, typecheck, test) + `ui` (lint, test, build) |
| `codeql.yml` | Push to `main`, PRs, weekly | `ubuntu-latest` | JavaScript/TypeScript + Python analysis |
| `release.yml` | Push to `main` | `ubuntu-latest` | Build root + UI packages |

### Quality Gates

- **692 tests** (backend) across 32 test files
- **Lint**: ESLint with @typescript-eslint
- **Type checking**: `tsc --noEmit` with strict mode
- **Build verification**: Next.js build for UI
