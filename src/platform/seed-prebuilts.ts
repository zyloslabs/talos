/**
 * Seed Prebuilt Agents & Skills
 *
 * Inserts Talos-provided testing agents and skills into the database on first run.
 * Skips silently if they already exist (matched by name).
 */

import type { PlatformRepository } from "./repository.js";

// ── Prebuilt Skills ───────────────────────────────────────────────────────────

const PREBUILT_SKILLS = [
  {
    name: "Test Planner",
    description:
      "Analyzes requirements and codebase to create a prioritized test plan. Retrieves knowledge from the RAG knowledge base, maps testable requirements, identifies coverage gaps, and outputs a structured plan with test types and priorities.",
    content: `## Purpose
Drive the test planning phase: analyze ingested requirements, examine application code structure, and produce a prioritized test plan mapping every testable requirement to a recommended test type, priority level, and coverage gap analysis.

## Workflow
1. Read project config and inventory existing tests
2. Retrieve requirements from knowledge base via hybrid search
3. Analyze code structure via discovery (routes, API endpoints, components)
4. Cross-reference requirements with existing coverage
5. Classify requirements: Functional, Non-Functional, Integration, Data
6. Assign risk levels (Critical/High/Medium/Low) based on business impact and complexity
7. Recommend test types: e2e, integration, unit, accessibility, performance
8. Output structured test plan with prioritized items and identified gaps

## Required MCP Tools
- talos_get_traceability — retrieve requirements traceability matrix
- talos_list_criteria — list existing acceptance criteria with filters
- talos_ingest_document — ingest additional requirements if gaps are found`,
    tags: ["testing", "planning", "requirements"],
    requiredTools: ["talos_get_traceability", "talos_list_criteria", "talos_ingest_document"],
  },
  {
    name: "Criteria Generator",
    description:
      "Converts ingested requirements into structured Given/When/Then acceptance criteria using RAG-powered LLM generation. Auto-tags criteria, assigns confidence scores, and maintains traceability links.",
    content: `## Purpose
Drive the acceptance criteria generation phase: retrieve requirement chunks from the knowledge base, build constrained LLM prompts, parse structured criteria output, and save results with full traceability.

## Workflow
1. Scope retrieval by docType, tags, or persona
2. Retrieve requirement chunks via hybrid search
3. Group by functional area (Auth, Core workflows, Data, Integration, NFR)
4. Check for existing criteria to avoid duplicates
5. Build constrained LLM prompt with Given/When/Then format requirements
6. Parse LLM output into structured criteria with scenarios
7. Auto-tag with controlled vocabulary and assign confidence scores
8. Save criteria and link to source requirement chunks

## Output Format per Criterion
- Title: concise action-oriented label
- Scenarios: array of { given, when, then }
- Priority: critical / high / medium / low
- Test Type: e2e / integration / unit / accessibility
- Tags: controlled vocabulary terms
- Confidence: 0.0–1.0 based on requirement clarity

## Required MCP Tools
- talos_generate_criteria — AI-powered bulk criteria generation
- talos_create_criteria — save individual criteria
- talos_list_criteria — check for existing criteria
- talos_get_traceability — verify traceability after generation`,
    tags: ["testing", "criteria", "ai", "requirements"],
    requiredTools: ["talos_generate_criteria", "talos_create_criteria", "talos_list_criteria", "talos_get_traceability"],
  },
  {
    name: "Test Reviewer",
    description:
      "Reviews generated tests against acceptance criteria for scenario coverage, assertion completeness, precondition setup, POM compliance, and accessible locator usage. Outputs a structured review with per-criterion pass/fail and overall coverage score.",
    content: `## Purpose
Structured review of generated Playwright tests against their linked acceptance criteria. Verifies every criterion is covered, assertions are complete, preconditions are properly set up, and tests follow best practices.

## Review Checklist per Criterion
1. **Given (Precondition)**: Does the test set up the exact precondition? Is setup in beforeEach/fixture/body?
2. **When (Action)**: Does test perform the exact action via user-facing interaction?
3. **Then (Assertion)**: Does test assert the exact expected outcome? Uses web-first assertions?
4. **POM Compliance**: Are page interactions abstracted into Page Object classes?
5. **Accessible Locators**: Uses getByRole, getByLabel, getByText — no CSS/XPath selectors?
6. **Test Isolation**: Independent test that doesn't depend on other test state?

## Scoring
- Per criterion: Pass / Partial / Fail
- Overall score: (passed + 0.5 * partial) / total * 100
- Flag: criteria with no linked tests (gap), tests with no linked criteria (orphan)

## Required MCP Tools
- talos_list_criteria — load acceptance criteria linked to tests
- talos_get_traceability — get the requirements → criteria → tests mapping`,
    tags: ["testing", "review", "quality", "playwright"],
    requiredTools: ["talos_list_criteria", "talos_get_traceability"],
  },
];

// ── Prebuilt Agent ────────────────────────────────────────────────────────────

const PREBUILT_AGENT = {
  name: "Test Orchestrator",
  description:
    "Coordinates the full autonomous testing lifecycle: ingest requirements → generate acceptance criteria → generate tests → execute → heal → report. Drives end-to-end test coverage from requirements documents through passing Playwright suites.",
  systemPrompt: `You are a Testing Lifecycle Orchestrator. Drive an autonomous end-to-end testing pipeline from raw requirements through generated, executed, and self-healed Playwright test suites.

## Core Principles
- Requirements-driven: Every test traces back to an ingested requirement
- AI-powered criteria: Acceptance criteria are generated by LLM, not hand-written
- Full traceability: The RTM links requirements → criteria → tests at every phase
- Self-healing: Failures are analyzed and fixed automatically before reporting

## Phases
1. ANALYZE — Ingest requirements documents, run discovery on app
2. PLAN — Generate acceptance criteria, review traceability
3. GENERATE — Generate Playwright tests from criteria
4. EXECUTE — Run tests across browsers and vault roles
5. HEAL — Self-heal failures, update criteria status
6. REPORT — Summarize coverage, gaps, and results

Use Talos MCP tools for each phase. Track progress with the todo system. Do not write tests yourself — use the generator tools.`,
  toolsWhitelist: [
    "talos_ingest_document",
    "talos_generate_criteria",
    "talos_create_criteria",
    "talos_update_criteria",
    "talos_list_criteria",
    "talos_delete_criteria",
    "talos_get_traceability",
  ],
};

// ── Seed Function ─────────────────────────────────────────────────────────────

export function seedPrebuiltAgentsAndSkills(platformRepo: PlatformRepository): void {
  const existingSkills = platformRepo.listSkills();
  const existingAgents = platformRepo.listAgents();

  // Seed skills
  const createdSkillIds: string[] = [];
  for (const skill of PREBUILT_SKILLS) {
    const exists = existingSkills.some((s) => s.name === skill.name);
    if (!exists) {
      const created = platformRepo.createSkill({
        name: skill.name,
        description: skill.description,
        content: skill.content,
        tags: skill.tags,
        requiredTools: skill.requiredTools,
        enabled: true,
      });
      createdSkillIds.push(created.id);
      console.log(`[talos] Seeded prebuilt skill: ${skill.name}`);
    } else {
      const existing = existingSkills.find((s) => s.name === skill.name);
      if (existing) createdSkillIds.push(existing.id);
    }
  }

  // Seed agent
  const agentExists = existingAgents.some((a) => a.name === PREBUILT_AGENT.name);
  if (!agentExists) {
    const agent = platformRepo.createAgent({
      name: PREBUILT_AGENT.name,
      description: PREBUILT_AGENT.description,
      systemPrompt: PREBUILT_AGENT.systemPrompt,
      toolsWhitelist: PREBUILT_AGENT.toolsWhitelist,
      enabled: true,
    });
    // Link skills to agent
    if (createdSkillIds.length > 0) {
      platformRepo.setAgentSkills(agent.id, createdSkillIds);
    }
    console.log(`[talos] Seeded prebuilt agent: ${PREBUILT_AGENT.name} with ${createdSkillIds.length} skills`);
  }
}
