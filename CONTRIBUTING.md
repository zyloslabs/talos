# Contributing to Talos

Thank you for your interest in contributing to Talos! This document provides guidelines and steps for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Branching Strategy](#branching-strategy)
- [Changelog](#changelog)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Commit Messages](#commit-messages)
- [Reporting Bugs](#reporting-bugs)
- [Feature Requests](#feature-requests)

## Code of Conduct

This project adheres to a [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to the maintainers.

## Getting Started

1. Fork the repository on GitHub
2. Clone your fork locally
3. Set up the development environment (see below)
4. Create a branch for your changes
5. Make your changes and test them
6. Submit a pull request

## Development Setup

### Prerequisites

- **Node.js** 22+
- **pnpm** 10+
- **GitHub Copilot** subscription (for AI generation features)
- **OpenAI API key** (optional — for embeddings)

### Installation

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/talos.git
cd talos

# Install dependencies
pnpm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your GITHUB_CLIENT_ID and other keys

# Start development server
pnpm dev

# In a separate terminal, start the UI
cd ui && pnpm dev
```

### Environment Setup

Copy `.env.example` to `.env` and configure the required values. The minimum required keys are:

- `GITHUB_CLIENT_ID` — for Copilot device auth
- `OPENAI_API_KEY` — for embeddings (optional if using Copilot)

## Branching Strategy

This project uses **GitHub Flow** — the standard for open-source projects:

- `main` is the **only permanent branch** and is always in a releasable state
- All work (features, fixes, docs) is done on **short-lived branches** off `main`
- Branches are merged back to `main` via a reviewed pull request and then deleted
- Versions are tagged directly on `main` commits (e.g., `v0.2.0`) — there are no separate `develop` or `release` branches

**Branch naming:**
```
feature/short-description         # new features
fix/issue-123-short-description   # bug fixes
docs/update-readme                # documentation only
chore/dependency-updates          # maintenance & deps
```

> **Why not Gitflow?** Gitflow (with develop/release branches) is designed for scheduled enterprise releases. GitHub Flow is simpler and works better for continuous-delivery open-source projects where changes ship frequently.

## Changelog

Every PR with user-facing changes **must** add an entry to the `## [Unreleased]` section of [CHANGELOG.md](CHANGELOG.md) using the appropriate sub-heading:

- `### Added` — new features
- `### Changed` — changes to existing behavior
- `### Fixed` — bug fixes
- `### Removed` — removed features
- `### Security` — security fixes

**Do not bump the version number in `package.json`** on every PR. Versions are incremented only when a tagged release is cut (e.g., `git tag v0.2.0`), at which point the `[Unreleased]` section is promoted to a versioned entry.

## Pull Request Process

1. **Create a feature branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following our coding standards

3. **Run the quality gate** before committing:
   ```bash
   pnpm lint && pnpm typecheck && pnpm test
   # If touching UI files:
   cd ui && npx next build
   ```

4. **Commit your changes** with a descriptive commit message (see [Commit Messages](#commit-messages))

5. **Update `CHANGELOG.md`** with a description of user-facing changes

6. **Push to your fork** and create a pull request against `main`

7. **Respond to feedback** from maintainers promptly

### PR Requirements

- All tests must pass (`pnpm test` — 700+ tests)
- No linting errors (`pnpm lint`)
- TypeScript type checking passes (`pnpm typecheck`)
- UI changes require `cd ui && npx next build` to succeed
- Include tests for new functionality
- `CHANGELOG.md` updated for user-facing changes

## Coding Standards

### TypeScript

- ESM TypeScript only (`"type": "module"` in `package.json`)
- Use explicit `.js` extensions in imports (required for NodeNext module resolution)
- Strict TypeScript — no `any` without justification
- Use Zod 4 for runtime validation at system boundaries (user input, external APIs)
- Follow existing patterns — read the module you're modifying before changing it

### Code Style

```bash
pnpm lint      # ESLint (enforces rules)
pnpm format    # Prettier (auto-formats)
```

- Keep functions focused with a single responsibility
- Write self-documenting code with clear variable names
- Only add comments where the logic is non-obvious
- Don't add docstrings to code you didn't change

### File Organization

```
src/
├── talos/          # Domain modules (discovery, rag, generator, runner, healing, export, knowledge)
├── api/            # Express routers
├── copilot/        # Copilot SDK wrapper
└── platform/       # SQLite repo, env manager, seeding
ui/
└── app/            # Next.js App Router pages
    components/     # React components (talos/ for domain, ui/ for primitives)
    lib/            # API client & utilities
```

- Tests live **next to source files** (`module.ts` → `module.test.ts`)
- Use barrel exports (`index.ts`) only for public module APIs
- New domain capabilities go in `src/talos/<module>/`

### Database

- SQLite via `better-sqlite3` with WAL mode
- Schema evolution via runtime `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE` migrations
- Always use parameterized queries — never string-interpolate SQL

### Security

- Validate all external inputs with Zod at API boundaries
- Never log credentials, tokens, or secrets
- Use parameterized queries for all database operations
- Follow OWASP Top 10 guidance

## Testing

```bash
# Run all backend tests
pnpm test

# Run tests in watch mode (development)
pnpm test:watch

# Run with coverage
pnpm test:coverage

# Run UI tests
cd ui && pnpm test
```

### Testing Conventions

- Tests use **Vitest** with in-memory SQLite (`new Database(":memory:")`)
- Time-dependent components accept `clock?: () => Date` for deterministic testing
- Use `vi.fn()` handlers for event emitter assertions
- UI tests use `@testing-library/react` with jsdom
- Aim for meaningful tests over raw coverage numbers — test behavior, not implementation

### What to Test

- New public functions and classes need unit tests
- Bug fixes should have a regression test
- API endpoints should have integration tests
- UI components with business logic should have component tests

## Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <short description>

[optional body]

[optional footer: Closes #123]
```

**Types:**
- `feat` — new feature
- `fix` — bug fix
- `docs` — documentation only
- `chore` — maintenance (deps, config, tooling)
- `test` — adding or fixing tests
- `refactor` — code change that's not a feature or fix
- `perf` — performance improvement
- `ci` — CI configuration

**Examples:**
```
feat(generator): add support for custom Playwright fixtures
fix(healing): handle timeout errors in failure analyzer
docs(readme): add troubleshooting section for embeddings
chore(deps): upgrade zod 3 → 4
```

## Reporting Bugs

When filing a bug report, please include:

1. **Talos version** (from `package.json`)
2. **Node.js version** (`node --version`)
3. **OS and version**
4. **Steps to reproduce** — minimal and specific
5. **Expected behavior**
6. **Actual behavior** (include error messages and stack traces)
7. **Relevant configuration** (redact any secrets)

Use the GitHub issue tracker and apply the `bug` label.

## Feature Requests

Feature requests are welcome! Open a GitHub issue with:

1. **Problem statement** — what user need does this address?
2. **Proposed solution** — how should it work?
3. **Alternatives considered** — what else did you think about?
4. **Additional context** — mockups, examples, related issues

Apply the `enhancement` label.

---

Thank you for contributing to Talos! 🚀
