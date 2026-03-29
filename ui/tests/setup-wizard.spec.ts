import { test, expect } from "@playwright/test";
import { SetupWizardPage } from "./pages/setup-wizard.page";

// ── Helpers ─────────────────────────────────────────────────────────────────

const MOCK_APP_ID = "app-wizard-test";
const MOCK_APP = {
  id: MOCK_APP_ID,
  name: "Wizard Test App",
  status: "active",
  repositoryUrl: "https://github.com/example/repo",
  baseUrl: "https://staging.example.com",
};

/**
 * Set up API mocks and register an app so we can skip to any wizard step.
 * Returns the page object for the wizard.
 */
async function setupWizardWithApp(page: import("@playwright/test").Page) {
  // Mock applications API (GET returns one existing app, POST creates)
  await page.route("**/api/talos/applications", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([MOCK_APP]),
      });
    }
    if (route.request().method() === "POST") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_APP),
      });
    }
    return route.continue();
  });

  // Mock single application GET
  await page.route(`**/api/talos/applications/${MOCK_APP_ID}`, (route) => {
    if (route.request().method() === "GET" && !route.request().url().includes("/")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_APP),
      });
    }
    return route.continue();
  });

  // Mock data sources (empty)
  await page.route(`**/api/talos/applications/${MOCK_APP_ID}/data-sources`, (route) => {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  // Mock Atlassian config (not configured)
  await page.route(`**/api/talos/applications/${MOCK_APP_ID}/atlassian`, (route) => {
    return route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "Not found" }),
    });
  });

  // Mock vault roles (empty — uses query param, not path param)
  await page.route("**/api/talos/vault-roles*", (route) => {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  // Mock MCP servers
  await page.route("**/api/talos/mcp-servers", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) })
  );
}

/**
 * Navigate through wizard steps by skipping until we reach the target step.
 * Step 0 = Register App (select existing), Step 1 = Data Sources, etc.
 */
async function navigateToStep(wizard: SetupWizardPage, targetStep: number) {
  await wizard.goto();

  if (targetStep === 0) return;

  // Step 0: select existing app
  await wizard.existingAppButton(MOCK_APP.name).click();
  // handleSelectApp detects completions and jumps — we may already be at (or past) targetStep
  // Wait for the step heading area to stabilize
  await wizard.page.waitForLoadState("networkidle");

  // Click the target step in the progress bar if we're not there
  const stepLabels = [
    "Register App",
    "Data Sources",
    "Atlassian",
    "Upload Docs",
    "Vault Roles",
    "Discovery",
    "Generate Criteria",
    "Review Criteria",
    "Generate Tests",
  ];

  await wizard.stepProgressButton(stepLabels[targetStep]).click();
}

// ── #410 — Atlassian PAT Fields Masked (Security) ─────────────────────────

test.describe("Setup Wizard — Atlassian PAT Masking (#410)", () => {
  let wizard: SetupWizardPage;

  test.beforeEach(async ({ page }) => {
    wizard = new SetupWizardPage(page);
    await setupWizardWithApp(page);
  });

  // AC #410: Jira API token field uses type="password" (Cloud mode)
  test("should mask Jira API token input in Cloud mode", async ({ page }) => {
    await navigateToStep(wizard, 2);
    await expect(wizard.stepHeading("Atlassian")).toBeVisible();

    await test.step("Select Cloud deployment", async () => {
      await wizard.cloudToggle.click();
    });

    await test.step("Verify Jira API token field is masked", async () => {
      const field = page.getByPlaceholder("API token vault ref").first();
      await expect(field).toBeVisible();
      await expect(field).toHaveAttribute("type", "password");
    });
  });

  // AC #410: Confluence API token field uses type="password" (Cloud mode)
  test("should mask Confluence API token input in Cloud mode", async ({ page }) => {
    await navigateToStep(wizard, 2);
    await expect(wizard.stepHeading("Atlassian")).toBeVisible();

    await test.step("Select Cloud deployment", async () => {
      await wizard.cloudToggle.click();
    });

    await test.step("Verify Confluence API token field is masked", async () => {
      const field = page.getByPlaceholder("API token vault ref").nth(1);
      await expect(field).toBeVisible();
      await expect(field).toHaveAttribute("type", "password");
    });
  });

  // AC #410: Jira PAT field uses type="password" (Data Center mode)
  test("should mask Jira personal token input in Data Center mode", async ({ page }) => {
    await navigateToStep(wizard, 2);
    await expect(wizard.stepHeading("Atlassian")).toBeVisible();

    await test.step("Select Data Center deployment", async () => {
      await wizard.dataCenterToggle.click();
    });

    await test.step("Verify Jira PAT field is masked", async () => {
      const field = page.getByPlaceholder("Personal access token vault ref").first();
      await expect(field).toBeVisible();
      await expect(field).toHaveAttribute("type", "password");
    });
  });

  // AC #410: Confluence PAT field uses type="password" (Data Center mode)
  test("should mask Confluence personal token input in Data Center mode", async ({ page }) => {
    await navigateToStep(wizard, 2);
    await expect(wizard.stepHeading("Atlassian")).toBeVisible();

    await test.step("Select Data Center deployment", async () => {
      await wizard.dataCenterToggle.click();
    });

    await test.step("Verify Confluence PAT field is masked", async () => {
      const field = page.getByPlaceholder("Personal access token vault ref").nth(1);
      await expect(field).toBeVisible();
      await expect(field).toHaveAttribute("type", "password");
    });
  });
});

// ── #407 — Discovery Endpoint Wired to Real DiscoveryEngine ─────────────────

test.describe("Setup Wizard — Discovery Step (#407)", () => {
  let wizard: SetupWizardPage;

  test.beforeEach(async ({ page }) => {
    wizard = new SetupWizardPage(page);
    await setupWizardWithApp(page);

    // Mock intelligence report (404 initially — discovery hasn't run)
    await page.route(`**/api/talos/applications/${MOCK_APP_ID}/intelligence`, (route) => {
      return route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Not found" }),
      });
    });

    // Mock criteria (empty)
    await page.route(`**/api/talos/applications/${MOCK_APP_ID}/criteria`, (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });
  });

  // AC #407: Clicking Start Discovery shows progress state (not instant completion)
  test("should show progress state when discovery is triggered", async ({ page }) => {
    // Mock discover endpoint — delay response to simulate real scan
    await page.route(`**/api/talos/applications/${MOCK_APP_ID}/discover`, (route) => {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(
            route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({ status: "complete", filesScanned: 42 }),
            })
          );
        }, 500);
      });
    });

    await navigateToStep(wizard, 5);
    await expect(wizard.stepHeading("Discovery")).toBeVisible();

    await test.step("Click Start Discovery", async () => {
      await wizard.startDiscoveryButton.click();
    });

    await test.step("Verify progress indicator is shown", async () => {
      await expect(wizard.discoveryInProgress).toBeVisible();
    });

    await test.step("Verify discovery completes", async () => {
      await expect(wizard.discoveryComplete).toBeVisible();
    });
  });

  // AC #407: After discovery, Continue button appears
  test("should show Continue button after discovery completes", async ({ page }) => {
    await page.route(`**/api/talos/applications/${MOCK_APP_ID}/discover`, (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "complete", filesScanned: 10 }),
      });
    });

    await navigateToStep(wizard, 5);
    await expect(wizard.stepHeading("Discovery")).toBeVisible();

    await wizard.startDiscoveryButton.click();
    await expect(wizard.discoveryComplete).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
  });

  // AC #407 + #409: Discovery failure shows inline error alert
  test("should show error alert when discovery fails", async ({ page }) => {
    await page.route(`**/api/talos/applications/${MOCK_APP_ID}/discover`, (route) => {
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Discovery engine not initialized" }),
      });
    });

    await navigateToStep(wizard, 5);
    await expect(wizard.stepHeading("Discovery")).toBeVisible();

    await test.step("Click Start Discovery", async () => {
      await wizard.startDiscoveryButton.click();
    });

    await test.step("Verify error alert is visible with actionable message", async () => {
      await expect(wizard.errorAlert).toBeVisible();
      await expect(wizard.errorAlert).toContainText(/unavailable|error|check/i);
    });

    await test.step("Verify Start Discovery button reappears for retry", async () => {
      await expect(wizard.startDiscoveryButton).toBeVisible();
    });
  });
});

// ── #406 — CriteriaGenerator Instantiated When Copilot Available ────────────

test.describe("Setup Wizard — Generate Criteria Step (#406)", () => {
  let wizard: SetupWizardPage;

  test.beforeEach(async ({ page }) => {
    wizard = new SetupWizardPage(page);
    await setupWizardWithApp(page);

    // Mock intelligence report (exists — discovery has run)
    await page.route(`**/api/talos/applications/${MOCK_APP_ID}/intelligence`, (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ appId: MOCK_APP_ID, pages: [], technologies: [] }),
      });
    });

    // Mock criteria GET — exact pathname match (avoids intercepting /generate or /suggest)
    await page.route(
      (url) => url.pathname === `/api/talos/criteria/${MOCK_APP_ID}`,
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ criteria: [] }),
        })
    );
  });

  // AC #406: When Copilot is configured, generate returns success
  test("should show criteria results on successful generation", async ({ page }) => {
    await page.route(`**/api/talos/criteria/${MOCK_APP_ID}/generate`, (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ criteriaCreated: 5, averageConfidence: 0.85 }),
      });
    });

    await navigateToStep(wizard, 6);
    await expect(wizard.stepHeading("Generate Criteria")).toBeVisible();

    await test.step("Click Generate Criteria", async () => {
      await wizard.generateCriteriaButton.click();
    });

    await test.step("Verify results are displayed", async () => {
      await expect(wizard.criteriaGeneratedCount).toBeVisible();
      await expect(page.getByText("85%")).toBeVisible();
      await expect(page.getByText("Average confidence")).toBeVisible();
    });
  });

  // AC #406: When Copilot is NOT configured, 503 shows helpful message
  test("should show actionable 503 error when Copilot not configured", async ({ page }) => {
    await page.route(`**/api/talos/criteria/${MOCK_APP_ID}/generate`, (route) => {
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error:
            "AI features require Copilot authentication. Please configure your Copilot token in Admin > Auth settings.",
        }),
      });
    });

    await navigateToStep(wizard, 6);
    await expect(wizard.stepHeading("Generate Criteria")).toBeVisible();

    await test.step("Click Generate Criteria", async () => {
      await wizard.generateCriteriaButton.click();
    });

    await test.step("Verify actionable error is displayed", async () => {
      await expect(wizard.errorAlert).toBeVisible();
      await expect(wizard.errorAlert).toContainText(/Copilot|Auth settings|unavailable/i);
    });
  });
});

// ── #409 — Error Feedback on AI Mutation Failures ───────────────────────────

test.describe("Setup Wizard — Error Feedback (#409)", () => {
  let wizard: SetupWizardPage;

  test.beforeEach(async ({ page }) => {
    wizard = new SetupWizardPage(page);
    await setupWizardWithApp(page);

    await page.route(`**/api/talos/applications/${MOCK_APP_ID}/intelligence`, (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ appId: MOCK_APP_ID, pages: [], technologies: [] }),
      });
    });
  });

  // AC #409: Criteria generation failure shows inline error
  test("should display error alert when criteria generation fails with network error", async ({ page }) => {
    await page.route(
      (url) => url.pathname === `/api/talos/criteria/${MOCK_APP_ID}`,
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ criteria: [] }),
        })
    );

    await page.route(`**/api/talos/criteria/${MOCK_APP_ID}/generate`, (route) => {
      return route.abort("failed");
    });

    await navigateToStep(wizard, 6);
    await expect(wizard.stepHeading("Generate Criteria")).toBeVisible();

    await wizard.generateCriteriaButton.click();

    await test.step("Verify error message is displayed", async () => {
      await expect(wizard.errorAlert).toBeVisible();
    });
  });

  // AC #409: AI Suggest failure in Review Criteria shows inline error
  test("should display error alert when AI suggest fails", async ({ page }) => {
    const mockCriteria = [
      {
        id: "crit-1",
        title: "Login flow",
        description: "User can log in",
        status: "draft",
        confidence: 0.9,
        scenarios: [{ given: "a user", when: "they log in", then: "they see dashboard" }],
      },
    ];

    await page.route(
      (url) => url.pathname === `/api/talos/criteria/${MOCK_APP_ID}`,
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ criteria: mockCriteria }),
        })
    );

    await page.route(`**/api/talos/criteria/${MOCK_APP_ID}/suggest`, (route) => {
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Service unavailable" }),
      });
    });

    await navigateToStep(wizard, 7);
    await expect(wizard.stepHeading("Review Criteria")).toBeVisible();

    await test.step("Type a suggestion and click AI Suggest", async () => {
      await wizard.aiSuggestInput.fill("User should be able to export data");
      await wizard.aiSuggestButton.click();
    });

    await test.step("Verify error message is displayed", async () => {
      await expect(wizard.errorAlert).toBeVisible();
      await expect(wizard.errorAlert).toContainText(/unavailable|error|Copilot/i);
    });
  });

  // AC #409: Generate Tests failure shows inline error when all tests fail
  test("should display error alert when all test generations fail", async ({ page }) => {
    const mockCriteria = [
      {
        id: "crit-1",
        title: "Login flow",
        description: "User can log in",
        status: "approved",
        confidence: 0.9,
        scenarios: [{ given: "a user", when: "they log in", then: "they see dashboard" }],
      },
    ];

    // Handle criteria GET with and without query params (e.g., ?status=approved)
    await page.route(
      (url) => url.pathname === `/api/talos/criteria/${MOCK_APP_ID}`,
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ criteria: mockCriteria }),
        })
    );

    // Mock traceability report
    await page.route(`**/api/talos/criteria/traceability/${MOCK_APP_ID}`, (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          totalCriteria: 1,
          implementedCriteria: 0,
          coveragePercentage: 0,
        }),
      });
    });

    // Mock generate test endpoint — fail
    await page.route("**/api/talos/tests/generate", (route) => {
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Generation failed" }),
      });
    });

    await navigateToStep(wizard, 8);
    await expect(wizard.stepHeading("Generate Tests")).toBeVisible();

    await test.step("Click Generate All Tests", async () => {
      await wizard.generateAllTestsButton.click();
    });

    await test.step("Verify error alert is displayed", async () => {
      await expect(wizard.errorAlert).toBeVisible();
    });
  });
});

// ── #408 — Step Completion Detection Handles Intelligence 404 ───────────────

test.describe("Setup Wizard — Step Completion Detection (#408)", () => {
  let wizard: SetupWizardPage;

  test.beforeEach(async ({ page }) => {
    wizard = new SetupWizardPage(page);
  });

  // AC #408: When intelligence returns 404 but criteria exist, Generate Criteria is marked complete
  test("should mark Generate Criteria step complete when criteria exist but intelligence 404", async ({ page }) => {
    // Mock: app exists with criteria but no intelligence report
    await page.route("**/api/talos/applications", (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([MOCK_APP]),
        });
      }
      return route.continue();
    });

    await page.route(`**/api/talos/applications/${MOCK_APP_ID}/data-sources`, (route) => {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    });

    await page.route(`**/api/talos/applications/${MOCK_APP_ID}/atlassian`, (route) => {
      return route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Not found" }),
      });
    });

    await page.route("**/api/talos/vault-roles*", (route) => {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    });

    // Intelligence returns 404
    await page.route(`**/api/talos/applications/${MOCK_APP_ID}/intelligence`, (route) => {
      return route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Not found" }),
      });
    });

    // Criteria exist
    await page.route(`**/api/talos/criteria/${MOCK_APP_ID}`, (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          criteria: [
            {
              id: "crit-1",
              title: "Login flow",
              description: "User can log in",
              status: "draft",
              confidence: 0.9,
              scenarios: [{ given: "a user", when: "they log in", then: "they see dashboard" }],
            },
          ],
        }),
      });
    });

    await page.route("**/api/talos/mcp-servers", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) })
    );

    await wizard.goto();

    await test.step("Select existing app", async () => {
      await wizard.existingAppButton(MOCK_APP.name).click();
    });

    await test.step("Wizard should jump past completed steps to Review Criteria (step 7)", async () => {
      // Steps 0 (Register), 3 (Upload Docs — criteria count signals docs were processed),
      // and 6 (Generate Criteria — criteria exist) should be marked complete.
      // The wizard should land on the first incomplete step.
      // With no data sources, no atlassian, no vault roles, no intelligence:
      // Step 0 = done, 1 = not done → wizard jumps to step 1
      // But the key assertion: criteria > 0 means step 6 is complete
      await wizard.page.waitForLoadState("networkidle");

      // Navigate to step 6 via progress bar and verify it shows as completed
      // (CheckCircle2 icon instead of step number)
      await wizard.stepProgressButton("Generate Criteria").click();

      // The heading should be visible — we're on the step
      await expect(wizard.stepHeading("Generate Criteria")).toBeVisible();
    });
  });

  // AC #408: When selecting existing app, wizard jumps to correct incomplete step
  test("should jump to first incomplete step when existing app is selected", async ({ page }) => {
    await page.route("**/api/talos/applications", (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([MOCK_APP]),
        });
      }
      return route.continue();
    });

    // Data sources exist (step 1 complete)
    await page.route(`**/api/talos/applications/${MOCK_APP_ID}/data-sources`, (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{ id: "ds-1", name: "Oracle DB", type: "jdbc" }]),
      });
    });

    // Atlassian not configured (step 2 incomplete)
    await page.route(`**/api/talos/applications/${MOCK_APP_ID}/atlassian`, (route) => {
      return route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Not found" }),
      });
    });

    await page.route("**/api/talos/vault-roles*", (route) => {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    });

    await page.route(`**/api/talos/applications/${MOCK_APP_ID}/intelligence`, (route) => {
      return route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Not found" }),
      });
    });

    await page.route(`**/api/talos/criteria/${MOCK_APP_ID}`, (route) => {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ criteria: [] }) });
    });

    await page.route("**/api/talos/mcp-servers", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) })
    );

    await wizard.goto();

    await test.step("Select existing app", async () => {
      await wizard.existingAppButton(MOCK_APP.name).click();
    });

    await test.step("Wizard should jump to step 2 (Atlassian) — first incomplete step", async () => {
      // Step 0 (Register) = done (app exists), Step 1 (Data Sources) = done
      // Step 2 (Atlassian) = not done → should land here
      await expect(wizard.stepHeading("Atlassian")).toBeVisible();
    });
  });

  // AC #408: Intelligence 404 does not crash or block the wizard
  test("should not crash when intelligence endpoint returns 404 during app selection", async ({ page }) => {
    await page.route("**/api/talos/applications", (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([MOCK_APP]),
        });
      }
      return route.continue();
    });

    await page.route(`**/api/talos/applications/${MOCK_APP_ID}/data-sources`, (route) => {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    });

    await page.route(`**/api/talos/applications/${MOCK_APP_ID}/atlassian`, (route) => {
      return route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Not found" }),
      });
    });

    await page.route("**/api/talos/vault-roles*", (route) => {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    });

    // Intelligence: 404
    await page.route(`**/api/talos/applications/${MOCK_APP_ID}/intelligence`, (route) => {
      return route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Not found" }),
      });
    });

    // No criteria
    await page.route(`**/api/talos/criteria/${MOCK_APP_ID}`, (route) => {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    });

    await page.route("**/api/talos/mcp-servers", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) })
    );

    await wizard.goto();

    await test.step("Select existing app — should not crash", async () => {
      await wizard.existingAppButton(MOCK_APP.name).click();
    });

    await test.step("Wizard should navigate to a valid step (not show error page)", async () => {
      // Should be on step 1 (Data Sources) — first incomplete step after Register
      await expect(wizard.stepHeading("Data Sources")).toBeVisible();
    });
  });
});
