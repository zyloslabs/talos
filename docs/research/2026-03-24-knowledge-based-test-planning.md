# Research: Knowledge-Based Test Planning & Acceptance Criteria System
**Date**: 2026-03-24
**Sources**: Web (Cucumber, Guru99, OpenAI, Functionize, Testim, AutoGen, React Hook Form), Library Docs (Playwright, LanceDB, Playwright-BDD, Next.js), Local (ARCHITECTURE.md, types.ts, agent/skill files)
**Used for**: Planning epic for Talos Phase 3 — Requirements ingestion, acceptance criteria, test planning, setup wizard, testing agents

---

## Research Summary

### Sources Consulted

| Source | Type | Key Findings |
|--------|------|-------------|
| Cucumber BDD Docs | Web | Gherkin syntax (Given/When/Then), Feature/Scenario/Rule structure, step definitions, Scenario Outline for parameterized tests |
| Cucumber BDD Philosophy | Web | Three-practice model: Discovery → Formulation → Automation; executable specifications |
| Playwright Auth Docs | Docs | Multi-role testing via storage states, POM fixtures per role, `browser.newContext()` with separate auth files |
| Playwright-BDD | Docs | Gherkin → Playwright test generation, `defineBddConfig()`, step definitions with Playwright fixtures, AI fix integration |
| LanceDB Docs | Docs | Vector search with `.where()` SQL-like metadata filtering, pre-filtering vs post-filtering, hybrid search, schema with metadata fields |
| OpenAI Structured Outputs | Web | JSON Schema-constrained LLM responses via Zod/Pydantic, recursive schemas, structured data extraction from unstructured text |
| Guru99 RTM Guide | Web | Requirements Traceability Matrix structure, bi-directional traceability, forward/backward mapping |
| Testim AI Testing | Web | Smart Locators for self-healing, AI-powered test authoring/maintenance, cross-stakeholder test creation |
| Functionize | Web | AI + ML testing platform, NLP test creation, self-healing, visual testing, multi-platform automation |
| AutoGen Multi-Agent | Web | AgentChat API for multi-agent systems, Selector Group Chat, Swarm coordination, GraphFlow workflows |
| React Hook Form | Web | Wizard form pattern with state management, multi-step forms, FormProvider, validation with Zod resolvers |
| Talos Architecture | Local | Existing module structure, SQLite schema, LanceDB vector store, MCP tools, agent/skill file patterns |

---

## Topic 1: AI-Powered Acceptance Criteria Generation

### Key Findings

1. **BDD Three-Practice Model** (Cucumber.io):
   - **Discovery**: Structured conversations (discovery workshops) to explore business rules and examples
   - **Formulation**: Document examples as executable specs in Gherkin (Given/When/Then)
   - **Automation**: Connect specs to code as automated tests
   - This maps directly to Talos: Ingest requirements → Generate acceptance criteria → Generate Playwright tests

2. **Gherkin Format — Industry Standard**:
   - `Feature` → high-level capability description
   - `Rule` → business rule grouping (since Gherkin v6)
   - `Scenario` / `Example` → concrete test case with Given/When/Then steps
   - `Scenario Outline` + `Examples` → parameterized scenarios from data tables
   - `Background` → shared preconditions across scenarios
   - Tags (`@tag`) for categorization and filtering
   - Supports 70+ spoken languages

3. **AI for Generating Acceptance Criteria from Requirements**:
   - Use OpenAI Structured Outputs with a Zod schema defining the acceptance criteria format
   - LLM can parse PRDs/specs and extract: Features, Rules, Scenarios, Steps
   - Chain-of-thought prompting ensures the model reasons through requirements before producing criteria
   - Structured Outputs guarantee schema adherence (no hallucinated fields)

4. **Playwright-BDD Integration** (vitalets/playwright-bdd):
   - Converts Gherkin `.feature` files → Playwright `test()` calls automatically
   - Step definitions use Playwright fixtures (`page`, `context`, `browser`)
   - Configuration via `defineBddConfig({ features, steps, outputDir })`
   - Built-in AI fix support (`aiFix: { promptAttachment: true }`)
   - Cucumber-style reporters available
   - **This is the bridge**: Requirements → Gherkin → Playwright tests

5. **Traceability from Requirements → Criteria → Tests**:
   - Tag each acceptance criterion with a requirement ID (e.g., `@REQ-001`)
   - Store the mapping in the database: requirement_id → criteria_id → test_id
   - Enables forward traceability (requirement → test) and backward traceability (test → requirement)

### Recommended Approach for Talos

- **Acceptance Criteria Format**: Use Gherkin (Given/When/Then) as the primary format. It's structured enough for AI generation and directly translatable to Playwright tests via playwright-bdd.
- **AI Pipeline**: Document → LLM (Structured Outputs w/ Zod schema) → Gherkin Features → playwright-bdd → Playwright test code
- **Schema**: Define a `TalosAcceptanceCriteria` type with fields for feature, scenarios, steps, tags, requirement references
- **Adopt playwright-bdd**: Use it as the bridge between BDD criteria and executable tests

### Libraries/Tools to Adopt
- `playwright-bdd` (npm) — Gherkin → Playwright test generation
- OpenAI Structured Outputs with Zod schemas — for requirement extraction
- Gherkin parser (`@cucumber/gherkin`) — for parsing/validating Gherkin documents

---

## Topic 2: Knowledge Base for Testing

### Key Findings

1. **LanceDB Metadata Filtering**:
   - Supports SQL-like `WHERE` clauses on metadata fields: `.search(vector).where("type = 'requirement' AND status = 'active'")`
   - Pre-filtering (default) applies metadata filter before vector search — more accurate results
   - Can combine vector similarity with metadata: application ID, document type, requirement IDs, tags
   - Supports full-text search alongside vector search (hybrid)

2. **Document Chunking Strategies for Requirements vs Code**:
   - **Code**: Structural chunking (functions, classes, interfaces) — already implemented in Talos
   - **Requirements docs**: Semantic chunking by section headings (Feature, Rule, User Story, Acceptance Criteria)
   - **PRDs**: Chunk by requirement blocks — each requirement is one chunk with its description, rules, criteria
   - Keep chunks small enough for context windows but large enough to preserve meaning (500-1500 chars)

3. **Metadata Enrichment for Vector Store**:
   - Current `TalosChunk` types: `code | test | documentation | config | schema`
   - **New types needed**: `requirement | acceptance-criteria | user-story | prd | api-spec`
   - **New metadata fields**: `requirementId`, `priority`, `tags[]`, `documentSource`, `version`, `status`
   - **Labels**: Feature area, user role, test type, criticality level

4. **Requirements Traceability Matrix (RTM)**:
   - Maps: Business Requirement → Technical Requirement → Test Case → Execution Status → Defects
   - Parameters: Requirement ID, Type, Description, Test Cases, Design Status, Execution Status, Defects
   - Types: Forward (req → test), Backward (test → req), Bi-directional (both)
   - Best practices: Start early, keep updated, use unique IDs, automate with tools
   - **Programmatic implementation**: SQLite join table `talos_traceability` mapping requirement_id ↔ criteria_id ↔ test_id with coverage status

5. **RAG for Requirements-Aware Test Generation**:
   - When generating a test, query both code chunks AND requirement chunks
   - Weight requirement chunks higher for test purpose/assertions
   - Weight code chunks higher for page structure/selectors
   - Combine: "Given this requirement says X, and the code structure is Y, generate a test that validates X using Y"

### Recommended Approach for Talos

- **Extend TalosChunk types** to include `requirement`, `acceptance-criteria`, `user-story`, `api-spec`
- **Add metadata fields** to vector store: `requirementId`, `priority`, `tags`, `documentSource`, `featureArea`, `userRole`
- **New SQLite table** `talos_requirements` for requirement entities with traceability links
- **New SQLite table** `talos_acceptance_criteria` with Gherkin content and requirement references
- **New SQLite table** `talos_traceability` for RTM (requirement → criteria → test mapping)
- **Hybrid RAG retrieval**: Combine code chunks + requirement chunks when generating tests

---

## Topic 3: AI-Assisted Test Planning

### Key Findings

1. **AI Testing Platform Patterns** (Testim, Functionize, Mabl):
   - **Smart Locators** (Testim): Track elements using multiple attributes, not just selectors — resilient to UI changes. Similar to Talos's existing healing module.
   - **NLP Test Creation** (Functionize): Users describe tests in natural language → AI converts to executable test code
   - **Self-Healing** (all platforms): Automatically update selectors when UI changes — Talos already has this
   - **Test Coverage Analysis**: AI identifies untested areas by comparing test coverage against requirements/code
   - **Cross-stakeholder authoring**: Non-technical users can define tests via visual UI or natural language

2. **Application Crawling for Test Discovery**:
   - Crawl the live app starting from base URL
   - Discover: All pages, forms, buttons, navigation paths, authentication gates
   - Build a **site map** with page relationships and user flows
   - Identify interactive elements and form structures
   - Use different auth contexts to discover role-specific pages
   - Store crawl results as knowledge base entries for test generation
   - **Playwright can do this**: `page.goto()`, `page.locator()`, capture ARIA tree, follow links

3. **Multi-Role Testing Strategy**:
   - Define roles: admin, standard user, guest (unauthenticated)
   - For each role: crawl accessible pages, identify allowed/denied actions
   - Test both positive (can access) and negative (should be denied) scenarios
   - Playwright pattern: separate `storageState` files per role, POM fixtures per role

4. **AI Test Planning Algorithm**:
   - Input: Source code analysis + Requirements docs + Existing test coverage
   - Process:
     1. Map all pages/routes from code (discovery)
     2. Map all requirements to pages/features
     3. Identify untested requirements
     4. Prioritize by: business criticality, change frequency, risk level
     5. Generate test plan: which tests to create, in what order, for which roles
   - Output: Prioritized test plan with requirement traceability

5. **Playwright Multi-Role Best Practices** (from docs):
   - Global setup project authenticates all roles, saves storage states to JSON files
   - Tests use `test.use({ storageState: 'path/to/role.json' })` per describe block
   - POM fixtures create new browser contexts per role: `browser.newContext({ storageState })`
   - Can test multi-role interaction in single test (admin + user contexts simultaneously)

### Recommended Approach for Talos

- **New module: `crawler/`** — Playwright-based app crawler that discovers pages, forms, routes under different roles
- **New module: `planner/`** — AI test planner that takes requirements + code analysis + coverage data → generates prioritized test plan
- **Crawl results**: Store as new vector store entries (type: `page-structure`) with URL, elements, forms, navigation
- **Coverage gaps**: Compare existing tests against requirements to find untested criteria
- **Multi-role**: Extend `VaultRole` to support automated storage state generation for each role

---

## Topic 4: Setup Wizard Patterns

### Key Findings

1. **Multi-Step Wizard in React/Next.js**:
   - **State Management**: Use a state management library (React Context, Zustand, or `little-state-machine`) to persist wizard data across steps
   - **Routing**: Each step can be a separate route (`/setup/step1`, `/setup/step2`) or a single page with in-page navigation
   - **React Hook Form**: Recommended for each step's form validation; use `FormProvider` to share form state
   - **Zod Resolver**: Validate each step's form data against a Zod schema (already used in Talos)
   - **Progress indicator**: Stepper/progress bar showing current step and completion status

2. **Recommended Wizard Steps for Talos**:
   - **Step 1: Application Registration** — Name, description, base URL, repository URL
   - **Step 2: Vault & Credentials** — Configure authentication roles (admin, standard, guest), vault references
   - **Step 3: Repository Discovery** — Connect GitHub PAT, trigger repo scan, monitor progress
   - **Step 4: Document Upload** — Upload/paste requirements docs (PRDs, specs, user stories)
   - **Step 5: Acceptance Criteria Review** — AI-generated criteria from docs; user can edit/approve
   - **Step 6: Application Crawl** — Crawl the live app with configured roles; review discovered pages
   - **Step 7: Test Plan Generation** — AI generates test plan from criteria + code + crawl data
   - **Step 8: Test Generation** — Generate tests from plan; review and activate

3. **Developer Tool Onboarding Patterns**:
   - Show "what you'll configure" overview before starting
   - Allow skipping non-essential steps (e.g., document upload can be deferred)
   - Show real-time progress for async operations (discovery, crawling)
   - Preview/dry-run before committing actions
   - Allow returning to previous steps without losing data
   - Save progress so user can resume later

4. **UI Component Approach**:
   - Use Radix UI + Tailwind (already in Talos UI stack) for consistent styling
   - Stepper component with numbered steps, labels, and completion indicators
   - Each step: form card with title, description, form fields, back/next buttons
   - Side panel showing overall progress and what's been configured
   - Toast notifications for async operation completions

### Recommended Approach for Talos

- **Route structure**: `/ui/app/talos/setup/` with dynamic `[step]` routing
- **State**: Zustand store for wizard state (persisted to localStorage for resume capability)
- **Form validation**: React Hook Form + Zod per step
- **Async operations**: Real-time WebSocket updates for discovery/crawling (already have Socket.IO)
- **Components**: New `SetupWizard`, `WizardStep`, `StepperNav`, `RequirementsUploader`, `CrawlViewer` components

---

## Topic 5: Testing Agent Architecture

### Key Findings

1. **Multi-Agent Coordination Patterns** (AutoGen):
   - **Selector Group Chat**: Centralized coordinator selects which agent speaks next based on context
   - **Swarm**: Decentralized; agents hand off to each other via tool calls
   - **GraphFlow**: Directed graph of agents — most structured, explicit transition paths
   - **Memory**: Agents share context via shared memory store (similar to Talos's RAG)

2. **Recommended Testing Agent Hierarchy**:
   ```
   Test Orchestrator (coordinator)
   ├── Requirements Analyst Agent — Parses docs, generates acceptance criteria
   ├── Test Planner Agent — Creates prioritized test plans from criteria + code analysis
   ├── Test Generator Agent — Generates Playwright tests from plans + RAG context
   ├── Test Reviewer Agent — Reviews generated tests for quality, coverage, best practices
   ├── Test Runner Agent — Executes tests, collects results and artifacts
   ├── Test Healer Agent — Analyzes failures, generates fixes (existing healing module)
   └── Coverage Analyzer Agent — Identifies test gaps, suggests new tests
   ```

3. **Agent Decision-Making for Testing**:
   - **Requirements Analyst**: Input: raw document → Output: structured Gherkin features with embedded requirement IDs
   - **Test Planner**: Input: criteria + existing tests + code → Output: which tests to generate, priority order, role assignments
   - **Test Generator**: Input: single test plan item + RAG context → Output: Playwright test code
   - **Test Reviewer**: Input: generated test code → Output: approval/rejection with feedback (quality, assertions, selectors)
   - **Coverage Analyzer**: Input: all requirements + all tests → Output: coverage matrix, gap report, recommendations

4. **Agent/Skill File Pattern** (existing Talos pattern):
   - `.agent.md` — Defines agent persona, tools, sub-agents, and workflow phases
   - `SKILL.md` — Defines reusable skills with MCP tool requirements and step-by-step workflows
   - Agents invoke skills via `#tool:agent/runSubagent`
   - Skills can be composed: Requirements Analyst skill + Test Generator skill = full pipeline

5. **Test Coverage Analyzer Pattern**:
   - Build traceability matrix from existing data
   - For each requirement, check if linked tests exist and are passing
   - For each code path, check if tests exercise it
   - Score: % requirements covered, % code paths tested, % roles tested
   - Output: gap report with prioritized recommendations for new tests

### Recommended Approach for Talos

- **New agents** (`.github/agents/`):
  - `requirements-analyst.agent.md` — Parses documents into acceptance criteria
  - `test-planner.agent.md` — Creates test plans from criteria + code + coverage
  - `test-coverage.agent.md` — Analyzes gaps and recommends new tests
- **New skills** (`.github/skills/`):
  - `requirements-ingest/SKILL.md` — Document parsing and criteria generation workflow
  - `test-plan/SKILL.md` — Test planning and prioritization workflow
  - `app-crawl/SKILL.md` — Application crawling and page discovery workflow
  - `coverage-analysis/SKILL.md` — Coverage gap analysis and reporting workflow
- **Orchestration**: New `test-orchestrator.agent.md` that coordinates the full pipeline: ingest → plan → generate → run → heal → report

---

## Topic 6: Document Ingestion for Testing

### Key Findings

1. **Supported Document Formats**:
   - **Markdown** (native support) — PRDs, specs, user stories in `.md` files
   - **Plain text** — Requirements documents, meeting notes
   - **JSON/YAML** — OpenAPI specs, configuration files
   - **Gherkin** — `.feature` files (direct BDD input)
   - **JIRA export** (JSON/CSV) — User stories, acceptance criteria
   - **Confluence export** (HTML/Markdown) — Technical specifications
   - **OpenAPI/Swagger** (JSON/YAML) — API endpoint definitions with request/response schemas

2. **OpenAI Structured Outputs for Requirement Extraction**:
   - Define Zod schema for extracted requirements:
     ```typescript
     z.object({
       features: z.array(z.object({
         name: z.string(),
         description: z.string(),
         rules: z.array(z.string()),
         scenarios: z.array(z.object({
           name: z.string(),
           given: z.array(z.string()),
           when: z.array(z.string()),
           then: z.array(z.string()),
           tags: z.array(z.string()),
         })),
         priority: z.enum(['critical', 'high', 'medium', 'low']),
       })),
       openQuestions: z.array(z.string()),
     })
     ```
   - Use structured outputs to guarantee schema adherence — no post-processing needed
   - Chain-of-thought: Ask LLM to first identify all requirements, then formulate criteria

3. **NLP Techniques for Requirement Extraction**:
   - **Section detection**: Parse headings (H1-H6 in Markdown) to identify feature boundaries
   - **Entity extraction**: Identify actors (user roles), actions (verbs), objects (UI elements, data)
   - **Requirement pattern matching**: Look for "The system shall...", "Users must be able to...", "When X happens, Y should occur"
   - **Priority inference**: Keywords like "must", "shall" → high priority; "should", "may" → lower priority
   - **Negative requirements**: "The system must NOT...", "Users should not be able to..." → security/permission tests

4. **OpenAPI Spec Processing**:
   - Parse endpoints, methods, request/response schemas
   - Auto-generate: "For each endpoint, generate tests covering success, validation error, auth error"
   - Map API endpoints to UI features for comprehensive E2E coverage

5. **Document Type Detection & Processing Pipeline**:
   ```
   Upload → Detect Type → Parse → Extract Requirements → Generate Criteria → Store in KB
   
   .md/.txt → Markdown parser → Section chunking → LLM extraction
   .feature → Gherkin parser → Direct criteria import
   .json (OpenAPI) → Schema parser → Endpoint extraction → Criteria generation
   .json (JIRA) → JSON parser → Story/criteria extraction
   ```

### Recommended Approach for Talos

- **New module: `ingestion/`** with:
  - `document-parser.ts` — Detects document type, dispatches to appropriate parser
  - `markdown-parser.ts` — Splits Markdown by headings, extracts structured content
  - `gherkin-parser.ts` — Uses `@cucumber/gherkin` to parse `.feature` files
  - `openapi-parser.ts` — Parses OpenAPI specs into testable endpoint definitions
  - `requirement-extractor.ts` — Uses LLM + Structured Outputs to extract requirements from parsed text
  - `criteria-generator.ts` — Converts extracted requirements into Gherkin acceptance criteria
- **Storage**: Requirements and criteria stored in both SQLite (structured) and LanceDB (vector embeddings for RAG)
- **UI**: Document upload component with drag-and-drop, format detection, parse preview

---

## Topic 7: Playwright Advanced Patterns

### Key Findings (from Playwright docs)

1. **Multi-Role Authentication**:
   - **Global Setup Project**: Dedicated Playwright project authenticates each role and saves `storageState` JSON
   - **Per-Role Storage States**: `playwright/.auth/admin.json`, `playwright/.auth/user.json`, etc.
   - **Usage per test group**: `test.use({ storageState: 'playwright/.auth/admin.json' })`
   - **Multi-role in single test**: Create separate `BrowserContext` per role: `browser.newContext({ storageState })`

2. **POM Fixtures for Roles**:
   ```typescript
   type MyFixtures = { adminPage: AdminPage; userPage: UserPage };
   export const test = base.extend<MyFixtures>({
     adminPage: async ({ browser }, use) => {
       const ctx = await browser.newContext({ storageState: 'admin.json' });
       await use(new AdminPage(await ctx.newPage()));
       await ctx.close();
     },
   });
   ```

3. **Playwright-BDD Integration**:
   - `defineBddConfig({ features: 'features/**/*.feature', steps: 'steps/**/*.ts' })`
   - Step definitions use Playwright fixtures directly:
     ```typescript
     Given('I am on {page}', async ({ page }, url) => { await page.goto(url); });
     When('I click {string}', async ({ page }, name) => { await page.getByRole('link', { name }).click(); });
     Then('I see in title {string}', async ({ page }, text) => { await expect(page).toHaveTitle(new RegExp(text)); });
     ```
   - Tags filter scenarios: `tags: '@smoke and not @slow'`
   - Built-in AI fix prompts: `aiFix: { promptAttachment: true }`

4. **Parameterized Tests**:
   - Scenario Outline with Examples tables → one test per data row
   - Playwright-BDD handles this automatically from Gherkin
   - For code-based: use arrays + `test.describe` loops

5. **Acceptance Criteria Mapping to POM**:
   - Each Feature maps to a page or component
   - Each Scenario maps to a test case
   - POM classes encapsulate page interaction logic
   - Step definitions bridge criteria language to POM methods

### Recommended Approach for Talos

- **Generate storage state files** for each configured `VaultRole` via Playwright global setup
- **Generate POM fixtures** that create per-role browser contexts
- **Use playwright-bdd** as the generation target: raw Gherkin → `.feature` files + step definitions
- **Template library**: Pre-built step definitions for common patterns (login, navigation, form fill, assertion)
- **Tagging convention**: `@REQ-{id}` for requirement traceability, `@role-{type}` for role-specific tests, `@priority-{level}` for execution ordering

---

## Recommended Architecture: How It All Fits Together

### New Modules

```
src/talos/
├── ingestion/                    # NEW — Document ingestion pipeline
│   ├── document-parser.ts        # Type detection and dispatch
│   ├── markdown-parser.ts        # Markdown section extraction
│   ├── gherkin-parser.ts         # .feature file parsing
│   ├── openapi-parser.ts         # OpenAPI spec processing
│   ├── requirement-extractor.ts  # LLM-powered requirement extraction
│   ├── criteria-generator.ts     # Requirements → Gherkin acceptance criteria
│   └── index.ts
├── planner/                      # NEW — AI test planning
│   ├── test-planner.ts           # Generates prioritized test plans
│   ├── coverage-analyzer.ts      # Identifies test coverage gaps
│   ├── traceability-matrix.ts    # Builds and queries RTM
│   └── index.ts
├── crawler/                      # NEW — Application crawling
│   ├── app-crawler.ts            # Playwright-based live app crawler
│   ├── page-analyzer.ts          # Extracts page structure, forms, elements
│   ├── sitemap-builder.ts        # Builds page relationship graph
│   └── index.ts
├── criteria/                     # NEW — Acceptance criteria management
│   ├── criteria-store.ts         # CRUD for acceptance criteria
│   ├── criteria-linker.ts        # Links criteria to requirements and tests
│   ├── gherkin-formatter.ts      # Formats criteria as Gherkin features
│   └── index.ts
```

### Data Model Changes

#### New SQLite Tables

```sql
-- Requirements document storage
CREATE TABLE talos_requirements (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES talos_applications(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  source_type TEXT NOT NULL CHECK(source_type IN ('prd','spec','user-story','api-spec','feature','manual')),
  source_document TEXT,           -- filename or URL
  priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('critical','high','medium','low')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','implemented','tested','deprecated')),
  feature_area TEXT,              -- grouping label
  user_roles_json TEXT NOT NULL DEFAULT '[]', -- which roles this affects
  tags_json TEXT NOT NULL DEFAULT '[]',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Acceptance criteria (Gherkin-structured)
CREATE TABLE talos_acceptance_criteria (
  id TEXT PRIMARY KEY,
  requirement_id TEXT NOT NULL REFERENCES talos_requirements(id),
  application_id TEXT NOT NULL REFERENCES talos_applications(id),
  name TEXT NOT NULL,
  gherkin_feature TEXT NOT NULL,  -- Full Gherkin text (Feature + Scenarios)
  scenario_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','generated','tested')),
  source TEXT NOT NULL DEFAULT 'ai' CHECK(source IN ('ai','manual','imported')),
  confidence REAL,               -- AI generation confidence (0-1)
  tags_json TEXT NOT NULL DEFAULT '[]',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Requirements traceability matrix
CREATE TABLE talos_traceability (
  id TEXT PRIMARY KEY,
  requirement_id TEXT NOT NULL REFERENCES talos_requirements(id),
  criteria_id TEXT REFERENCES talos_acceptance_criteria(id),
  test_id TEXT REFERENCES talos_tests(id),
  coverage_status TEXT NOT NULL DEFAULT 'uncovered'
    CHECK(coverage_status IN ('uncovered','criteria-only','test-generated','test-passing','test-failing')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Document uploads
CREATE TABLE talos_documents (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES talos_applications(id),
  name TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK(file_type IN ('markdown','text','gherkin','openapi','jira','confluence')),
  content TEXT NOT NULL,
  parsed_at TEXT,
  requirements_extracted INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

-- Application crawl results
CREATE TABLE talos_crawl_pages (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES talos_applications(id),
  crawl_job_id TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT,
  role_type TEXT NOT NULL,        -- which vault role discovered this page
  page_type TEXT,                 -- 'form', 'list', 'detail', 'dashboard', 'auth', 'error'
  elements_json TEXT NOT NULL DEFAULT '{}', -- interactive elements found
  forms_json TEXT NOT NULL DEFAULT '[]',    -- form structures found
  navigation_json TEXT NOT NULL DEFAULT '[]', -- links/nav items
  screenshot_path TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  crawled_at TEXT NOT NULL
);

-- Test plans
CREATE TABLE talos_test_plans (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES talos_applications(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','in-progress','completed')),
  total_tests_planned INTEGER NOT NULL DEFAULT 0,
  tests_generated INTEGER NOT NULL DEFAULT 0,
  tests_passing INTEGER NOT NULL DEFAULT 0,
  priority_order_json TEXT NOT NULL DEFAULT '[]', -- ordered list of criteria IDs to generate
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

#### New Vector Store Fields

Extend `TalosChunk` type to include new chunk types:
```typescript
type TalosChunkType = "code" | "test" | "documentation" | "config" | "schema"
  | "requirement" | "acceptance-criteria" | "user-story" | "api-spec" | "page-structure";
```

Additional metadata fields in vector records:
- `requirementId?: string` — link to source requirement
- `priority?: string` — requirement priority for search ranking
- `featureArea?: string` — feature grouping label
- `userRoles?: string[]` — which roles this is relevant to
- `documentSource?: string` — source document filename/URL

### New Agent/Skill Files

```
.github/agents/
├── requirements-analyst.agent.md    # Parses documents → acceptance criteria
├── test-planner.agent.md            # Creates prioritized test plans
├── test-orchestrator.agent.md       # Coordinates full test pipeline
└── coverage-analyzer.agent.md       # Identifies gaps, recommends tests

.github/skills/
├── requirements-ingest/SKILL.md     # Document upload → parsing → criteria generation
├── test-plan/SKILL.md               # Criteria → prioritized test plan
├── app-crawl/SKILL.md               # Live app crawling with roles
├── coverage-analysis/SKILL.md       # Coverage gap analysis and reporting
└── criteria-management/SKILL.md     # CRUD for acceptance criteria with user editing
```

### New UI Components

```
ui/app/
├── talos/
│   ├── setup/                       # NEW — Setup wizard
│   │   ├── page.tsx                  # Wizard container
│   │   ├── steps/
│   │   │   ├── app-registration.tsx
│   │   │   ├── vault-config.tsx
│   │   │   ├── repo-discovery.tsx
│   │   │   ├── document-upload.tsx
│   │   │   ├── criteria-review.tsx
│   │   │   ├── app-crawl.tsx
│   │   │   ├── test-plan.tsx
│   │   │   └── test-generation.tsx
│   │   └── components/
│   │       ├── stepper-nav.tsx
│   │       └── wizard-progress.tsx
│   ├── requirements/                # NEW — Requirements management
│   │   ├── page.tsx                  # Requirements list
│   │   └── [id]/page.tsx             # Requirement detail + linked criteria
│   ├── criteria/                     # NEW — Acceptance criteria management
│   │   ├── page.tsx                  # Criteria list with Gherkin preview
│   │   └── [id]/page.tsx             # Criteria editor (Gherkin + visual)
│   ├── coverage/                     # NEW — Coverage dashboard
│   │   └── page.tsx                  # RTM view, gap analysis, coverage metrics
│   └── plans/                        # NEW — Test plan management
│       ├── page.tsx                  # Test plans list
│       └── [id]/page.tsx             # Plan detail with execution status

ui/components/
├── talos/
│   ├── requirements-uploader.tsx     # Drag-and-drop document upload
│   ├── gherkin-editor.tsx            # Syntax-highlighted Gherkin editor
│   ├── criteria-card.tsx             # Acceptance criteria display card
│   ├── traceability-matrix.tsx       # Interactive RTM table
│   ├── coverage-chart.tsx            # Coverage visualization
│   ├── crawl-viewer.tsx              # Page discovery results viewer
│   └── test-plan-board.tsx           # Kanban-style test plan board
```

### New MCP Tools (extending the existing 14)

```
15. ingest-document    — Upload and parse requirements document
16. generate-criteria  — Generate acceptance criteria from requirements
17. crawl-application  — Crawl live app with configured roles
18. create-test-plan   — Generate prioritized test plan
19. get-coverage       — Get traceability matrix and coverage metrics
20. list-requirements  — List requirements for an application
21. list-criteria      — List acceptance criteria for an application
```

### Integration Points with Existing Modules

| Existing Module | Integration |
|----------------|-------------|
| **Discovery** | Crawl results feed into same vector store; code chunks + requirements chunks used together for generation |
| **RAG** | Extended with new chunk types, metadata filtering by requirement ID and feature area |
| **Generator** | Enhanced prompts include acceptance criteria context alongside code context |
| **Runner** | Test plans determine execution order; results feed back into traceability matrix |
| **Healing** | Healed tests update traceability status; healing context includes requirement info |
| **Export** | Exports can include Gherkin `.feature` files alongside Playwright tests |
| **Config** | New config sections for ingestion, planner, crawler settings |

### End-to-End Data Flow

```
1. INGEST       User uploads PRD/spec/stories → Document parser → Requirement entities in DB + vector store
2. CRITERIA     Requirements → LLM (Structured Outputs) → Gherkin acceptance criteria → DB + vector store
3. CRAWL        App crawler visits all pages with each role → Page structure entities → DB + vector store
4. PLAN         Criteria + Code chunks + Crawl data + Coverage gaps → AI test planner → Prioritized test plan
5. GENERATE     For each plan item: RAG(code + requirements + criteria) → LLM → Playwright test → Validate → Store
6. RUN          Execute generated tests across browsers and roles → Results + artifacts
7. TRACE        Update traceability matrix: requirement → criteria → test → pass/fail status
8. HEAL         Failed tests → Healing module (enhanced with requirement context) → Fix → Re-run
9. REPORT       Coverage dashboard: % requirements covered, % tests passing, gaps, recommendations
```

---

## Open Questions

1. **Feature file generation vs code-only**: Should Talos generate `.feature` files + step definitions (via playwright-bdd), or generate raw Playwright test code directly from criteria? Recommendation: support both — BDD mode for teams that want Gherkin artifacts, direct mode for teams that prefer code-only.

2. **Document format priorities**: Which document formats should be supported in v1? Recommendation: Markdown and Gherkin first (native text), then OpenAPI (structured JSON), then JIRA/Confluence exports in v2.

3. **Crawling depth and scope**: How deep should the app crawler go? Should it submit forms, follow all links, or stay within configured bounds? Need to define crawl configuration (max depth, URL patterns, interaction level).

4. **Human-in-the-loop for criteria**: Should all AI-generated criteria require human approval before test generation? Recommendation: configurable threshold — high-confidence criteria can be auto-approved, low-confidence require review.

5. **Storage for documents**: Should uploaded documents be stored in SQLite (TEXT column) or on the filesystem with DB references? For large documents, filesystem with DB metadata is better.

---

## Constraints & Assumptions

- Talos is TypeScript/Node.js — all new modules must be ESM, Zod-validated, Vitest-tested
- LanceDB is the vector store — metadata filtering via `.where()` clauses
- OpenAI is the LLM provider — Structured Outputs for schema-constrained extraction
- Playwright is the test runner — all generated tests must be valid Playwright code
- SQLite via better-sqlite3 — synchronous DAL, migrations must be idempotent
- The existing 14 MCP tools pattern must be extended, not replaced
- Existing agent/skill file patterns (.agent.md, SKILL.md) must be followed for new agents

---

## Security Considerations

- **Document upload**: Validate file types and sizes server-side; scan for malicious content before parsing
- **Credential handling**: Crawling with auth must use vault-resolved credentials; never store plaintext passwords
- **LLM prompts**: Sanitize document content before sending to LLM to prevent prompt injection from uploaded docs
- **Storage state files**: Generated auth storage states contain cookies/tokens; must be stored in secure temp directory and cleaned up after use
- **RTM access control**: Traceability data may contain sensitive requirement details; respect application-level access controls
