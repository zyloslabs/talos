# Changelog

All notable changes to the Talos project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Knowledge Base Enhancement** (Epic #276): New `src/talos/knowledge/` module for requirements document ingestion and knowledge-base auto-tagging.
  - Extended `TalosChunk` type with new chunk types (`requirement`, `api_spec`, `user_story`) and optional metadata fields (`docId`, `sourceVersion`, `confidence`, `tags`, `links`) (#281).
  - `DocumentIngester` class: ingests Markdown and OpenAPI (JSON/YAML) documents into the RAG knowledge base with semantic section chunking, 10-15% overlap, and stable chunk IDs (#282).
  - `AutoTagger` class: NLP-heuristic auto-tagging with controlled vocabulary for personas, NFR keywords, environments, and functional areas (#283).
  - Hybrid search (`VectorStore.hybridSearch`): combines vector similarity with keyword boosting and metadata filtering (types, tags, docType, persona, minConfidence). Exposed via `RagPipeline.retrieveWithFilters()` (#284).

### Fixed

- **Copilot SDK `onPermissionRequest`** (#256): `createSession` now passes `approveAll` (imported from `@github/copilot-sdk`) as `onPermissionRequest`, resolving the root cause of chat sessions failing with permission errors.
- **Tool wiring via `defineTool`** (#257): Talos tools from `src/talos/tools.ts` are now wrapped with `defineTool()` and passed to every SDK session. `ChatOptions` gains a `tools?: ToolDefinition[]` parameter. Tool handlers emit `tool:call` events and surface errors gracefully.
- **`listModels()` + `modelSupportsReasoning()`** (#258): Model listing now guards against `startFailed` (throws a clear error instead of hanging). Model capabilities are cached after the first `listModels()` call. `reasoningEffort` is only forwarded to sessions whose model actually supports it — non-reasoning models (gpt-4.1, claude-sonnet-4, etc.) no longer receive the parameter.

### Changed

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
