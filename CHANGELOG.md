# Changelog

All notable changes to the Talos project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
