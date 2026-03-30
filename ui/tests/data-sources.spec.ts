/**
 * E2E tests for Data Sources wizard step.
 *
 * After #428 (Epic #426), the Data Sources step shows a "Coming Soon" badge
 * and all JDBC form fields are disabled. The step can be skipped to continue
 * the wizard flow.
 *
 * Covers:
 *   #428 – Mark Data Sources as "Coming Soon"
 *   #336 – Original step visibility (retained tests still valid)
 */

import { test, expect } from "@playwright/test";
import { DataSourcesPage } from "./pages/data-sources.page";

// ── Helper: Navigate to Data Sources wizard step ────────────────────────────

async function navigateToDataSourcesStep(page: import("@playwright/test").Page) {
  // Mock the applications API so registering an app works
  await page.route("**/api/talos/applications", (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "app-ds-test",
          name: "DS Test App",
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

  // Mock data sources GET (empty initially)
  await page.route("**/api/talos/applications/app-ds-test/data-sources", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    }
    return route.continue();
  });

  await page.goto("/talos/setup");

  // Fill and submit Register App step to advance to Data Sources
  await page.getByPlaceholder("Application name").fill("DS Test App");
  await page.getByRole("button", { name: "Create Application" }).click();

  // Wait for the Data Sources step heading to appear
  await expect(page.getByRole("heading", { name: "Data Sources" })).toBeVisible();
}

// ── Data Sources — Coming Soon (#428, supersedes #336) ──────────────────────

test.describe("Data Sources Coming Soon (#428)", () => {
  let ds: DataSourcesPage;

  test.beforeEach(async ({ page }) => {
    ds = new DataSourcesPage(page);
    await navigateToDataSourcesStep(page);
  });

  // ── Step Visibility ───────────────────────────────────────────────────────

  test.describe("Step Visibility", () => {
    // AC #428: Step 3 UI header shows "Data Sources" heading
    test("should display Data Sources step heading", async () => {
      await expect(ds.stepHeading).toBeVisible();
    });

    // AC #428: Step 3 UI shows "Coming Soon" badge
    test('should display a "Coming Soon" badge', async () => {
      await expect(ds.comingSoonBadge).toBeVisible();
    });

    // AC #428: Brief explanation shown about JDBC not being available yet
    test("should display explanatory text that JDBC is not yet available", async () => {
      await expect(ds.comingSoonExplanation).toBeVisible();
    });
  });

  // ── Form Fields Disabled ──────────────────────────────────────────────────

  test.describe("Disabled Form Fields", () => {
    // AC #428: The step is visually de-emphasized — form fields disabled
    test("should render Label input as disabled", async () => {
      await expect(ds.labelInput).toBeDisabled();
    });

    test("should render JDBC URL input as disabled", async () => {
      await expect(ds.jdbcUrlInput).toBeDisabled();
    });

    test("should render Username vault ref input as disabled", async () => {
      await expect(ds.usernameVaultRefInput).toBeDisabled();
    });

    test("should render Password vault ref input as disabled", async () => {
      await expect(ds.passwordVaultRefInput).toBeDisabled();
    });

    test("should render Driver Type select as disabled", async () => {
      await expect(ds.driverTypeSelect).toBeDisabled();
    });
  });

  // ── Skip / Continue Navigation ────────────────────────────────────────────

  test.describe("Skip Navigation", () => {
    // AC #428: Continue button should still work to advance past this step
    test('should display "Skip — Continue to Next Step" button', async () => {
      await expect(ds.skipContinueButton).toBeVisible();
    });

    test("should advance to the Atlassian step when skip-continue is clicked", async () => {
      await ds.skipContinueButton.click();
      await expect(ds.page.getByRole("heading", { name: "Atlassian" })).toBeVisible();
    });
  });
});
