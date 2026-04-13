/**
 * E2E tests for PR #523 — Epic #508: UI Walkthrough Bugs & UX Improvements
 *
 * Maps acceptance criteria from 14 sub-issues to Playwright test cases:
 *   #509  Setup Wizard uses password inputs for API tokens (CRITICAL security)
 *   #510  Chat hydration mismatch fixed
 *   #511  Chat past messages load when switching sessions
 *   #512  Skills page no duplicate cards
 *   #513  Admin no duplicate personality entries
 *   #514  Dark theme toggle applies correctly
 *   #515  Chat shows conversation title instead of raw session ID
 *   #516  Dashboard DB type separated from JDBC URL
 *   #517  Setup Wizard removed redundant skip buttons
 *   #518  Setup Wizard step tabs scroll horizontally
 *   #519  Task Queue failed count not red when zero
 *   #520  Favicon present (no 404)
 *   #521  Form dialogs have required field indicators
 *   #522  Agent descriptions expand instead of truncating
 */

import { test, expect, type Page } from "@playwright/test";
import { ChatPage } from "./pages/chat.page";
import { SkillsPage } from "./pages/skills.page";
import { AdminPage } from "./pages/admin.page";
import { NavBarPage } from "./pages/nav-bar.page";
import { TalosPage } from "./pages/talos.page";
import { SetupWizardPage } from "./pages/setup-wizard.page";
import { TasksPage } from "./pages/tasks.page";
import { AgentsPage } from "./pages/agents.page";

// ── Helpers ───────────────────────────────────────────────────────────────────

const WIZARD_APP_ID = "e2e-508-app";

async function mockWizardApis(page: Page) {
  await page.route("**/api/talos/applications", (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: WIZARD_APP_ID,
          name: "E2E 508 App",
          status: "active",
          repositoryUrl: "https://github.com/test/repo",
          baseUrl: "https://test.example.com",
        }),
      });
    }
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: WIZARD_APP_ID,
            name: "E2E 508 App",
            status: "active",
            repositoryUrl: "https://github.com/test/repo",
            baseUrl: "https://test.example.com",
          },
        ]),
      });
    }
    return route.continue();
  });

  // Data Sources
  await page.route(`**/api/talos/applications/${WIZARD_APP_ID}/data-sources`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) }),
  );

  // Atlassian config with token values to verify masking
  await page.route(`**/api/talos/applications/${WIZARD_APP_ID}/atlassian`, (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          deploymentType: "datacenter",
          jiraUrl: "https://jira.example.com",
          jiraProject: "PROJ",
          jiraUsernameVaultRef: "",
          jiraApiTokenVaultRef: "",
          jiraPersonalTokenVaultRef: "OTEyMjIzNDMwMTQ2OnNlY3JldA==",
          jiraSslVerify: true,
          confluenceUrl: "https://confluence.example.com",
          confluenceSpaces: ["DEV"],
          confluenceUsernameVaultRef: "",
          confluenceApiTokenVaultRef: "",
          confluencePersonalTokenVaultRef: "NzI2NDMzNTEzNTQyOnNlY3JldA==",
          confluenceSslVerify: true,
        }),
      });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
  });

  // Vault roles
  await page.route("**/api/talos/vault-roles**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) }),
  );

  // Criteria
  await page.route(`**/api/talos/criteria/${WIZARD_APP_ID}**`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ criteria: [] }) }),
  );

  // M365
  await page.route("**/api/talos/m365/status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "disabled" }),
    }),
  );

  // MCP servers
  await page.route("**/api/talos/mcp-servers", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) }),
  );

  // Intelligence
  await page.route(`**/api/talos/applications/${WIZARD_APP_ID}/intelligence`, (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Not found" }) }),
  );

  // Traceability
  await page.route(`**/api/talos/criteria/traceability/${WIZARD_APP_ID}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        totalRequirements: 0,
        coveredRequirements: 0,
        totalCriteria: 0,
        implementedCriteria: 0,
        coveragePercentage: 0,
        unmappedRequirements: [],
        untestedCriteria: [],
      }),
    }),
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// #509 — Setup Wizard: Password inputs for API tokens (CRITICAL)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("#509 – Setup Wizard token masking (Security)", () => {
  test.beforeEach(async ({ page }) => {
    await mockWizardApis(page);
  });

  // AC: API tokens should be masked in password-type input fields
  test("Atlassian PAT fields use type=password for Data Center mode", async ({ page }) => {
    const wizard = new SetupWizardPage(page);
    await wizard.goto();

    await test.step("Select existing app to unlock navigation", async () => {
      await page.getByText("E2E 508 App").click();
    });

    await test.step("Navigate to Atlassian step", async () => {
      await wizard.goToStep(/Atlassian/);
      await expect(page.getByText(/Connect Jira/)).toBeVisible();
    });

    await test.step("Verify Jira PAT field is type=password", async () => {
      const jiraPat = page.getByPlaceholder("Personal access token vault ref").first();
      await expect(jiraPat).toBeVisible();
      await expect(jiraPat).toHaveAttribute("type", "password");
    });

    await test.step("Verify Confluence PAT field is type=password", async () => {
      const confluencePat = page.getByPlaceholder("Personal access token vault ref").nth(1);
      await expect(confluencePat).toBeVisible();
      await expect(confluencePat).toHaveAttribute("type", "password");
    });
  });

  // AC: Cloud mode API token fields should also be type=password
  test("Atlassian API token fields use type=password for Cloud mode", async ({ page }) => {
    // Override with cloud config
    await page.route(`**/api/talos/applications/${WIZARD_APP_ID}/atlassian`, (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            deploymentType: "cloud",
            jiraUrl: "https://org.atlassian.net",
            jiraProject: "PROJ",
            jiraUsernameVaultRef: "admin@example.com",
            jiraApiTokenVaultRef: "secret-api-token-value",
            jiraPersonalTokenVaultRef: "",
            jiraSslVerify: true,
            confluenceUrl: "https://org.atlassian.net/wiki",
            confluenceSpaces: ["DEV"],
            confluenceUsernameVaultRef: "admin@example.com",
            confluenceApiTokenVaultRef: "another-secret-token",
            confluencePersonalTokenVaultRef: "",
            confluenceSslVerify: true,
          }),
        });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
    });

    const wizard = new SetupWizardPage(page);
    await wizard.goto();

    await test.step("Select existing app", async () => {
      await page.getByText("E2E 508 App").click();
    });

    await test.step("Navigate to Atlassian step and switch to Cloud", async () => {
      await wizard.goToStep(/Atlassian/);
      await expect(page.getByText(/Connect Jira/)).toBeVisible();
      await page.getByRole("button", { name: "Cloud" }).click();
    });

    await test.step("Verify Jira API token field is type=password", async () => {
      const jiraTokenField = page.getByPlaceholder("API token vault ref").first();
      await expect(jiraTokenField).toBeVisible();
      await expect(jiraTokenField).toHaveAttribute("type", "password");
    });

    await test.step("Verify Confluence API token field is type=password", async () => {
      const confluenceTokenField = page.getByPlaceholder("API token vault ref").nth(1);
      await expect(confluenceTokenField).toBeVisible();
      await expect(confluenceTokenField).toHaveAttribute("type", "password");
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// #510 — Chat: No hydration mismatch
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("#510 – Chat hydration mismatch", () => {
  // AC: No hydration error on page load
  test("should not produce a hydration mismatch error on /chat", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto("/chat");
    await expect(page.getByText("Talos AI Chat")).toBeVisible();

    // Allow time for any late hydration errors to surface
    await page.waitForTimeout(500);

    const hydrationErrors = consoleErrors.filter((e) =>
      e.toLowerCase().includes("hydration"),
    );
    expect(hydrationErrors).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// #511 — Chat: Past messages load when selecting sessions
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("#511 – Chat past messages load", () => {
  // AC: Clicking a session in the sidebar should load and display messages
  test("should load conversation messages when selecting a past session", async ({ page }) => {
    // Mock sessions list with one session that has messages
    const SESSION_ID = "test-session-001";
    await page.route("**/api/talos/sessions", (route) => {
      if (route.request().url().endsWith("/sessions")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            { id: SESSION_ID, preview: "hello world", createdAt: "2026-04-01T00:00:00Z", startedAt: "2026-04-01T00:00:00Z", lastMessageAt: "2026-04-01T00:00:02Z", messageCount: 2 },
          ]),
        });
      }
      return route.continue();
    });

    // Mock individual session messages
    await page.route(`**/api/talos/sessions/${SESSION_ID}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: SESSION_ID,
          messages: [
            { role: "user", content: "hello world", timestamp: "2026-04-01T00:00:01Z" },
            { role: "assistant", content: "Hello! How can I help?", timestamp: "2026-04-01T00:00:02Z" },
          ],
        }),
      }),
    );

    const chat = new ChatPage(page);
    await chat.goto();

    await test.step("Click on the past session in sidebar", async () => {
      await page.getByText("hello world").click();
    });

    await test.step("Verify messages from the session are displayed", async () => {
      await expect(page.getByText("Hello! How can I help?")).toBeVisible();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// #512 — Skills: No duplicate cards
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("#512 – Skills no duplicate cards", () => {
  // AC: Each skill should appear exactly once
  test("should not display duplicate skill cards", async ({ page }) => {
    // Mock API returning duplicate records (same ID)
    await page.route("**/api/admin/skills", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { id: "s1", name: "Criteria Generator", description: "Generates criteria", content: "", tags: ["testing"], enabled: true, requiredTools: [], createdAt: "2026-01-01", updatedAt: "2026-01-01" },
          { id: "s1", name: "Criteria Generator", description: "Generates criteria", content: "", tags: ["testing"], enabled: true, requiredTools: [], createdAt: "2026-01-01", updatedAt: "2026-01-01" },
          { id: "s2", name: "Test Planner", description: "Plans tests", content: "", tags: ["testing"], enabled: true, requiredTools: [], createdAt: "2026-01-01", updatedAt: "2026-01-01" },
          { id: "s2", name: "Test Planner", description: "Plans tests", content: "", tags: ["testing"], enabled: true, requiredTools: [], createdAt: "2026-01-01", updatedAt: "2026-01-01" },
        ]),
      }),
    );

    const skills = new SkillsPage(page);
    await skills.goto();

    await test.step("Verify each skill appears exactly once", async () => {
      await expect(skills.getSkillCard("Criteria Generator")).toHaveCount(1);
      await expect(skills.getSkillCard("Test Planner")).toHaveCount(1);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// #513 — Admin: No duplicate personality entries
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("#513 – Admin no duplicate personalities", () => {
  // AC: Only one Default personality entry should be visible
  test("should not display duplicate personality entries", async ({ page }) => {
    // Mock personality API returning duplicates
    await page.route("**/api/admin/personality", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          personalities: [
            { id: "p1", name: "Default", systemPrompt: "You are Talos", active: true },
            { id: "p1", name: "Default", systemPrompt: "You are Talos", active: true },
          ],
          activeId: "p1",
        }),
      }),
    );

    const admin = new AdminPage(page);
    await admin.goto();

    await test.step("Scroll to Personality section", async () => {
      // Admin page uses scrollable sections, not sidebar links
      await admin.personalitySection.scrollIntoViewIfNeeded();
    });

    await test.step("Verify only one Default personality entry exists", async () => {
      // Each personality renders its name as a font-medium span
      const defaultEntries = admin.personalitySection.locator(".font-medium").filter({ hasText: "Default" });
      await expect(defaultEntries).toHaveCount(1);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// #514 — Dark theme toggle applies correctly
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("#514 – Dark theme toggle", () => {
  // AC: Selecting "Dark" should apply dark class to <html>
  test("should apply dark mode when Dark is selected", async ({ page }) => {
    const navbar = new NavBarPage(page);
    await navbar.goto("/talos");

    await test.step("Open theme dropdown and select Dark", async () => {
      await navbar.modeToggleButton.click();
      await page.getByRole("menuitem", { name: "Dark" }).click();
    });

    await test.step("Verify dark class is on <html>", async () => {
      await expect(page.locator("html")).toHaveClass(/dark/);
    });
  });

  // AC: Selecting "Light" after "Dark" should remove dark mode
  test("should remove dark mode when Light is selected after Dark", async ({ page }) => {
    const navbar = new NavBarPage(page);
    await navbar.goto("/talos");

    await test.step("Switch to Dark first", async () => {
      await navbar.modeToggleButton.click();
      await page.getByRole("menuitem", { name: "Dark" }).click();
      await expect(page.locator("html")).toHaveClass(/dark/);
    });

    await test.step("Switch to Light and verify", async () => {
      await navbar.modeToggleButton.click();
      await page.getByRole("menuitem", { name: "Light" }).click();
      await expect(page.locator("html")).not.toHaveClass(/dark/);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// #515 — Chat: Conversation title instead of raw session ID
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("#515 – Chat conversation title", () => {
  // AC: Header should show conversation title, not "Session <numeric-id>"
  test("should display session title or 'New Conversation' instead of raw numeric ID", async ({ page }) => {
    const chat = new ChatPage(page);
    await chat.goto();

    await test.step("Verify header does not display raw numeric session ID", async () => {
      // The header should show "New Conversation" for empty chats, not "Session <timestamp>"
      const header = page.locator("h2").first();
      await expect(header).toBeVisible();
      const headerText = await header.textContent();
      // Should NOT match "Session <digits>"
      expect(headerText).not.toMatch(/^Session \d+$/);
    });
  });

  // AC: When a session has messages, the title should come from the first message preview
  test("should display session preview text as title when session is selected", async ({ page }) => {
    const SESSION_ID = "title-test-session";
    await page.route("**/api/chat/sessions", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { id: SESSION_ID, preview: "are you there", createdAt: "2026-04-01T00:00:00Z" },
        ]),
      }),
    );
    await page.route(`**/api/chat/sessions/${SESSION_ID}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: SESSION_ID,
          messages: [
            { role: "user", content: "are you there", timestamp: "2026-04-01T00:00:01Z" },
          ],
        }),
      }),
    );

    const chat = new ChatPage(page);
    await chat.goto();

    await test.step("Select session and verify title", async () => {
      await page.getByText("are you there").first().click();
      const header = page.locator("h2").first();
      await expect(header).toContainText("are you there");
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// #516 — Dashboard: DB type separated from JDBC URL
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("#516 – Dashboard DB type separator", () => {
  // AC: DB type and JDBC URL should be visually separated, not concatenated
  test("should display DB type as a badge element separate from the JDBC URL text", async ({ page }) => {
    // The intelligence panel lives on /talos/[appId]. Mock the app and intelligence endpoint.
    const APP_ID = "db-sep-app";
    await page.route("**/api/talos/applications", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { id: APP_ID, name: "DB Sep App", status: "active", repositoryUrl: "https://github.com/test/repo", baseUrl: "https://test.example.com" },
        ]),
      }),
    );
    await page.route(`**/api/talos/applications/${APP_ID}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: APP_ID, name: "DB Sep App", description: "", status: "active", repositoryUrl: "https://github.com/test/repo", baseUrl: "https://test.example.com", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }),
      }),
    );
    await page.route(`**/api/talos/applications/${APP_ID}/intelligence`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "intel-1",
          applicationId: APP_ID,
          scannedAt: new Date().toISOString(),
          techStack: [],
          databases: [
            { type: "MySQL", connectionPattern: "jdbc:mysql://localhost:3306/yourdb", source: "config", environment: "dev" },
          ],
          testUsers: [],
          documentation: [],
          configFiles: [],
        }),
      }),
    );
    // Mock criteria, tests, vault-roles so the page doesn't error
    await page.route(`**/api/talos/criteria/${APP_ID}**`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ criteria: [] }) }),
    );
    await page.route(`**/api/talos/applications/${APP_ID}/tests**`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) }),
    );
    await page.route(`**/api/talos/vault-roles**`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) }),
    );
    await page.route(`**/api/talos/criteria/traceability/${APP_ID}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ totalRequirements: 0, coveredRequirements: 0, totalCriteria: 0, implementedCriteria: 0, coveragePercentage: 0, unmappedRequirements: [], untestedCriteria: [] }),
      }),
    );
    await page.route(`**/api/talos/applications/${APP_ID}/data-sources`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) }),
    );
    await page.route(`**/api/talos/applications/${APP_ID}/atlassian`, (route) =>
      route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Not found" }) }),
    );

    await page.goto(`/talos/${APP_ID}`);

    await test.step("Verify MySQL is displayed as a separate badge from the JDBC URL", async () => {
      // The fix wraps the DB type in a <Badge> component which renders as a separate element
      // The badge and connection pattern should not be concatenated in a single text node
      await expect(page.getByText("MySQL", { exact: true })).toBeVisible();
      await expect(page.getByText("jdbc:mysql://localhost:3306/yourdb")).toBeVisible();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// #517 — Setup Wizard: No redundant skip buttons
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("#517 – Setup Wizard no redundant skip buttons", () => {
  test.beforeEach(async ({ page }) => {
    await mockWizardApis(page);
  });

  // AC: Data Sources step should not have an inline "Skip — Continue to Next Step" button
  test("Data Sources step should have only the bottom nav Skip button", async ({ page }) => {
    const wizard = new SetupWizardPage(page);
    await wizard.goto();

    await test.step("Select existing app to unlock steps", async () => {
      await page.getByText("E2E 508 App").click();
    });

    await test.step("Verify on Data Sources step", async () => {
      await expect(page.getByRole("heading", { name: "Data Sources" })).toBeVisible();
    });

    await test.step("Verify no inline skip button exists, only nav Skip", async () => {
      // There should NOT be a "Skip — Continue to Next Step" button
      await expect(page.getByRole("button", { name: /Skip.*Continue to Next Step/ })).not.toBeVisible();
      // The bottom nav Skip should still exist
      await expect(wizard.skipNavButton).toBeVisible();
    });
  });

  // AC: Atlassian step should not have an inline "Skip" button separate from nav
  test("Atlassian step should have only the bottom nav Skip button", async ({ page }) => {
    const wizard = new SetupWizardPage(page);
    await wizard.goto();

    await test.step("Select existing app and go to Atlassian", async () => {
      await page.getByText("E2E 508 App").click();
      await wizard.goToStep(/Atlassian/);
      await expect(page.getByText(/Connect Jira/)).toBeVisible();
    });

    await test.step("Count skip buttons — should be exactly one (the nav Skip)", async () => {
      const skipButtons = page.getByRole("button", { name: "Skip", exact: true });
      await expect(skipButtons).toHaveCount(1);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// #518 — Setup Wizard: Step tabs scroll horizontally
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("#518 – Setup Wizard step tabs scroll", () => {
  test.beforeEach(async ({ page }) => {
    await mockWizardApis(page);
  });

  // AC: Step tabs container should have overflow-x-auto for horizontal scrolling
  test("step tabs container should be horizontally scrollable", async ({ page }) => {
    const wizard = new SetupWizardPage(page);
    await wizard.goto();

    await test.step("Verify the step tabs wrapper has overflow-x-auto", async () => {
      // The scrollable container wraps all step buttons
      const scrollContainer = page.locator(".overflow-x-auto").first();
      await expect(scrollContainer).toBeVisible();
    });

    await test.step("Verify all 9 steps are rendered in the DOM", async () => {
      // Even though some may be off-screen, all 9 step buttons should exist
      const stepLabels = [
        "Register App", "Data Sources", "Atlassian", "Upload Docs",
        "Vault Roles", "Discovery", "Generate Criteria", "Review Criteria", "Generate Tests",
      ];
      for (const label of stepLabels) {
        await expect(page.getByRole("button", { name: label })).toBeAttached();
      }
    });
  });

  // AC: Step tabs have min-w and shrink-0 to prevent collapse
  test("step tabs should have minimum width to prevent text collapse", async ({ page }) => {
    const wizard = new SetupWizardPage(page);
    await wizard.goto();

    await test.step("Verify step items have min-w class", async () => {
      const firstStepWrapper = page.locator(".min-w-\\[120px\\]").first();
      await expect(firstStepWrapper).toBeVisible();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// #519 — Task Queue: Failed count not red when zero
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("#519 – Task Queue failed count styling", () => {
  // AC: Failed count should not be red when value is 0
  test("should display zero failed count in muted color, not red", async ({ page }) => {
    // Mock task stats with all zeros
    await page.route("**/api/admin/tasks/stats", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ pending: 0, running: 0, completed: 0, failed: 0 }),
      }),
    );
    await page.route("**/api/admin/tasks", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      }),
    );

    const tasks = new TasksPage(page);
    await tasks.goto();

    await test.step("Verify the Failed stat value uses muted color when zero", async () => {
      // Find the Failed stat card — the paragraph with "0" above "Failed" label
      const failedValue = page.getByText("Failed").locator("..").locator("p.text-2xl").first();
      await expect(failedValue).toBeVisible();
      // Should have text-muted-foreground class, NOT text-red-500
      await expect(failedValue).toHaveClass(/text-muted-foreground/);
      await expect(failedValue).not.toHaveClass(/text-red-500/);
    });
  });

  // AC: Failed count should be red when value > 0
  test("should display non-zero failed count in red", async ({ page }) => {
    await page.route("**/api/admin/tasks/stats", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ pending: 1, running: 0, completed: 5, failed: 3 }),
      }),
    );
    await page.route("**/api/admin/tasks", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      }),
    );

    const tasks = new TasksPage(page);
    await tasks.goto();

    await test.step("Verify the Failed stat value is red when non-zero", async () => {
      const failedValue = page.getByText("Failed").locator("..").locator("p.text-2xl").first();
      await expect(failedValue).toBeVisible();
      await expect(failedValue).toHaveText("3");
      await expect(failedValue).toHaveClass(/text-red-500/);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// #520 — Favicon present
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("#520 – Favicon present", () => {
  // AC: favicon.svg should load without 404
  test("should serve favicon without 404 error", async ({ page }) => {
    const response = await page.request.get("/favicon.svg");
    expect(response.status()).toBe(200);
  });

  // AC: HTML <link> tag should reference the favicon
  test("should have a favicon link tag in the document head", async ({ page }) => {
    await page.goto("/talos");
    const faviconLink = page.locator('link[rel="icon"]');
    await expect(faviconLink).toBeAttached();
    const href = await faviconLink.getAttribute("href");
    expect(href).toContain("favicon");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// #521 — Form dialogs: Required field indicators
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("#521 – Required field indicators", () => {
  // AC: Add Application dialog marks required fields with asterisk (*)
  test("Add Application dialog should show required field indicators", async ({ page }) => {
    const talos = new TalosPage(page);
    await talos.goto();

    await test.step("Open Add Application dialog", async () => {
      await talos.openAddDialog();
      await expect(talos.dialogTitle).toBeVisible();
    });

    await test.step("Verify required fields have asterisk indicators", async () => {
      // Application Name should have a * indicator
      const nameLabel = page.getByText("Application Name *");
      await expect(nameLabel).toBeVisible();

      // Repository URL should have a * indicator
      const repoLabel = page.getByText("Repository URL *");
      await expect(repoLabel).toBeVisible();

      // Base URL should have a * indicator
      const baseUrlLabel = page.getByText("Base URL *");
      await expect(baseUrlLabel).toBeVisible();
    });

    await test.step("Verify optional field is marked as optional", async () => {
      const branchLabel = page.getByText("(optional)");
      await expect(branchLabel).toBeVisible();
    });
  });

  // AC: Add Vault Role dialog marks required fields
  test("Add Vault Role dialog should show required field indicators", async ({ page }) => {
    await page.goto("/talos/vault");

    await test.step("Open Add Vault Role dialog", async () => {
      const addButton = page.getByRole("button", { name: "Add Vault Role" });
      await expect(addButton).toBeVisible();
      await addButton.click();
    });

    await test.step("Verify required fields have asterisk indicator", async () => {
      await expect(page.getByText(/Application\s*\*/)).toBeVisible();
      await expect(page.getByText(/Role Name\s*\*/)).toBeVisible();
    });

    await test.step("Verify optional field is marked", async () => {
      await expect(page.getByText("(optional)")).toBeVisible();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// #522 — Agents: Description expands instead of truncating
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("#522 – Agent description expand", () => {
  // AC: Agent cards with long descriptions should have "Show more" button
  test("should display Show more button for agents with long descriptions", async ({ page }) => {
    await page.route("**/api/agents", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "a1",
            name: "Test Orchestrator",
            description:
              "Coordinates the full autonomous testing lifecycle: ingest requirements, generate acceptance criteria, generate tests, execute, heal, and report. Drives end-to-end test coverage from requirements documents through passing Playwright suites.",
            systemPrompt: "You are an orchestrator",
            enabled: true,
            toolsWhitelist: ["tool1", "tool2", "tool3", "tool4", "tool5", "tool6", "tool7"],
          },
        ]),
      }),
    );

    const agents = new AgentsPage(page);
    await agents.goto();

    await test.step("Verify Show more button is visible", async () => {
      await expect(agents.getShowMoreButton("Test Orchestrator")).toBeVisible();
    });
  });

  // AC: Clicking "Show more" should expand the description
  test("should expand description when Show more is clicked", async ({ page }) => {
    await page.route("**/api/agents", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "a1",
            name: "Test Orchestrator",
            description:
              "Coordinates the full autonomous testing lifecycle: ingest requirements, generate acceptance criteria, generate tests, execute, heal, and report. Drives end-to-end test coverage from requirements documents through passing Playwright suites.",
            systemPrompt: "You are an orchestrator",
            enabled: true,
            toolsWhitelist: ["tool1"],
          },
        ]),
      }),
    );

    const agents = new AgentsPage(page);
    await agents.goto();

    await test.step("Click Show more", async () => {
      await agents.getShowMoreButton("Test Orchestrator").click();
    });

    await test.step("Verify Show more button disappears (description is expanded)", async () => {
      await expect(agents.getShowMoreButton("Test Orchestrator")).not.toBeVisible();
    });

    await test.step("Verify full description text is visible", async () => {
      await expect(page.getByText("Drives end-to-end test coverage")).toBeVisible();
    });
  });

  // AC: Clicking the expanded description should collapse it
  test("should collapse description when clicking the expanded text", async ({ page }) => {
    await page.route("**/api/agents", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "a1",
            name: "Test Orchestrator",
            description:
              "Coordinates the full autonomous testing lifecycle: ingest requirements, generate acceptance criteria, generate tests, execute, heal, and report. Drives end-to-end test coverage from requirements documents through passing Playwright suites.",
            systemPrompt: "You are an orchestrator",
            enabled: true,
            toolsWhitelist: ["tool1"],
          },
        ]),
      }),
    );

    const agents = new AgentsPage(page);
    await agents.goto();

    await test.step("Expand then collapse", async () => {
      await agents.getShowMoreButton("Test Orchestrator").click();
      // Click description text to collapse
      await agents.getAgentDescription("Test Orchestrator").click();
    });

    await test.step("Verify Show more button reappears", async () => {
      await expect(agents.getShowMoreButton("Test Orchestrator")).toBeVisible();
    });
  });
});
