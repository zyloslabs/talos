# TALOS User Guide

> **Test Automation & Logic Orchestration System**
>
> A comprehensive guide to setting up, configuring, and operating TALOS — an autonomous E2E testing engine that discovers your application's source code, generates Playwright tests with AI, executes them across browsers, self-heals failures, and exports portable test packages.

---

## Table of Contents

- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
  - [Applications](#applications)
  - [Tests](#tests)
  - [Test Runs](#test-runs)
  - [Vault Roles](#vault-roles)
  - [Artifacts](#artifacts)
  - [Discovery Jobs](#discovery-jobs)
- [Configuration](#configuration)
  - [Configuration Reference](#configuration-reference)
  - [Runner Configuration](#runner-configuration)
  - [Healing Configuration](#healing-configuration)
  - [Generator Configuration](#generator-configuration)
  - [Discovery Configuration](#discovery-configuration)
  - [Vector Database Configuration](#vector-database-configuration)
  - [Embedding Configuration](#embedding-configuration)
  - [Export Configuration](#export-configuration)
  - [Artifacts Configuration](#artifacts-configuration)
- [Workflows](#workflows)
  - [1. Register an Application](#1-register-an-application)
  - [2. Configure Vault Credentials](#2-configure-vault-credentials)
  - [3. Discover & Index Repository](#3-discover--index-repository)
  - [4. Generate Tests](#4-generate-tests)
  - [5. Execute Tests](#5-execute-tests)
  - [6. Review Artifacts](#6-review-artifacts)
  - [7. Self-Healing](#7-self-healing)
  - [8. Export Tests](#8-export-tests)
- [UI Dashboard](#ui-dashboard)
  - [Dashboard Overview](#dashboard-overview)
  - [Test Matrix](#test-matrix)
  - [Artifact Viewer](#artifact-viewer)
  - [Vault Manager](#vault-manager)
- [MCP Tools Reference](#mcp-tools-reference)
- [Test Generation](#test-generation)
  - [Writing Effective Prompts](#writing-effective-prompts)
  - [Generation Flow](#generation-flow)
  - [Validation & Auto-Fix](#validation--auto-fix)
  - [Page Object Model](#page-object-model)
- [Self-Healing System](#self-healing-system)
  - [How It Works](#how-it-works)
  - [Failure Categories](#failure-categories)
  - [Confidence Thresholds](#confidence-thresholds)
  - [Healing Audit Trail](#healing-audit-trail)
- [Exporting Tests](#exporting-tests)
  - [Export Formats](#export-formats)
  - [Credential Sanitization](#credential-sanitization)
  - [Running Exported Tests](#running-exported-tests)
- [Discovery & RAG](#discovery--rag)
  - [Repository Crawling](#repository-crawling)
  - [Chunking Strategies](#chunking-strategies)
  - [Vector Search](#vector-search)
  - [Re-indexing](#re-indexing)
- [Cross-Browser Testing](#cross-browser-testing)
- [Credential Management](#credential-management)
  - [Role Types](#role-types)
  - [Vault References](#vault-references)
  - [Login Helpers](#login-helpers)
  - [MFA / TOTP Support](#mfa--totp-support)
- [Artifact Management](#artifact-management)
  - [Artifact Types](#artifact-types)
  - [Storage & Retention](#storage--retention)
  - [Viewing Artifacts](#viewing-artifacts)
- [Knowledge Base](#knowledge-base)
  - [Document Ingestion](#document-ingestion)
  - [Auto-Tagging](#auto-tagging)
  - [Supported Formats](#supported-formats)
- [Acceptance Criteria](#acceptance-criteria)
  - [Creating Criteria](#creating-criteria)
  - [AI Generation](#ai-generation)
  - [AI Suggestions](#ai-suggestions)
  - [Managing Criteria](#managing-criteria)
- [Traceability](#traceability)
  - [Linking Criteria to Tests](#linking-criteria-to-tests)
  - [Coverage Reports](#coverage-reports)
- [Setup Wizard](#setup-wizard)
- [Development](#development)
  - [Project Structure](#project-structure)
  - [Running Tests](#running-tests)
  - [Linting & Formatting](#linting--formatting)
  - [Type Checking](#type-checking)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)

---

## Getting Started

### Prerequisites

| Requirement | Version | Purpose |
|-------------|---------|---------|
| **Node.js** | ≥22.0.0 | Runtime |
| **pnpm** | 10.28.2+ | Package manager |
| **Playwright browsers** | Latest | Test execution |
| **OpenAI API key** | — | Embeddings for RAG (optional for test generation) |

### Installation

```bash
# Clone the repository
git clone https://github.com/zyloslabs/talos.git
cd talos

# Install dependencies for both root and UI packages
pnpm install

# Install Playwright browsers
npx playwright install

# Build the project
pnpm build

# Build the UI
cd ui && pnpm build && cd ..
```

### Quick Start

```bash
# 1. Start the backend server (development mode with hot reload)
pnpm dev

# 2. In a separate terminal, start the UI
cd ui && pnpm dev

# 3. Open the dashboard
# → http://localhost:3001/talos
```

The UI runs on port **3001** by default. The backend API base URL is configurable via the `NEXT_PUBLIC_TALOS_API_BASE` environment variable.

---

## Core Concepts

### Applications

An **Application** represents a target web application you want to test. It stores:

- **Name**: Human-readable identifier (e.g., "Acme Dashboard").
- **Repository URL**: GitHub repository for source code discovery (e.g., `https://github.com/acme/dashboard`).
- **Base URL**: Where the application is deployed (e.g., `https://staging.acme.com`).
- **GitHub PAT Reference**: Vault reference for the GitHub Personal Access Token used to crawl the repo (e.g., `vault:github-pat-acme`).
- **Status**: `active`, `archived`, or `pending`.
- **Metadata**: Arbitrary JSON for custom fields.

Each application has its own tests, test runs, vault roles, and discovery history — fully isolated from other applications.

### Tests

A **Test** is a Playwright test case generated by TALOS or imported manually:

- **Type**: `e2e` (end-to-end), `smoke` (critical path), `regression` (change verification), `accessibility` (a11y compliance), or `unit`.
- **Code**: The full Playwright test source code (TypeScript).
- **Status lifecycle**: `draft` → `active` → `disabled` → `archived`.
- **Version**: Semantic versioning (e.g., `1.0.0`). Incremented when the code changes.
- **Code hash**: SHA-256 of the test code for change detection.
- **Generation confidence**: 0–1 score from the AI generator. Higher = more likely to run correctly.
- **POM dependencies**: List of Page Object Model classes the test depends on.
- **Selectors**: Extracted CSS/test-id selectors from the code.
- **Tags**: Categorization labels (e.g., `["auth", "critical", "login"]`).

### Test Runs

A **Test Run** is a single execution of a test:

- **Trigger**: What started the run — `manual`, `scheduled`, `ci`, `healing`, or `healing-verification`.
- **Browser**: `chromium`, `firefox`, or `webkit`.
- **Environment**: `local`, `staging`, or `production`.
- **Status lifecycle**: `queued` → `running` → `passed` | `failed` | `skipped` | `cancelled`.
- **Retry attempt**: 0 (first try), 1, 2, etc. Automatic retries are configurable.
- **Duration**: Milliseconds from start to completion.
- **Error details**: `errorMessage` and `errorStack` for failed runs.
- **Vault role**: Optional reference to credentials used during execution.

### Vault Roles

A **Vault Role** stores credential references for a specific user persona:

- **Role types**: `admin`, `standard`, `guest`, `service`, `user`.
- **Username reference**: Pointer to the actual username in your secret store (e.g., `vault:acme-admin-user`).
- **Password reference**: Pointer to the actual password (e.g., `vault:acme-admin-pass`).
- **Additional references**: Map of extra secrets like MFA tokens, API keys, etc.

Vault roles are scoped to an application and resolved at runtime — no cleartext credentials are stored in the database.

### Artifacts

**Artifacts** are files produced during test execution:

| Type | Description | Example |
|------|-------------|---------|
| `screenshot` | Page capture at a point in time | Failure screenshot, step capture |
| `video` | Full recording of the test session | `.webm` recording |
| `trace` | Playwright trace archive | `.zip` with timeline, DOM snapshots, network |
| `log` | Text log output | Test console output |
| `report` | HTML report | Playwright HTML reporter output |
| `diff` | Visual comparison | Before/after screenshot diff |

### Discovery Jobs

A **Discovery Job** tracks the progress of repository crawling:

- **Status**: `pending` → `running` → `completed` | `failed`.
- **Counters**: `filesDiscovered`, `filesIndexed`, `chunksCreated`.
- **Error message**: If the job fails (e.g., invalid PAT, rate limit exceeded).

---

## Configuration

TALOS uses Zod-validated configuration with sensible defaults for every field. You can provide a partial config — Zod fills in missing values automatically.

### Configuration Reference

```typescript
{
  enabled: true,                    // Master switch for TALOS

  vectorDb: {
    type: "lancedb",               // "lancedb" or "qdrant"
    path: "~/.talos/vectordb",     // LanceDB storage path
    collectionName: "talos_chunks" // Vector collection name
    // qdrantUrl: "...",           // Only if type = "qdrant"
    // qdrantApiKey: "...",        // Only if type = "qdrant"
  },

  embedding: {
    provider: "openai",            // "openai" or "local"
    model: "text-embedding-3-small",
    dimensions: 1536,
    batchSize: 100                 // Texts per API call
  },

  runner: {
    defaultBrowser: "chromium",    // "chromium", "firefox", or "webkit"
    timeout: 30000,                // Action timeout (ms)
    navigationTimeout: 60000,      // Page navigation timeout (ms)
    traceMode: "on-first-retry",   // "off", "on", "retain-on-failure", "on-first-retry"
    screenshotOnFailure: true,
    video: "retain-on-failure",    // "off", "on", "retain-on-failure", "on-first-retry"
    retries: 2,                    // Automatic retry attempts
    workers: 1,                    // Parallel test workers
    headless: true,                // Run without UI
    slowMo: 0                     // Delay between actions (ms, for debugging)
  },

  healing: {
    confidenceThreshold: 0.85,     // Min confidence to auto-apply fix (0-1)
    maxRetries: 3,                 // Max healing attempts per test
    enabled: true,
    cooldownMs: 5000,              // Wait between healing attempts
    // model: "gpt-4o"            // Custom LLM model for healing
  },

  generator: {
    confidenceThreshold: 0.8,      // Min confidence for production use
    requireReview: true,           // Human review before activation
    maxContextChunks: 10,          // RAG chunks included in prompt
    usePom: true,                  // Enforce Page Object Model pattern
    // model: "gpt-4o"            // Custom LLM model for generation
  },

  export: {
    outputDir: "~/.talos/exports",
    sanitizeCredentials: true,     // Replace secrets with env vars
    includeEnvTemplate: true       // Generate .env.example
  },

  artifacts: {
    path: "~/.talos/artifacts",
    retentionDays: 30,             // Auto-delete after N days
    maxStorageMb: 5000             // 5 GB storage cap
  },

  discovery: {
    includeExtensions: [".ts", ".tsx", ".js", ".jsx", ".vue", ".svelte", ".html", ".css"],
    excludePatterns: ["node_modules", ".git", "dist", "build", ".next", "coverage"],
    maxFileSizeBytes: 1000000,     // 1 MB per file
    chunkSize: 1000,               // Characters per chunk
    chunkOverlap: 200              // Overlap between adjacent chunks
  },

  githubMcp: {
    rateLimitPerHour: 5000,
    backoffBaseMs: 1000,
    backoffMaxMs: 60000,
    cacheTtlSeconds: 300           // 5 min cache
  }
}
```

### Runner Configuration

The runner configuration controls Playwright execution behavior:

| Setting | Default | Description |
|---------|---------|-------------|
| `defaultBrowser` | `chromium` | Default browser for test execution |
| `timeout` | `30000` | Maximum time (ms) for a single Playwright action |
| `navigationTimeout` | `60000` | Maximum time (ms) for page navigations |
| `traceMode` | `on-first-retry` | When to save Playwright traces |
| `screenshotOnFailure` | `true` | Capture screenshot on test failure |
| `video` | `retain-on-failure` | When to save video recordings |
| `retries` | `2` | Number of automatic retries for failed tests |
| `workers` | `1` | Number of parallel test workers |
| `headless` | `true` | Run browsers without visible UI |
| `slowMo` | `0` | Delay between Playwright actions (ms) — useful for debugging |

**Trace modes explained:**
- `off` — No traces recorded.
- `on` — Always record traces (large files, use for debugging).
- `retain-on-failure` — Record traces but only save when a test fails.
- `on-first-retry` — Only record on the first retry attempt (default, balances coverage vs. size).

### Healing Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `confidenceThreshold` | `0.85` | Minimum confidence to auto-apply a fix without human review |
| `maxRetries` | `3` | Maximum healing attempts for a single test |
| `enabled` | `true` | Enable/disable the self-healing system |
| `cooldownMs` | `5000` | Minimum wait between healing attempts |
| `model` | — | Optional LLM model override for healing prompts |

### Generator Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `confidenceThreshold` | `0.8` | Minimum confidence for a test to be considered viable |
| `requireReview` | `true` | Whether generated tests require human review before activation |
| `maxContextChunks` | `10` | Number of RAG code chunks to include in generation prompts |
| `usePom` | `true` | Enforce Page Object Model pattern in generated tests |
| `model` | — | Optional LLM model override |

### Discovery Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `includeExtensions` | `.ts, .tsx, .js, .jsx, .vue, .svelte, .html, .css` | File extensions to index |
| `excludePatterns` | `node_modules, .git, dist, build, .next, coverage` | Directory patterns to skip |
| `maxFileSizeBytes` | `1000000` (1 MB) | Skip files larger than this |
| `chunkSize` | `1000` | Target chunk size in characters |
| `chunkOverlap` | `200` | Overlap between adjacent chunks |

### Vector Database Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `type` | `lancedb` | Vector store backend (`lancedb` or `qdrant`) |
| `path` | `~/.talos/vectordb` | Storage directory for LanceDB |
| `collectionName` | `talos_chunks` | Name of the vector collection |
| `qdrantUrl` | — | Qdrant server URL (only when `type: "qdrant"`) |
| `qdrantApiKey` | — | Qdrant API key (only when `type: "qdrant"`) |

### Embedding Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `provider` | `openai` | Embedding provider (`openai` or `local`) |
| `model` | `text-embedding-3-small` | Model name |
| `dimensions` | `1536` | Embedding vector dimensions |
| `batchSize` | `100` | Number of texts per API call |

### Export Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `outputDir` | `~/.talos/exports` | Directory for exported packages |
| `sanitizeCredentials` | `true` | Replace hardcoded secrets with `process.env.*` |
| `includeEnvTemplate` | `true` | Generate `.env.example` with placeholder keys |

### Artifacts Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `path` | `~/.talos/artifacts` | Storage directory |
| `retentionDays` | `30` | Delete artifacts older than N days |
| `maxStorageMb` | `5000` | Maximum total storage (MB) |

---

## Workflows

### 1. Register an Application

Before TALOS can generate or run tests, you need to register the target application.

**Via MCP Tool:**
```
Tool: talos-create-application
Inputs:
  name: "Acme Dashboard"
  repositoryUrl: "https://github.com/acme/dashboard"
  baseUrl: "https://staging.acme.com"
  githubPatRef: "vault:github-pat-acme"    # Optional, for discovery
  description: "Customer-facing analytics dashboard"
```

**Via UI:**
1. Navigate to the **Dashboard** (`/talos`).
2. Click **Add Application**.
3. Fill in the name, repository URL, and base URL.
4. Click **Create**.

### 2. Configure Vault Credentials

If your application requires authentication for testing, set up vault roles.

**Via MCP Tool:**
```
Tool: talos-create-vault-role (via repository API)
Inputs:
  applicationId: "<app-id>"
  roleType: "admin"
  name: "Admin User"
  usernameRef: "vault:acme-admin-username"
  passwordRef: "vault:acme-admin-password"
  additionalRefs: {
    "mfaSecret": "vault:acme-admin-mfa"
  }
```

**Role types and their intended use:**

| Role | Use Case |
|------|----------|
| `admin` | Full-access testing, admin panel flows |
| `standard` | Typical user workflows |
| `guest` | Unauthenticated or limited-access scenarios |
| `service` | API/service account testing |
| `user` | Generic authenticated user |

### 3. Discover & Index Repository

Discovery crawls your repository and builds a semantic index (RAG) that the generator uses for context-aware test creation.

**Via MCP Tool:**
```
Tool: talos-discover-repository
Inputs:
  applicationId: "<app-id>"
  force: false                    # Set true to re-index from scratch
```

**What happens:**
1. Resolves your GitHub PAT from the vault.
2. Fetches the full file tree from the repository.
3. Filters files by configured extensions and exclusion patterns.
4. Reads each file's content via the GitHub API.
5. Chunks the content using structural (function/class boundaries) or sliding-window strategies.
6. Generates embeddings and stores them in the vector database.

**Progress tracking:** The UI shows real-time updates via Socket.IO — `filesDiscovered`, `filesIndexed`, `chunksCreated`.

**When to re-discover:** Run with `force: true` after significant codebase changes (new pages, refactored components, API changes). TALOS deduplicates by content hash, so unchanged files are skipped automatically.

### 4. Generate Tests

With a discovered and indexed application, you can generate tests using natural language prompts.

**Via MCP Tool:**
```
Tool: talos-generate-test
Inputs:
  applicationId: "<app-id>"
  prompt: "Generate an e2e test that verifies the admin login flow, including
           entering credentials, clicking submit, and verifying the dashboard
           loads with the user's name displayed in the top navigation."
  testType: "e2e"                 # Optional: e2e, smoke, regression, accessibility
```

**Tips for effective prompts:**
- Be specific about the user flow (e.g., "click the 'Sign In' button, enter email/password, verify redirect to `/dashboard`").
- Mention expected outcomes ("the user's name should appear in the header").
- Reference specific page elements when you know them ("the `[data-testid='login-form']` container").
- Specify the test type if it matters (smoke tests should be fast, regression tests should be thorough).

**Generated tests are created with status `draft`** — review the code, then activate.

### 5. Execute Tests

**Via MCP Tool:**
```
Tool: talos-run-test
Inputs:
  testId: "<test-id>"
  browser: "chromium"             # Optional: chromium, firefox, webkit
  vaultRoleType: "admin"          # Optional: use specific credentials
```

**Execution flow:**
1. Launches the selected browser (headless by default).
2. Injects credentials if a vault role is specified.
3. Runs the Playwright test code.
4. Captures artifacts (screenshots, video, traces) based on configuration.
5. Records the result (passed/failed, duration, errors).
6. Retries automatically (default: up to 2 times).

### 6. Review Artifacts

After a test run, review the collected artifacts to understand failures or verify behavior.

**Via UI:**
1. Navigate to **Artifacts** (`/talos/artifacts`).
2. Select a test run to view its artifacts.
3. Browse screenshots, watch videos, or download traces.

**Via MCP Tool:**
```
Tool: talos-get-test-run
Inputs:
  runId: "<run-id>"
```

Returns the run details along with all associated artifacts (file paths, types, sizes).

**Playwright traces** are particularly useful for debugging — they contain a timeline of actions, DOM snapshots, network requests, and console logs. Open them at [trace.playwright.dev](https://trace.playwright.dev).

### 7. Self-Healing

When a test fails, TALOS can automatically analyze the failure and attempt to fix the test.

**Automatic (recommended):**
TALOS can be configured to auto-heal after any failure. The healing engine:
1. Analyzes the failure (error category, affected selectors, root cause).
2. Generates one or more fix proposals using LLM + RAG context.
3. Selects the highest-confidence fix.
4. If confidence ≥ threshold (default 85%): runs a verification test with the fix.
5. If verification passes: applies the fix to the test code automatically.

**Manual trigger:**
```
Tool: talos-heal-test
Inputs:
  testRunId: "<failed-run-id>"
  autoApply: true                 # Auto-apply if confidence meets threshold
```

**When healing is skipped:**
- Healing is disabled in config.
- The test is already being healed (prevents infinite loops).
- Maximum healing retries (3) exceeded.
- Cooldown period (5s) hasn't elapsed since last attempt.

### 8. Export Tests

Export generated tests as standalone Playwright projects that run anywhere — no TALOS required.

**Via MCP Tool:**
```
Tool: talos-export-tests
Inputs:
  applicationId: "<app-id>"
  testIds: ["<test-1>", "<test-2>"]  # Optional: specific tests (default: all)
  format: "playwright"                # playwright or standalone
  platform: "macos"                   # macos, windows, or linux
```

**What you get:**
```
acme-dashboard-20260322/
├── package.json              # npm scripts: test, test:headed, test:debug
├── playwright.config.ts      # Multi-browser config with your base URL
├── tsconfig.json
├── README.md                 # Setup instructions
├── .env.example              # Required environment variables
└── tests/
    ├── login.spec.ts
    └── checkout.spec.ts
```

**To run the exported tests:**
```bash
cd acme-dashboard-20260322
npm install
cp .env.example .env          # Fill in actual credentials
npx playwright install
npx playwright test
```

---

## UI Dashboard

The TALOS Command Center is a Next.js 14 application providing real-time visibility and control.

### Dashboard Overview

**Route:** `/talos`

The main dashboard displays:
- **Application list** with search and filter by status.
- **Statistics cards** showing total tests, test runs, and pass rates.
- **Add Application** dialog for registering new targets.
- **Scan/Discover** button per application to trigger repository indexing.
- **Application cards** with name, status, repository link, and quick stats.

### Test Matrix

**Route:** `/talos/tests`

The test matrix provides:
- **Test grid** showing all tests for the selected application.
- **Color-coded type indicators** (e2e = blue, smoke = green, regression = orange, accessibility = purple).
- **Latest run status** with pass/fail icons.
- **Run test** button with browser and role selectors.
- **View code** dialog with syntax-highlighted TypeScript.
- **Tag display** for test categorization.
- **Real-time updates** — test run status changes appear instantly via Socket.IO.

### Artifact Viewer

**Route:** `/talos/artifacts`

Browse and inspect test artifacts:
- **Screenshot gallery** with thumbnails and full-size views.
- **Video player** for test recordings.
- **Trace download** links (open at trace.playwright.dev).
- **Log viewer** for text output.
- **Filters** by artifact type and test run.

### Vault Manager

**Route:** `/talos/vault`

Manage credential roles per application:
- **Role list** showing all configured roles.
- **Create role** with type selector, name, and vault references.
- **Edit/deactivate** existing roles.
- Role types are **color-coded** by privilege level.

### AI Chat

**Route:** `/chat`

Start AI-powered conversations with Talos using the Copilot SDK:
- **Real-time streaming** — messages stream in token-by-token via Socket.IO.
- **Session persistence** — conversations are saved as JSONL files in `~/.talos/sessions/` and can be restored across page reloads.
- **Tool call visualization** — when the AI invokes tools, tool name and arguments are emitted as `chat:stream:tool` events for live display.
- **Token usage tracking** — each response ends with a `tokenUsage` payload showing prompt, completion, and total tokens consumed.
- **Personality injection** — the active system personality (from Admin > Personality) is automatically injected into every chat request.
- **Prerequisites:** Authenticate via Admin > Auth before using the chat.

### Admin Settings

**Route:** `/admin`

Central management panel with four tabs:

| Tab | Purpose |
|-----|---------|
| **Auth** | Connect to GitHub Copilot via device-flow authentication. Status indicator shows current auth state. |
| **Personality** | Create, edit, and activate system personalities (system prompts) that flavor all AI responses. |
| **Models** | View available models, select the active model, and configure reasoning effort (low/medium/high/xhigh). |
| **MCP Servers** | Register and manage MCP tool servers (stdio, http, sse, docker). URLs are validated against SSRF patterns. |

**Authentication:** All admin API endpoints require a bearer token. Set `TALOS_ADMIN_TOKEN` in your environment:
```bash
export TALOS_ADMIN_TOKEN="your-secret-token"
```
The UI sends this token via the `Authorization: Bearer <token>` header.

### Prompt Library

**Route:** `/library`

Manage reusable prompt templates:
- **CRUD** — Create, read, update, and delete saved prompts.
- **Search** — Full-text search across prompt names and content.
- **Category filtering** — Filter by category (e.g., general, testing, debugging).
- **Template variables** — Prompts support `{{variable}}` interpolation.
- **Staged pipelines** — Optional multi-stage prompt sequences with per-stage tool scoping.
- **Tag display** — Visual tag badges for quick categorization.

### Skills Management

**Route:** `/skills`

Register custom agent skills:
- **CRUD** — Create, read, update, and delete skill definitions.
- **Enable/disable toggle** — Switch skills on or off without deleting them.
- **Tags** — Categorize skills with tags for easy discovery.
- **Content** — Markdown-based skill content with instructions and examples.

### Scheduler

**Route:** `/scheduler`

Automate recurring tasks with cron-based scheduling:
- **Cron expressions** — Standard 5-field cron syntax (e.g., `0 0 * * *` for midnight daily).
- **Enable/disable** — Toggle jobs without deleting them.
- **Run tracking** — View last run time, next run time, and total run count.
- **Prompt-based** — Each job executes a configured prompt when triggered.

### Task Queue

**Route:** `/tasks`

Monitor and manage background agent tasks:
- **Stats dashboard** — Cards showing counts for pending, running, completed, and failed tasks.
- **Status tabs** — Filter tasks by status (all, pending, running, completed, failed).
- **Task hierarchy** — Supports parent-child task trees with depth tracking.
- **Real-time polling** — Task list refreshes automatically.

### Workbench

**Route:** `/workbench`

A markdown editor for drafting and previewing content:
- **Split pane** — Edit markdown on the left, preview on the right.
- **Keyboard shortcuts** — Ctrl+S to save, standard editing shortcuts.
- **File I/O** — Load and save files from the local filesystem.

---

## MCP Tools Reference

TALOS exposes 21 MCP-compatible tools. Each tool validates inputs with Zod, returns JSON responses, and includes a risk level for approval gating.

### Application Management

| Tool | Risk | Description |
|------|------|-------------|
| `talos-list-applications` | LOW | List all applications, optionally filtered by status |
| `talos-get-application` | LOW | Get application details including test/run statistics |
| `talos-create-application` | MEDIUM | Register a new target application |

### Test Management

| Tool | Risk | Description |
|------|------|-------------|
| `talos-list-tests` | LOW | List tests for an application, optionally filtered by status |
| `talos-generate-test` | MEDIUM | Generate a new test using AI with RAG context |
| `talos-run-test` | MEDIUM | Execute a test with Playwright |

### Test Runs

| Tool | Risk | Description |
|------|------|-------------|
| `talos-list-test-runs` | LOW | List recent runs for an application or test |
| `talos-get-test-run` | LOW | Get run details including artifacts |

### Discovery

| Tool | Risk | Description |
|------|------|-------------|
| `talos-discover-repository` | MEDIUM | Crawl and index a GitHub repository |

### Healing

| Tool | Risk | Description |
|------|------|-------------|
| `talos-heal-test` | HIGH | Trigger self-healing for a failed test run |

### Export

| Tool | Risk | Description |
|------|------|-------------|
| `talos-export-tests` | MEDIUM | Export tests as a standalone Playwright package |

### Knowledge & Criteria

| Tool | Risk | Description |
|------|------|-------------|
| `talos_ingest_document` | MEDIUM | Ingest a requirements document (Markdown, OpenAPI) into the knowledge base |
| `talos_generate_criteria` | MEDIUM | Generate acceptance criteria from knowledge base via AI/RAG |
| `talos_get_traceability` | LOW | Get requirements traceability report (coverage, gaps) |
| `talos_create_criteria` | MEDIUM | Create a new acceptance criterion |
| `talos_update_criteria` | MEDIUM | Update an existing acceptance criterion |
| `talos_list_criteria` | LOW | List acceptance criteria with optional filters |
| `talos_delete_criteria` | HIGH | Permanently delete an acceptance criterion |

---

## Test Generation

### Writing Effective Prompts

The quality of generated tests depends heavily on your prompt. Here are guidelines:

**Be specific about the user journey:**
```
✅ "Generate a test that navigates to /settings, clicks the 'Change Password'
    button, fills in the current password, enters a new password in both fields,
    clicks 'Save', and verifies a success toast appears."

❌ "Test the settings page"
```

**Mention expected outcomes:**
```
✅ "After submitting the form, verify the user is redirected to /dashboard
    and a welcome message containing their name is visible."

❌ "Submit the form and check it works"
```

**Reference known selectors when possible:**
```
✅ "Click the button with data-testid='submit-order'"

❌ "Click the submit button"
```

**Specify roles for authenticated flows:**
```
✅ "Using admin credentials, verify the user management table is visible
    and contains at least one row."
```

**Request specific test types:**
```
✅ "Generate a smoke test that verifies the homepage loads within 3 seconds
    and displays the main navigation, hero section, and footer."
```

### Generation Flow

1. **Context gathering**: TALOS queries the RAG index for code chunks relevant to your prompt — components, routes, selectors, API endpoints.
2. **Prompt assembly**: An expert system prompt constrains the LLM to produce clean, modern Playwright code. The user prompt includes your request, app context, RAG excerpts, and existing test examples.
3. **LLM call**: The generator calls the configured LLM with the assembled prompts.
4. **Code extraction**: The generated response is parsed to extract the TypeScript code block.
5. **Validation**: `CodeValidator` checks for syntax errors, banned patterns, deprecated APIs, and required assertions.
6. **Retry loop**: If validation fails, the errors are appended to the prompt and the LLM is called again (up to 3 retries).
7. **Auto-fix**: Minor issues (deprecated APIs, missing imports) are fixed automatically.
8. **Test creation**: The validated code is saved to the database as a `draft` test with a confidence score.

### Validation & Auto-Fix

The `CodeValidator` enforces:

**Errors (block generation):**
- `eval()`, `Function()` — no dynamic code execution
- `require()` — must use ES imports
- `process.exit()` — tests shouldn't terminate the process
- `child_process` — no shell access from tests
- File deletion APIs — no destructive filesystem operations

**Warnings (logged but allowed):**
- `page.$()` → suggests `page.locator()`
- `page.$$()` → suggests `page.locator()`
- `page.waitForTimeout()` → suggests `expect` conditions

**Auto-fix handles:**
- Replacing deprecated API calls with modern equivalents
- Adding missing `import` statements
- Fixing common selector patterns

### Page Object Model

When `generator.usePom` is enabled (default), the generator follows the Page Object Model pattern:

- Each page/component gets a dedicated class with locators and actions.
- Tests call page object methods instead of raw selectors.
- Selectors are centralized for easy maintenance.
- The self-healing system benefits from POM — a selector change only needs fixing in one place.

---

## Self-Healing System

### How It Works

The self-healing system is a closed-loop automation that detects test failures, diagnoses root causes, generates fixes, verifies them, and applies the fixes — all without human intervention (when confidence is high enough).

```
Test Fails
  → FailureAnalyzer categorizes the error
  → FixGenerator creates fix proposals with LLM
  → Best fix selected by confidence score
  → Verification run executed with fixed code
  → If verification passes: fix auto-applied
  → If verification fails: reverted, logged for human review
```

### Failure Categories

| Category | Triggered By | Typical Fixes |
|----------|-------------|---------------|
| `selector-changed` | Element exists but selector doesn't match | Update selector (ID, class, text) |
| `element-not-found` | Element missing from page entirely | Update selector, add wait condition |
| `timeout` | Action took longer than timeout | Increase timeout, add explicit wait |
| `assertion-failed` | `expect()` value mismatch | Update assertion value or condition |
| `network-error` | HTTP errors, DNS failures | Add retry logic, update URL |
| `authentication-error` | 401/403, login flow broken | Verify credentials, update login flow |
| `navigation-error` | Page URL changed or unreachable | Update URL, add retry |
| `script-error` | JavaScript exception in test code | Fix code logic |
| `unknown` | Cannot be categorized | Flagged for manual review |

### Confidence Thresholds

The healing system uses confidence scores to decide whether to auto-apply fixes:

- **≥ 0.85 (default threshold)**: Fix is auto-applied after verification.
- **0.5 – 0.84**: Fix is proposed but requires human approval.
- **< 0.5**: Fix is logged but not applied — too risky.

Adjust the threshold via `healing.confidenceThreshold`. Lower values allow more aggressive auto-healing but with higher risk of incorrect fixes.

### Healing Audit Trail

Every healing attempt is recorded as a `HealingAttempt` with:

- Original error message and stack trace.
- Failure analysis (category, root cause, affected elements).
- Proposed fix with confidence score.
- Whether the fix was auto-applied or human-approved.
- Verification run ID and result.
- Timestamps for each stage.

This audit trail enables:
- Tracking healing effectiveness over time.
- Identifying recurring failure patterns.
- Understanding which fix types succeed or fail.
- Debugging when healing produces incorrect fixes.

---

## Exporting Tests

### Export Formats

| Format | Best For |
|--------|---------|
| `zip` | Sharing with team members, CI pipeline integration |
| `directory` | Local development, manual editing |
| `single-file` | Quick sharing, code review |
| `json` | API integration, programmatic consumption |

### Credential Sanitization

By default (`export.sanitizeCredentials: true`), the export process:

1. Scans all test code for hardcoded credentials using regex patterns.
2. Replaces detected values with `process.env.*` references:
   - Passwords → `process.env.TEST_PASSWORD_1`
   - API keys → `process.env.TEST_API_KEY_1`
   - Tokens → `process.env.TEST_TOKEN_1`
   - JWTs → `process.env.TEST_JWT_1`
   - Bearer tokens → `Bearer ${process.env.TEST_BEARER_TOKEN_1}`
3. Generates a `.env.example` file listing all required variables.
4. Includes a `SanitizationResult` documenting every replacement with line numbers.

### Running Exported Tests

```bash
# Navigate to the exported directory
cd acme-dashboard-20260322

# Install dependencies
npm install

# Install Playwright browsers
npx playwright install

# Copy and fill in credentials
cp .env.example .env
# Edit .env with actual values

# Run all tests
npx playwright test

# Run with browser UI (headed mode)
npx playwright test --headed

# Run specific test
npx playwright test tests/login.spec.ts

# Run in debug mode (step through)
npx playwright test --debug

# View HTML report after run
npx playwright show-report
```

---

## Discovery & RAG

### Repository Crawling

The discovery engine connects to GitHub via the REST API to crawl your application's source code:

1. **Authentication**: Resolves the GitHub PAT from your vault reference.
2. **Tree listing**: Fetches the full repository file tree recursively.
3. **Filtering**: Applies extension and pattern filters from `discovery` config.
4. **Content fetching**: Downloads each matching file's content.
5. **Rate limiting**: Automatically tracks GitHub API rate limits. Backs off exponentially when approaching the limit.
6. **Caching**: Responses are cached for 5 minutes to avoid redundant API calls during re-indexing.

### Chunking Strategies

Files are split into chunks for embedding and retrieval:

**Structural chunking** (preferred):
- Detects function declarations, classes, interfaces, type aliases, and constants using regex.
- Each symbol becomes one chunk with file path, line range, and symbol metadata.
- Best for TypeScript/JavaScript code — preserves semantic boundaries.

**Sliding window** (fallback):
- Fixed-size chunks (default 1000 characters) with overlap (default 200 characters).
- Used when structural parsing yields no results (e.g., CSS, HTML, plain text).
- Also used as a secondary pass on long functions.

**Chunk type inference:**
- `.ts`, `.tsx`, `.js`, `.jsx` → `code`
- `.test.ts`, `.spec.ts` → `test`
- `.md`, `.txt` → `documentation`
- `.json`, `.yaml`, `.yml` → `config`
- `.graphql`, `.prisma` → `schema`

### Vector Search

When generating tests or fixing failures, TALOS queries the vector store:

1. The query (user prompt or error message) is embedded using the same model as indexing.
2. LanceDB performs approximate nearest neighbor (ANN) search filtered by application ID.
3. Results are ranked by cosine similarity.
4. Top-N chunks (configurable via `generator.maxContextChunks`) are included in the LLM prompt.

Optional filters:
- **Minimum score**: Skip low-relevance results (default: none).
- **Chunk type**: Filter to only code, test, documentation, etc.

### Re-indexing

To re-index an application after significant codebase changes:

```
Tool: talos-discover-repository
Inputs:
  applicationId: "<app-id>"
  force: true
```

With `force: true`:
1. All existing vectors for the application are deleted.
2. The repository is crawled fresh.
3. New chunks are generated and embedded.
4. Deduplication by content hash prevents storing identical chunks.

Without `force`: Only new or changed files are indexed (content hash comparison).

---

## Cross-Browser Testing

TALOS supports Playwright's three browser engines:

| Browser | Engine | Use Case |
|---------|--------|----------|
| `chromium` | Chromium (Chrome/Edge) | Default, fastest, most compatible |
| `firefox` | Firefox (Gecko) | Cross-browser validation |
| `webkit` | WebKit (Safari) | macOS/iOS compatibility |

**Per-run browser selection:**
```
Tool: talos-run-test
Inputs:
  testId: "<test-id>"
  browser: "firefox"
```

**Default browser:** Configurable via `runner.defaultBrowser` (default: `chromium`).

**In exported packages:** The generated `playwright.config.ts` includes all three browsers as projects, enabling full cross-browser CI.

---

## Credential Management

### Role Types

| Type | Typical Permissions | Example Use |
|------|-------------------|-------------|
| `admin` | Full access, all features | Admin panel testing, user management |
| `standard` | Normal user access | Core workflow testing |
| `guest` | Limited/unauthenticated | Public page testing, unauthenticated flows |
| `service` | API/machine access | Service account testing, API testing |
| `user` | Authenticated user | Generic authenticated testing |

### Vault References

Credentials are stored as **references** — opaque strings that point to your actual secret store:

```
usernameRef: "vault:acme-admin-username"
passwordRef: "vault:acme-admin-password"
```

At runtime, TALOS resolves these references through an async callback. This design means:
- No cleartext credentials in the database.
- Integration with any secret management system (HashiCorp Vault, AWS Secrets Manager, etc.).
- Credentials can be rotated without modifying TALOS configuration.

### Login Helpers

The `CredentialInjector` provides a `createLoginFunction()` that generates a reusable login helper for Playwright tests:

```typescript
const login = injector.createLoginFunction(credentials, {
  loginUrl: "https://app.example.com/login",
  usernameSelector: "[data-testid='email-input']",
  passwordSelector: "[data-testid='password-input']",
  submitSelector: "[data-testid='login-button']",
  successIndicator: "[data-testid='dashboard']",
  mfaSelector: "[data-testid='mfa-input']",          // Optional
  mfaSecretKey: "vault:acme-admin-mfa"                // Optional
});

// In a test:
await login(page);
// → Navigates to login URL
// → Fills username and password
// → Clicks submit
// → Waits for dashboard to appear
// → Optionally fills MFA code
```

### MFA / TOTP Support

For applications requiring multi-factor authentication:

1. Store the TOTP secret as an additional vault reference: `additionalRefs: { "mfaSecret": "vault:acme-admin-mfa" }`.
2. The credential injector resolves the secret at runtime.
3. It generates a time-based one-time password (TOTP) using the standard algorithm.
4. The login function automatically fills the MFA input field.

---

## Artifact Management

### Artifact Types

| Type | Extension | Description |
|------|-----------|-------------|
| `screenshot` | `.png` | Page screenshots — captured on failure or at specific steps |
| `video` | `.webm` | Full session recording of the test execution |
| `trace` | `.zip` | Playwright trace archive (timeline, DOM, network, console) |
| `log` | `.log` | Text output from the test |
| `report` | `.html` | HTML test report |
| `diff` | `.png` | Visual comparison between expected and actual screenshots |

### Storage & Retention

Artifacts are stored at `~/.talos/artifacts/` organized by test run ID:

```
~/.talos/artifacts/
└── abc123-run-id/
    ├── screenshot/
    │   ├── failure.png
    │   └── step-checkout.png
    ├── video/
    │   └── recording.webm
    ├── trace/
    │   └── trace.zip
    └── log/
        └── test.log
```

**Automatic cleanup:**
- Artifacts older than `retentionDays` (default: 30) are deleted.
- If total storage exceeds `maxStorageMb` (default: 5000 MB / 5 GB), oldest artifacts are removed first.
- Run `cleanup()` manually or let the system handle it during normal operation.

### Viewing Artifacts

**Screenshots:** Viewable directly in the Artifact Viewer UI or by path.

**Videos:** Play back `.webm` recordings in the UI or any browser.

**Traces:** Download the `.zip` file and open it at [trace.playwright.dev](https://trace.playwright.dev) for an interactive timeline showing:
- Every Playwright action with before/after DOM snapshots.
- Network request waterfall.
- Console log messages.
- Screenshot at each action step.

---

## Knowledge Base

The Knowledge Base allows you to ingest requirements documents (PRDs, user stories, API specifications) into TALOS's RAG pipeline so the test generator can reason over your domain knowledge.

### Document Ingestion

Ingest documents into the knowledge base for a specific application:

**Via MCP Tool:**
```
Tool: talos_ingest_document
Inputs:
  applicationId: "<app-id>"
  content: "<raw document content>"
  format: "markdown"                 # markdown, openapi_json, or openapi_yaml
  fileName: "requirements.md"
  docType: "prd"                     # prd, user_story, api_spec, functional_spec
  version: "1.0.0"                   # Optional version tag
  tags: ["auth", "security"]         # Optional extra tags
```

**Via REST API:**
```bash
# Ingest via the criteria API is document-level; use the MCP tool for direct ingestion
```

**What happens:**
1. The document is parsed and split into semantic chunks (by heading for Markdown, by operation for OpenAPI).
2. Each chunk receives a stable ID: `req:<appId>:<fileName>:<chunkIndex>:<version>`.
3. Chunks are auto-tagged using NLP heuristics (personas, NFRs, environments, functional areas).
4. Embeddings are generated and stored in the vector database.
5. Duplicate chunks (by content hash) are skipped.

### Auto-Tagging

TALOS automatically tags document chunks using a controlled vocabulary:

| Category | Detected Tags |
|----------|--------------|
| **Doc Types** | `prd`, `user_story`, `api_spec`, `functional_spec` |
| **Personas** | `admin`, `standard`, `guest`, `service`, `user` |
| **NFR Tags** | `performance`, `security`, `accessibility`, `reliability`, `usability` |
| **Environments** | `local`, `staging`, `production`, `ci` |
| **Functional Areas** | `auth`, `checkout`, `dashboard`, `profile`, `search`, `notifications`, `navigation`, `files`, `api` |

Tags are detected from content using keyword and regex patterns. Explicit tags from document metadata are also preserved.

### Supported Formats

| Format | Extension | Chunking Strategy |
|--------|-----------|------------------|
| Markdown | `.md` | Split by heading sections (## / ###) with paragraph overlap |
| OpenAPI JSON | `.json` | One chunk per API operation (path + HTTP method) |
| OpenAPI YAML | `.yaml`, `.yml` | One chunk per API operation (parsed from YAML) |

---

## Acceptance Criteria

TALOS manages structured acceptance criteria in Given/When/Then format, linked to requirements and tests for full traceability.

### Creating Criteria

**Via MCP Tool:**
```
Tool: talos_create_criteria
Inputs:
  applicationId: "<app-id>"
  title: "User can reset password via email"
  description: "Verify the password reset flow works end-to-end"
  scenarios:
    - given: "a registered user who forgot their password"
      when: "they request a reset and click the verification link"
      then: "they can set a new password and log in"
  preconditions: ["User has a registered account"]
  dataRequirements: ["Valid email address"]
  nfrTags: ["security", "usability"]
  tags: ["auth"]
```

**Via REST API:**
```bash
curl -X POST http://localhost:3000/api/talos/criteria/<app-id> \
  -H "Content-Type: application/json" \
  -d '{"title": "User can reset password", "description": "...", "scenarios": [...]}'
```

### AI Generation

Generate acceptance criteria in bulk from your ingested knowledge base:

**Via MCP Tool:**
```
Tool: talos_generate_criteria
Inputs:
  applicationId: "<app-id>"
  requirementFilter: "authentication login"   # Optional filter query
  maxCriteria: 20                             # Max criteria to generate (1-100)
```

**Via REST API:**
```bash
curl -X POST http://localhost:3000/api/talos/criteria/<app-id>/generate \
  -H "Content-Type: application/json" \
  -d '{"requirementFilter": "authentication", "maxCriteria": 10}'
```

The generator:
1. Retrieves relevant requirement chunks from the RAG knowledge base.
2. Builds a prompt with system instructions and few-shot examples.
3. Calls the LLM to generate structured Given/When/Then criteria.
4. Saves all criteria atomically in a single database transaction.
5. Returns counts and average confidence scores.

### AI Suggestions

Generate a single criterion from a natural-language description:

**Via REST API:**
```bash
curl -X POST http://localhost:3000/api/talos/criteria/<app-id>/suggest \
  -H "Content-Type: application/json" \
  -d '{"description": "Users should be able to export reports as PDF"}'
```

### Managing Criteria

**List criteria:**
```
Tool: talos_list_criteria
Inputs:
  applicationId: "<app-id>"
  status: "draft"                    # Optional: draft, approved, implemented, deprecated
  tags: ["auth"]                     # Optional tag filter
```

**Update a criterion:**
```
Tool: talos_update_criteria
Inputs:
  id: "<criteria-id>"
  status: "approved"
  confidence: 0.95
```

**Delete a criterion:**
```
Tool: talos_delete_criteria
Inputs:
  id: "<criteria-id>"
```

**Status lifecycle:** `draft` → `approved` → `implemented` → `deprecated`

---

## Traceability

TALOS tracks the relationships between requirements, acceptance criteria, and tests to provide full requirements traceability.

### Linking Criteria to Tests

When a test is generated or manually linked, TALOS creates a traceability record connecting:
- **Requirement chunk** (from the knowledge base)
- **Acceptance criterion** (the testable requirement)
- **Test** (the Playwright test that verifies it)

Links are managed automatically when tests are generated from criteria, or manually via the repository API.

### Coverage Reports

Get a traceability report showing requirement coverage:

**Via MCP Tool:**
```
Tool: talos_get_traceability
Inputs:
  applicationId: "<app-id>"
```

**Via REST API:**
```bash
curl http://localhost:3000/api/talos/criteria/traceability/<app-id>
```

**Report contents:**
- Total requirements vs. covered requirements
- Total criteria vs. implemented criteria
- Coverage percentage
- List of unmapped requirements (no criteria linked)
- List of untested criteria (no test linked)

Use coverage reports to identify gaps in your test coverage and prioritize test generation efforts.

---

## Setup Wizard

The Setup Wizard provides a guided 7-step configuration flow for new TALOS installations, accessible from the UI.

### Wizard Steps

| Step | Name | Description |
|------|------|-------------|
| 1 | **Welcome** | Introduction and prerequisites check |
| 2 | **Authentication** | Connect to GitHub Copilot via device-flow auth |
| 3 | **Model Selection** | Choose AI model and configure reasoning effort |
| 4 | **Application Setup** | Register your first target application |
| 5 | **Vault Credentials** | Configure test user credentials |
| 6 | **Discovery** | Run initial repository discovery and indexing |
| 7 | **Verification** | Run a smoke test to verify the setup works |

The wizard stores progress locally and can be resumed if interrupted. Each step validates prerequisites before proceeding to the next.

---

## Development

### Project Structure

```
talos/
├── src/talos/                    # Core engine
│   ├── index.ts                 # Entry point & exports
│   ├── types.ts                 # Domain types (~600 lines)
│   ├── config.ts                # Zod config schemas with defaults
│   ├── config.test.ts           # Config tests
│   ├── repository.ts            # SQLite DAL (~1000 lines)
│   ├── repository.test.ts       # Repository tests (24 tests)
│   ├── tools.ts                 # MCP tool definitions (14 tools)
│   ├── discovery/               # GitHub crawling & chunking
│   │   ├── discovery-engine.ts
│   │   ├── github-mcp-client.ts
│   │   ├── file-chunker.ts
│   │   ├── file-chunker.test.ts # Chunker tests (11 tests)
│   │   └── index.ts
│   ├── rag/                     # Embeddings & vector search
│   │   ├── embedding-service.ts
│   │   ├── vector-store.ts
│   │   ├── rag-pipeline.ts
│   │   └── index.ts
│   ├── runner/                  # Playwright execution
│   │   ├── playwright-runner.ts
│   │   ├── artifact-manager.ts
│   │   ├── credential-injector.ts
│   │   └── index.ts
│   ├── generator/               # AI test generation
│   │   ├── test-generator.ts
│   │   ├── prompt-builder.ts
│   │   ├── code-validator.ts
│   │   ├── code-validator.test.ts  # Validator tests (13 tests)
│   │   └── index.ts
│   ├── healing/                 # Self-healing system
│   │   ├── healing-engine.ts
│   │   ├── failure-analyzer.ts
│   │   ├── failure-analyzer.test.ts  # Analyzer tests (12 tests)
│   │   ├── fix-generator.ts
│   │   └── index.ts
│   └── export/                  # Package export
│       ├── export-engine.ts
│       ├── package-builder.ts
│       ├── credential-sanitizer.ts
│       ├── credential-sanitizer.test.ts  # Sanitizer tests (13 tests)
│       └── index.ts
├── ui/                           # Next.js 14 frontend
│   ├── app/talos/               # App Router pages
│   ├── components/talos/        # Dashboard components
│   ├── lib/                     # API client, socket hooks, utils
│   └── ...
├── .github/
│   ├── workflows/               # CI, CodeQL, Release
│   ├── skills/                  # Agent skill definitions
│   └── instructions/            # Coding conventions
└── docs/                         # Documentation
```

### Running Tests

```bash
# Run all backend tests (81 tests)
pnpm test

# Run tests in watch mode (re-runs on file changes)
pnpm test:watch

# Run tests with coverage
pnpm test:coverage

# Run a specific test file
pnpm test src/talos/repository.test.ts

# Run UI tests (19 tests)
cd ui && pnpm test

# Run UI tests in watch mode
cd ui && pnpm test:watch
```

**Test conventions:**
- Tests live next to source code (e.g., `repository.test.ts` beside `repository.ts`).
- SQLite tests use in-memory databases: `new Database(":memory:")`.
- Time-dependent tests accept `clock?: () => Date` for deterministic assertions.
- UI tests use `@testing-library/react` with jsdom environment.

### Linting & Formatting

```bash
# Lint backend code
pnpm lint

# Format backend code
pnpm format

# Lint UI code
cd ui && pnpm lint
```

### Type Checking

```bash
# Check backend types (strict mode)
pnpm typecheck

# Build UI (includes type checking)
cd ui && pnpm build
```

**Quality gate before committing:** Always run `pnpm lint`, `pnpm typecheck`, and `cd ui && pnpm build` before pushing changes.

---

## Troubleshooting

### Discovery fails with "rate limit exceeded"

**Cause:** GitHub API rate limit (5000 requests/hour) reached.

**Solution:** Wait for the rate limit to reset (check `x-ratelimit-reset` header), or reduce the repository size by tightening `discovery.includeExtensions` and `discovery.excludePatterns`.

### Test generation produces low-confidence results

**Causes:**
- Insufficient RAG context (repository not indexed, or query doesn't match relevant code).
- Prompt is too vague.

**Solutions:**
1. Run discovery first: `talos-discover-repository`.
2. Write more specific prompts (mention URLs, selectors, expected behavior).
3. Increase `generator.maxContextChunks` to include more context.

### Self-healing keeps failing

**Causes:**
- Fundamental application change (not a selector drift).
- Confidence threshold too high for the type of fix needed.

**Solutions:**
1. Check the healing audit trail for repeated failure categories.
2. Lower `healing.confidenceThreshold` if fixes are correct but rejected.
3. If the application has fundamentally changed, regenerate tests instead.

### Playwright browser not found

**Cause:** Browsers not installed.

**Solution:**
```bash
npx playwright install
```

### Vector store initialization fails

**Cause:** LanceDB can't create the storage directory.

**Solution:** Ensure `~/.talos/vectordb` exists and is writable:
```bash
mkdir -p ~/.talos/vectordb
```

### Artifact storage full

**Cause:** Artifacts exceeding the `maxStorageMb` limit.

**Solution:**
1. Run artifact cleanup (removes artifacts older than `retentionDays`).
2. Increase `artifacts.maxStorageMb` in config.
3. Reduce retention: lower `artifacts.retentionDays`.
4. Manually delete old artifacts: `rm -rf ~/.talos/artifacts/<old-run-ids>`.

### UI not connecting to backend

**Cause:** `NEXT_PUBLIC_TALOS_API_BASE` not set or pointing to wrong URL.

**Solution:** Set the environment variable for the UI:
```bash
NEXT_PUBLIC_TALOS_API_BASE=http://localhost:3000 pnpm dev
```

---

## FAQ

**Q: Does TALOS require an internet connection?**
A: For test generation and RAG indexing, yes — it uses OpenAI for embeddings and an LLM for code generation. For test execution and export, no — Playwright runs locally.

**Q: Can I use a different LLM provider?**
A: The generator and healing modules accept a `generateWithLLM` callback — you can wire in any LLM provider. The embedding service currently supports OpenAI with a provider abstraction ready for local models.

**Q: How do I run tests against different environments?**
A: Change the application's `baseUrl` or pass an environment option when running tests. Exported packages use `baseURL` in `playwright.config.ts` which can be overridden via environment variables.

**Q: Can I import existing Playwright tests?**
A: Yes — create a test via the repository API with your existing code. TALOS will compute the code hash, validate the syntax, and track it like any generated test.

**Q: What happens to my credentials in exported tests?**
A: By default, `CredentialSanitizer` replaces all detected secrets with `process.env.*` references and generates a `.env.example` file. No credentials are included in the exported package.

**Q: How does the self-healing system avoid infinite loops?**
A: Three mechanisms: (1) A `healingInProgress` set prevents concurrent healing on the same test. (2) Healing-verification runs don't trigger further healing. (3) A `maxRetries` limit (default 3) caps total attempts.

**Q: What vector database backends are supported?**
A: LanceDB (default, embedded, zero-infrastructure) and Qdrant (via `vectorDb.type: "qdrant"` with `qdrantUrl` and `qdrantApiKey`).

**Q: How do I update TALOS?**
A: Pull the latest code, install dependencies, and rebuild:
```bash
git pull origin main
pnpm install
pnpm build
cd ui && pnpm build
```

---

*For architecture details, see [ARCHITECTURE.md](ARCHITECTURE.md).*
