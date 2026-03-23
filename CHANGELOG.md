# Changelog

All notable changes to the Talos project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
