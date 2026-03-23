# Changelog

All notable changes to the Talos project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Comprehensive Test Suite** (PR #234): 375 tests across 26 test files achieving 80.77% statement coverage / 84.07% line coverage. Covers all Talos subsystems: repository, config, tools, discovery engine, RAG pipeline, vector store, embedding service, test generator, healing engine, failure analyzer, fix generator, code validator, credential injector/sanitizer, file chunker, artifact manager, playwright runner, export engine, package builder, GitHub MCP client, admin API, orchestration endpoints, copilot wrapper, and environment manager.

### Changed

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
