/**
 * E2E tests for Atlassian wizard step.
 *
 * Covers:
 *   #337 – Atlassian step configuration (existing tests)
 *   #430 – Import Atlassian data (Jira + Confluence) into RAG knowledge base
 */

import { test, expect } from "@playwright/test";
import { AtlassianWizardPage } from "./pages/atlassian.page";

// ── Helper: Navigate to Atlassian wizard step ───────────────────────────────

async function navigateToAtlassianStep(page: import("@playwright/test").Page) {
  // Mock applications API
  await page.route("**/api/talos/applications", (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "app-atl-test",
          name: "Atlassian Test App",
          status: "active",
          repositoryUrl: "",
          baseUrl: "",
        }),
      });
    }
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    }
    return route.continue();
  });

  // Mock data sources GET (empty) for the Data Sources step
  await page.route("**/api/talos/applications/app-atl-test/data-sources", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    }
    return route.continue();
  });

  // Mock Atlassian config GET (404 = not configured yet)
  await page.route("**/api/talos/applications/app-atl-test/atlassian", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Not found" }),
      });
    }
    return route.continue();
  });

  await page.goto("/talos/setup");

  // Step 1: Register App
  await page.getByPlaceholder("Application name").fill("Atlassian Test App");
  await page.getByRole("button", { name: "Create Application" }).click();

  // Step 2: Data Sources — skip it
  await expect(page.getByRole("heading", { name: "Data Sources" })).toBeVisible();
  await page.getByRole("button", { name: "Skip" }).click();

  // Now on Step 3: Atlassian
  await expect(page.getByRole("heading", { name: "Atlassian" })).toBeVisible();
}

// ── Atlassian Wizard Step (#337) ────────────────────────────────────────────

test.describe("Atlassian Wizard Step (#337)", () => {
  let atl: AtlassianWizardPage;

  test.beforeEach(async ({ page }) => {
    atl = new AtlassianWizardPage(page);
    await navigateToAtlassianStep(page);
  });

  // ── Step Visibility ───────────────────────────────────────────────────────

  test.describe("Step Visibility", () => {
    // AC #337: "Atlassian" step visible in wizard after Data Sources
    test("should display Atlassian step heading and description", async () => {
      await expect(atl.stepHeading).toBeVisible();
      await expect(atl.stepDescription).toBeVisible();
    });

    // AC #337: Instructional text about Jira/Confluence integration
    test("should display instructional text about the integration", async () => {
      await expect(atl.page.getByText("Connect to Jira and Confluence")).toBeVisible();
    });
  });

  // ── Deployment Type Toggle ────────────────────────────────────────────────

  test.describe("Deployment Type Toggle", () => {
    // AC #337: Cloud and Data Center toggle buttons are visible
    test("should display Cloud and Data Center toggle buttons", async () => {
      await expect(atl.cloudButton).toBeVisible();
      await expect(atl.dataCenterButton).toBeVisible();
    });

    // AC #337: Cloud is the default deployment type
    test("should default to Cloud deployment type", async () => {
      // Cloud button should have the 'default' variant (non-outline styling)
      // We verify by checking that Cloud-specific fields are shown
      await expect(atl.jiraUsernameInput).toBeVisible();
      await expect(atl.jiraApiTokenInput).toBeVisible();
    });

    // AC #337: Switching to Data Center shows personal access token field
    test("should show personal token field when Data Center is selected", async () => {
      await atl.selectDataCenter();
      await expect(atl.jiraPersonalTokenInput).toBeVisible();
      // Cloud-specific fields should be hidden
      await expect(atl.jiraUsernameInput).not.toBeVisible();
      await expect(atl.jiraApiTokenInput).not.toBeVisible();
    });

    // AC #337: Switching back to Cloud restores username + API token fields
    test("should restore Cloud fields when switching back from Data Center", async () => {
      await atl.selectDataCenter();
      await expect(atl.jiraPersonalTokenInput).toBeVisible();

      await atl.selectCloud();
      await expect(atl.jiraUsernameInput).toBeVisible();
      await expect(atl.jiraApiTokenInput).toBeVisible();
      await expect(atl.jiraPersonalTokenInput).not.toBeVisible();
    });
  });

  // ── Jira Fields ───────────────────────────────────────────────────────────

  test.describe("Jira Fields (Cloud Mode)", () => {
    // AC #337: Jira URL field is present and fillable
    test("should display and accept Jira URL", async () => {
      await atl.jiraUrlInput.fill("https://acme.atlassian.net");
      await expect(atl.jiraUrlInput).toHaveValue("https://acme.atlassian.net");
    });

    // AC #337: Jira Project Key field is present
    test("should display and accept Project Key", async () => {
      await atl.jiraProjectKeyInput.fill("PROJ");
      await expect(atl.jiraProjectKeyInput).toHaveValue("PROJ");
    });

    // AC #337: Cloud mode shows Username + API Token vault refs for Jira
    test("should display username and API token fields in Cloud mode", async () => {
      await expect(atl.jiraUsernameInput).toBeVisible();
      await expect(atl.jiraApiTokenInput).toBeVisible();
    });

    // AC #337: SSL Verify checkbox is present for Jira
    test("should display SSL Verify checkbox for Jira", async () => {
      await expect(atl.jiraSslCheckbox).toBeVisible();
    });
  });

  test.describe("Jira Fields (Data Center Mode)", () => {
    test.beforeEach(async () => {
      await atl.selectDataCenter();
    });

    // AC #337: Data Center mode shows personal access token vault ref for Jira
    test("should display personal access token field in Data Center mode", async () => {
      await expect(atl.jiraPersonalTokenInput).toBeVisible();
    });

    // AC #337: URL and Project Key still visible in Data Center mode
    test("should still show Jira URL and Project Key in Data Center mode", async () => {
      await expect(atl.jiraUrlInput).toBeVisible();
      await expect(atl.jiraProjectKeyInput).toBeVisible();
    });
  });

  // ── Confluence Fields ─────────────────────────────────────────────────────

  test.describe("Confluence Fields (Cloud Mode)", () => {
    // AC #337: Confluence URL field
    test("should display and accept Confluence URL", async () => {
      await atl.confluenceUrlInput.fill("https://acme.atlassian.net/wiki");
      await expect(atl.confluenceUrlInput).toHaveValue("https://acme.atlassian.net/wiki");
    });

    // AC #337: Confluence Space Keys (comma-separated)
    test("should display and accept Space Keys input", async () => {
      await atl.confluenceSpaceKeysInput.fill("DEV, QA, PROD");
      await expect(atl.confluenceSpaceKeysInput).toHaveValue("DEV, QA, PROD");
    });

    // AC #337: Cloud mode shows Username + API Token vault refs for Confluence
    test("should display username and API token fields for Confluence in Cloud mode", async () => {
      await expect(atl.confluenceUsernameInput).toBeVisible();
      await expect(atl.confluenceApiTokenInput).toBeVisible();
    });

    // AC #337: SSL Verify checkbox for Confluence
    test("should display SSL Verify checkbox for Confluence", async () => {
      await expect(atl.confluenceSslCheckbox).toBeVisible();
    });
  });

  test.describe("Confluence Fields (Data Center Mode)", () => {
    test.beforeEach(async () => {
      await atl.selectDataCenter();
    });

    // AC #337: Data Center shows personal token for Confluence
    test("should display personal access token field for Confluence in Data Center mode", async () => {
      await expect(atl.confluencePersonalTokenInput).toBeVisible();
    });
  });

  // ── Test Connection ───────────────────────────────────────────────────────

  test.describe("Test Connection", () => {
    // AC #337: Test Connection button is present
    test("should display Test Connection button", async () => {
      await expect(atl.testConnectionButton).toBeVisible();
    });

    // AC #337: Test Connection disabled when Jira URL is empty
    test("should disable Test Connection when Jira URL is empty", async () => {
      await expect(atl.testConnectionButton).toBeDisabled();
    });

    // AC #337: Test Connection enabled when Jira URL is filled
    test("should enable Test Connection after filling Jira URL", async () => {
      await atl.jiraUrlInput.fill("https://acme.atlassian.net");
      await expect(atl.testConnectionButton).toBeEnabled();
    });

    // AC #337: Test Connection shows success feedback
    test("should show success feedback after successful connection test", async ({ page }) => {
      await test.step("Mock successful connection test", async () => {
        await page.route("**/api/talos/applications/app-atl-test/atlassian/test", (route) =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ success: true, message: "Connected successfully" }),
          })
        );
      });

      await test.step("Fill Jira URL and test", async () => {
        await atl.jiraUrlInput.fill("https://acme.atlassian.net");
        await atl.testConnectionButton.click();
      });

      await test.step("Verify success message", async () => {
        await expect(page.getByText("Connected successfully")).toBeVisible();
      });
    });

    // AC #337: Test Connection shows failure feedback
    test("should show failure feedback after failed connection test", async ({ page }) => {
      await test.step("Mock failed connection test", async () => {
        await page.route("**/api/talos/applications/app-atl-test/atlassian/test", (route) =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ success: false, message: "Connection refused" }),
          })
        );
      });

      await test.step("Fill Jira URL and test", async () => {
        await atl.jiraUrlInput.fill("https://bad-host.example.com");
        await atl.testConnectionButton.click();
      });

      await test.step("Verify failure message", async () => {
        await expect(page.getByText("Connection refused")).toBeVisible();
      });
    });
  });

  // ── Skip Behavior ─────────────────────────────────────────────────────────

  test.describe("Skip Behavior", () => {
    // AC #337: Atlassian is optional — user can skip
    test("should display Skip button", async () => {
      await expect(atl.skipButton).toBeVisible();
    });

    // AC #337: Clicking Skip advances to Upload Docs step
    test("should advance to Upload Docs step when Skip is clicked", async () => {
      await atl.skipButton.click();
      await expect(atl.page.getByRole("heading", { name: "Upload Docs" })).toBeVisible();
    });
  });

  // ── Save & Continue ───────────────────────────────────────────────────────

  test.describe("Save & Continue", () => {
    // AC #337: Saving Atlassian config sends POST and advances wizard
    test("should save Atlassian config and advance to next step", async ({ page }) => {
      let savedPayload: Record<string, unknown> = {};

      await test.step("Mock Atlassian save API", async () => {
        await page.route("**/api/talos/applications/app-atl-test/atlassian", (route) => {
          if (route.request().method() === "POST") {
            savedPayload = route.request().postDataJSON();
            return route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({ id: "atl-1", ...savedPayload }),
            });
          }
          return route.continue();
        });
      });

      await test.step("Fill Jira and Confluence fields", async () => {
        await atl.jiraUrlInput.fill("https://acme.atlassian.net");
        await atl.jiraProjectKeyInput.fill("TALOS");
        await atl.jiraUsernameInput.fill("vault:jira-user");
        await atl.jiraApiTokenInput.fill("vault:jira-token");
        await atl.confluenceUrlInput.fill("https://acme.atlassian.net/wiki");
        await atl.confluenceSpaceKeysInput.fill("DEV, QA");
      });

      await test.step("Save and verify", async () => {
        await atl.saveAndContinueButton.click();
        await expect(page.getByRole("heading", { name: "Upload Docs" })).toBeVisible();
        expect(savedPayload).toMatchObject({
          deploymentType: "cloud",
          jiraUrl: "https://acme.atlassian.net",
          jiraProject: "TALOS",
        });
      });
    });

    // AC #337: Data Center mode sends correct deployment type
    test("should send datacenter deployment type when Data Center is selected", async ({ page }) => {
      let savedPayload: Record<string, unknown> = {};

      await test.step("Mock Atlassian save API", async () => {
        await page.route("**/api/talos/applications/app-atl-test/atlassian", (route) => {
          if (route.request().method() === "POST") {
            savedPayload = route.request().postDataJSON();
            return route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({ id: "atl-dc-1", ...savedPayload }),
            });
          }
          return route.continue();
        });
      });

      await test.step("Switch to Data Center and fill fields", async () => {
        await atl.selectDataCenter();
        await atl.jiraUrlInput.fill("https://jira.internal.corp.com");
        await atl.jiraProjectKeyInput.fill("INT");
        await atl.jiraPersonalTokenInput.fill("vault:jira-pat");
      });

      await test.step("Save and verify datacenter type", async () => {
        await atl.saveAndContinueButton.click();
        await expect(page.getByRole("heading", { name: "Upload Docs" })).toBeVisible();
        expect(savedPayload).toMatchObject({
          deploymentType: "datacenter",
          jiraUrl: "https://jira.internal.corp.com",
          jiraProject: "INT",
          jiraPersonalTokenVaultRef: "vault:jira-pat",
        });
      });
    });
  });
});

// ── #430: Atlassian Import Data into RAG ──────────────────────────────────────

test.describe("Atlassian Import Data (#430)", () => {
  let atl: AtlassianWizardPage;

  test.beforeEach(async ({ page }) => {
    atl = new AtlassianWizardPage(page);
    await navigateToAtlassianStep(page);
  });

  // ── Import Button Visibility ──────────────────────────────────────────────

  test.describe("Import Button State", () => {
    // AC #430: "Import Data" button appears in Step 2
    test("should display the Import Data button", async () => {
      await expect(atl.importDataButton).toBeVisible();
    });

    // AC #430: Import Data disabled until Jira/Confluence config provided
    test("should disable Import Data when no Jira or Confluence URL is set", async () => {
      await expect(atl.importDataButton).toBeDisabled();
    });

    // AC #430: Import Data enabled when Jira URL is provided
    test("should enable Import Data after filling Jira URL", async () => {
      await atl.jiraUrlInput.fill("https://acme.atlassian.net");
      await expect(atl.importDataButton).toBeEnabled();
    });

    // AC #430: Import Data enabled when only Confluence URL is provided
    test("should enable Import Data after filling only Confluence URL", async () => {
      await atl.confluenceUrlInput.fill("https://acme.atlassian.net/wiki");
      await expect(atl.importDataButton).toBeEnabled();
    });
  });

  // ── Successful Import ─────────────────────────────────────────────────────

  test.describe("Successful Import", () => {
    // AC #430: Imported items are displayed after completion
    // AC #430: Number of imported items shown after completion
    test("should show import results with imported items and chunk count on success", async ({ page }) => {
      await test.step("Mock Atlassian save and import APIs", async () => {
        await page.route("**/api/talos/applications/app-atl-test/atlassian", (route) => {
          if (route.request().method() === "POST") {
            return route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({ id: "atl-cfg-1" }),
            });
          }
          return route.continue();
        });

        await page.route("**/api/talos/applications/app-atl-test/atlassian/import", (route) =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              success: true,
              imported: [
                { source: "Jira", title: "PROJ-101: Login flow", type: "issue" },
                { source: "Jira", title: "PROJ-102: Dashboard", type: "issue" },
                { source: "Confluence", title: "Architecture Overview", type: "page" },
              ],
              totalChunks: 47,
              errors: [],
            }),
          })
        );
      });

      await test.step("Fill Jira URL and trigger import", async () => {
        await atl.jiraUrlInput.fill("https://acme.atlassian.net");
        await atl.jiraProjectKeyInput.fill("PROJ");
        await atl.importDataButton.click();
      });

      await test.step("Verify import results", async () => {
        await expect(page.getByText("PROJ-101: Login flow")).toBeVisible();
        await expect(page.getByText("PROJ-102: Dashboard")).toBeVisible();
        await expect(page.getByText("Architecture Overview")).toBeVisible();
        await expect(page.getByText("47 chunks indexed into RAG")).toBeVisible();
      });
    });
  });

  // ── Import Error Handling ─────────────────────────────────────────────────

  test.describe("Import Error Handling", () => {
    // AC #430: Errors during import are shown to the user
    test("should show error message when import fails", async ({ page }) => {
      await test.step("Mock Atlassian save (success) and import (failure)", async () => {
        await page.route("**/api/talos/applications/app-atl-test/atlassian", (route) => {
          if (route.request().method() === "POST") {
            return route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({ id: "atl-cfg-2" }),
            });
          }
          return route.continue();
        });

        await page.route("**/api/talos/applications/app-atl-test/atlassian/import", (route) =>
          route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ error: "Internal server error" }),
          })
        );
      });

      await test.step("Fill Jira URL and trigger import", async () => {
        await atl.jiraUrlInput.fill("https://acme.atlassian.net");
        await atl.importDataButton.click();
      });

      await test.step("Verify error is displayed", async () => {
        await expect(page.getByText("Import failed")).toBeVisible();
      });
    });

    // AC #430: Partial errors shown alongside successful imports
    test("should show partial errors alongside successfully imported items", async ({ page }) => {
      await test.step("Mock Atlassian save and import with partial errors", async () => {
        await page.route("**/api/talos/applications/app-atl-test/atlassian", (route) => {
          if (route.request().method() === "POST") {
            return route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({ id: "atl-cfg-3" }),
            });
          }
          return route.continue();
        });

        await page.route("**/api/talos/applications/app-atl-test/atlassian/import", (route) =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              success: false,
              imported: [{ source: "Jira", title: "PROJ-200: Search API", type: "issue" }],
              totalChunks: 12,
              errors: ["Failed to fetch Confluence page: timeout after 30s"],
            }),
          })
        );
      });

      await test.step("Fill URLs and trigger import", async () => {
        await atl.jiraUrlInput.fill("https://acme.atlassian.net");
        await atl.confluenceUrlInput.fill("https://acme.atlassian.net/wiki");
        await atl.importDataButton.click();
      });

      await test.step("Verify partial success and errors", async () => {
        await expect(page.getByText("PROJ-200: Search API")).toBeVisible();
        await expect(page.getByText("12 chunks indexed into RAG")).toBeVisible();
        await expect(page.getByText(/Failed to fetch Confluence page/)).toBeVisible();
      });
    });
  });

  // ── Import Loading State ──────────────────────────────────────────────────

  test.describe("Import Loading State", () => {
    // AC #430: UI shows a progress indicator during import
    test("should disable Import Data button while import is in progress", async ({ page }) => {
      let resolveImport: (() => void) | null = null;
      const importHold = new Promise<void>((resolve) => {
        resolveImport = resolve;
      });

      await test.step("Mock save (instant) and import (held)", async () => {
        await page.route("**/api/talos/applications/app-atl-test/atlassian", (route) => {
          if (route.request().method() === "POST") {
            return route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({ id: "atl-cfg-4" }),
            });
          }
          return route.continue();
        });

        await page.route("**/api/talos/applications/app-atl-test/atlassian/import", async (route) => {
          await importHold;
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ success: true, imported: [], totalChunks: 0, errors: [] }),
          });
        });
      });

      await test.step("Fill URL and start import", async () => {
        await atl.jiraUrlInput.fill("https://acme.atlassian.net");
        await atl.importDataButton.click();
      });

      await test.step("Verify button is disabled during import", async () => {
        await expect(atl.importDataButton).toBeDisabled();
      });

      // Clean up: release held request
      resolveImport!();
    });
  });
});
