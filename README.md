# Talos — Autonomous AI Testing Engine

> **⚠️ ALPHA — Under active development. Expect breaking changes between releases.**

Talos is an open-source **Test Automation & Logic Orchestration System** — an autonomous E2E testing engine that discovers your application's source code, builds semantic context via RAG, generates Playwright tests with AI, executes them across browsers, self-heals failures, and exports portable test packages.

---

## What It Does

| Capability | Description |
|---|---|
| **Discovery** | Clones and indexes application repositories via the GitHub API, chunking source files into semantic RAG embeddings. |
| **RAG Context** | Builds a searchable vector knowledge base (LanceDB) from your codebase. Hybrid search combines vector similarity with keyword boosting. |
| **AI Generation** | Uses GitHub Copilot SDK models to generate Playwright tests with Page Object Model, accessible locators, and web-first assertions. |
| **Requirements Ingestion** | Ingest Markdown or OpenAPI specs into the knowledge base, auto-tag requirements, and generate Given/When/Then acceptance criteria. |
| **Test Execution** | Runs Playwright tests with configurable browser targets, retries, and parallelism. |
| **Self-Healing** | Analyzes failures, classifies root causes, and regenerates fixes automatically. |
| **Credential Vault** | Injects environment-specific credentials at runtime; sanitizes them before export. |
| **Export** | Packages tests as standalone zip archives ready to run in any CI pipeline. |
| **Traceability** | Links requirements → acceptance criteria → test cases for full Requirements Traceability Matrix (RTM) reporting. |
| **Setup Wizard** | 7-step guided workflow: register app → upload docs → configure vault → discover → generate criteria → review criteria → generate tests. |
| **MCP Tools** | 21 tools exposed via Model Context Protocol for AI agent orchestration. |

---

## Platform Status

**ALPHA** — Core systems are functional and actively used in production by the maintainers, but APIs and configuration formats may change without notice between releases. macOS is the primary tested platform.

---

## Quick Start

### Prerequisites

- **Node.js** 22+
- **pnpm** 10+
- **GitHub Copilot** subscription (for AI generation)
- **OpenAI API key** (optional — for embeddings; falls back to Copilot)

### Installation

```bash
# Clone the repository
git clone https://github.com/zyloslabs/talos.git
cd talos

# Install dependencies
pnpm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your GITHUB_CLIENT_ID and other keys

# Start the backend server
pnpm dev

# In a separate terminal, start the UI
cd ui && pnpm dev
```

Open **http://localhost:3001** for the Talos dashboard. The API server runs on **http://localhost:3000**.

On first run, authenticate with GitHub Copilot — the server will print a device code to the console.

---

## Architecture

Talos is a **pnpm monorepo** with two packages:

| Package | Path | Description |
|---------|------|-------------|
| `talos` | `/` | Core engine — discovery, RAG, generation, execution, healing, export |
| `talos-ui` | `/ui` | Next.js command center dashboard |

The engine exposes its capabilities as **MCP tools** that can be invoked by AI agents, the UI's API layer, or CLI scripts.

### Core Modules

```
src/
├── talos/
│   ├── discovery/      # GitHub API repo cloning + source chunking
│   ├── rag/            # LanceDB vector store, embeddings, hybrid search
│   ├── knowledge/      # Document ingestion, auto-tagging, criteria generation
│   ├── generator/      # AI test generation + Playwright code validation
│   ├── runner/         # Playwright execution + artifact management
│   ├── healing/        # Failure analysis + fix generation
│   └── export/         # Credential-safe portable package export
├── api/                # Express REST API + Socket.IO
├── copilot/            # GitHub Copilot SDK wrapper
└── platform/           # SQLite repository, env manager, vault
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full architectural deep-dive.

---

## User Guide

See [docs/USER_GUIDE.md](docs/USER_GUIDE.md) for:

- Registering applications
- Configuring vault credentials
- Discovery & indexing workflow
- Generating and executing tests
- Using the Setup Wizard
- Self-healing configuration
- MCP tools reference
- Export & CI integration

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 22+, TypeScript 5+ (strict ESM) |
| AI | GitHub Copilot SDK, OpenAI embeddings (`text-embedding-3-small`) |
| Vector DB | LanceDB |
| Database | SQLite (`better-sqlite3`, WAL mode) |
| Testing | Playwright, Vitest |
| Backend | Express 5, Socket.IO |
| Frontend | Next.js 16, React 19, Tailwind CSS 4, Radix UI |
| Validation | Zod 4 |

---

## Development

```bash
# Run all tests
pnpm test

# Type check
pnpm typecheck

# Lint
pnpm lint

# Full quality gate (run before every PR)
pnpm lint && pnpm typecheck && pnpm test && cd ui && npx next build
```

Tests live next to source files (`*.test.ts`). The project has 700+ tests across 40 test files.

---

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to get started, our development workflow, and our pull request process.

---

## Security

Found a security vulnerability? Please **do not** open a public GitHub issue. See [SECURITY.md](SECURITY.md) for our responsible disclosure policy.

---

## License

Talos is licensed under the **Functional Source License 1.1, MIT Future License (FSL-1.1-MIT)**.

This means:
- ✅ Free for internal use, research, and non-commercial education
- ✅ Free for professional services to Talos licensees
- ❌ Cannot be used as a competing commercial product or service
- 🔄 Automatically converts to **MIT** on March 25, 2028 (two years from initial release)

See [LICENSE.md](LICENSE.md) for the full text.

---

## Acknowledgments

Built by [Zylos Labs LLC](https://zylos.dev) on top of the [GitHub Copilot SDK](https://github.com/github/copilot-sdk), [LanceDB](https://lancedb.github.io/lancedb/), and [Playwright](https://playwright.dev/).
