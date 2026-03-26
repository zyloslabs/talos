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

// ── Data Sources Wizard Step (#336) ─────────────────────────────────────────

test.describe("Data Sources Wizard Step (#336)", () => {
  let ds: DataSourcesPage;

  test.beforeEach(async ({ page }) => {
    ds = new DataSourcesPage(page);
    await navigateToDataSourcesStep(page);
  });

  // ── Step Visibility ───────────────────────────────────────────────────────

  test.describe("Step Visibility", () => {
    // AC #336: "Data Sources" step is visible in the setup wizard between Register App and Upload Docs
    test("should display Data Sources step heading and description", async () => {
      await expect(ds.stepHeading).toBeVisible();
      await expect(ds.stepDescription).toBeVisible();
    });

    // AC #336: Instructional text about JDBC data sources
    test("should display instructional text about JDBC data sources", async () => {
      await expect(ds.page.getByText("Add JDBC database data sources")).toBeVisible();
    });
  });

  // ── Default Form State ────────────────────────────────────────────────────

  test.describe("Default Form", () => {
    // AC #336: One empty draft data source form is shown by default
    test("should display one empty data source draft by default", async () => {
      await expect(ds.getDraftLabel(1)).toBeVisible();
      await expect(ds.labelInput).toBeVisible();
      await expect(ds.labelInput).toHaveValue("");
    });

    // AC #336: Driver type, JDBC URL, vault ref fields are present
    test("should display all form fields for the data source draft", async () => {
      await expect(ds.labelInput).toBeVisible();
      await expect(ds.jdbcUrlInput).toBeVisible();
      await expect(ds.usernameVaultRefInput).toBeVisible();
      await expect(ds.passwordVaultRefInput).toBeVisible();
    });

    // AC #336: Driver type defaults to PostgreSQL
    test("should default driver type to PostgreSQL", async () => {
      await expect(ds.driverTypeSelect).toHaveValue("postgresql");
    });

    // AC #336: Driver type dropdown has Oracle and PostgreSQL options (plus others)
    test("should offer multiple driver type options", async () => {
      await expect(ds.driverTypeSelect.locator("option")).toHaveCount(6);
      await expect(ds.driverTypeSelect).toContainText("PostgreSQL");
      await expect(ds.driverTypeSelect).toContainText("Oracle");
    });
  });

  // ── Form Interaction ──────────────────────────────────────────────────────

  test.describe("Form Interaction", () => {
    // AC #336: User can fill label, driver type, JDBC URL, and vault refs
    test("should accept values in all data source fields", async () => {
      await test.step("Fill all fields", async () => {
        await ds.fillDraft(0, {
          label: "Production Oracle",
          driverType: "oracle",
          jdbcUrl: "jdbc:oracle:thin:@host:1521:orcl",
          usernameVaultRef: "vault:ora-user",
          passwordVaultRef: "vault:ora-pass",
        });
      });

      await test.step("Verify values are set", async () => {
        await expect(ds.labelInput).toHaveValue("Production Oracle");
        await expect(ds.driverTypeSelect).toHaveValue("oracle");
        await expect(ds.jdbcUrlInput).toHaveValue("jdbc:oracle:thin:@host:1521:orcl");
        await expect(ds.usernameVaultRefInput).toHaveValue("vault:ora-user");
        await expect(ds.passwordVaultRefInput).toHaveValue("vault:ora-pass");
      });
    });

    // AC #336: User can change driver type via dropdown
    test("should allow selecting different driver types", async () => {
      await ds.driverTypeSelect.selectOption("mysql");
      await expect(ds.driverTypeSelect).toHaveValue("mysql");

      await ds.driverTypeSelect.selectOption("sqlserver");
      await expect(ds.driverTypeSelect).toHaveValue("sqlserver");
    });
  });

  // ── Multiple Data Sources ─────────────────────────────────────────────────

  test.describe("Multiple Data Sources", () => {
    // AC #336: User can add multiple data sources
    test("should add a second data source draft when Add Data Source is clicked", async () => {
      await ds.addDataSourceButton.click();
      await expect(ds.getDraftLabel(2)).toBeVisible();
      await expect(ds.getLabelInput(1)).toBeVisible();
    });

    // AC #336: Each draft is independently editable
    test("should allow filling multiple drafts independently", async () => {
      await test.step("Fill first draft", async () => {
        await ds.fillDraft(0, { label: "Primary DB", jdbcUrl: "jdbc:postgresql://host1:5432/db1" });
      });

      await test.step("Add and fill second draft", async () => {
        await ds.addDataSourceButton.click();
        await ds.fillDraft(1, { label: "Secondary DB", driverType: "oracle", jdbcUrl: "jdbc:oracle:thin:@host2:1521:db2" });
      });

      await test.step("Verify both drafts retain values", async () => {
        await expect(ds.getLabelInput(0)).toHaveValue("Primary DB");
        await expect(ds.getLabelInput(1)).toHaveValue("Secondary DB");
      });
    });

    // AC #336: User can remove a data source (when more than one exists)
    test("should remove a data source draft when trash button is clicked", async () => {
      await test.step("Add a second draft", async () => {
        await ds.addDataSourceButton.click();
        await expect(ds.getDraftLabel(2)).toBeVisible();
      });

      await test.step("Remove the first draft", async () => {
        await ds.getRemoveButton(0).click();
      });

      await test.step("Verify only one draft remains", async () => {
        await expect(ds.getDraftLabel(2)).not.toBeVisible();
      });
    });

    // AC #336: Remove button not shown when only one draft exists
    test("should not show remove button when there is only one draft", async () => {
      // The trash/remove button should not exist for a single draft
      const removeButtons = ds.page.getByText("Data Source 1").locator("..").getByRole("button");
      await expect(removeButtons).toHaveCount(0);
    });
  });

  // ── Form Validation ───────────────────────────────────────────────────────

  test.describe("Form Validation", () => {
    // AC #336: Save & Continue disabled when label and JDBC URL are empty
    test("should disable Save & Continue when no valid draft exists", async () => {
      await expect(ds.saveAndContinueButton).toBeDisabled();
    });

    // AC #336: Save & Continue enabled when at least one draft has label + JDBC URL
    test("should enable Save & Continue when label and JDBC URL are filled", async () => {
      await ds.labelInput.fill("Test DB");
      await ds.jdbcUrlInput.fill("jdbc:postgresql://localhost:5432/test");
      await expect(ds.saveAndContinueButton).toBeEnabled();
    });

    // AC #336: Save & Continue disabled when label filled but JDBC URL is empty
    test("should keep Save & Continue disabled when only label is provided", async () => {
      await ds.labelInput.fill("DB Without URL");
      await expect(ds.saveAndContinueButton).toBeDisabled();
    });
  });

  // ── Skip Behavior ─────────────────────────────────────────────────────────

  test.describe("Skip Behavior", () => {
    // AC #336: Data sources are optional — user can skip this step
    test("should display Skip button to bypass data sources", async () => {
      await expect(ds.skipButton).toBeVisible();
    });

    // AC #336: Clicking Skip advances to the next step (Atlassian)
    test("should advance to Atlassian step when Skip is clicked", async () => {
      await ds.skipButton.click();
      await expect(ds.page.getByRole("heading", { name: "Atlassian" })).toBeVisible();
    });
  });

  // ── Save & Continue ───────────────────────────────────────────────────────

  test.describe("Save & Continue", () => {
    // AC #336: Saving data sources sends POST to API and advances wizard
    test("should create data sources and advance to next step", async ({ page }) => {
      const createPayloads: Record<string, unknown>[] = [];

      await test.step("Mock data source creation API", async () => {
        // Unroute the beforeEach GET mock and replace with a handler for both GET and POST
        await page.unroute("**/api/talos/applications/app-ds-test/data-sources");
        await page.route("**/api/talos/applications/app-ds-test/data-sources", (route) => {
          if (route.request().method() === "POST") {
            const payload = route.request().postDataJSON();
            createPayloads.push(payload);
            return route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({
                id: `ds-${createPayloads.length}`,
                label: payload.label,
                driverType: payload.driverType,
                jdbcUrl: payload.jdbcUrl,
                isActive: true,
              }),
            });
          }
          // GET returns empty
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify([]),
          });
        });
      });

      await test.step("Fill draft and save", async () => {
        await ds.fillDraft(0, {
          label: "CI Database",
          driverType: "postgresql",
          jdbcUrl: "jdbc:postgresql://ci-host:5432/ci_db",
          usernameVaultRef: "vault:ci-user",
          passwordVaultRef: "vault:ci-pass",
        });
        await ds.saveAndContinueButton.click();
      });

      await test.step("Verify API was called and wizard advanced", async () => {
        // Wait for Atlassian step to appear (next step)
        await expect(page.getByRole("heading", { name: "Atlassian" })).toBeVisible({ timeout: 10000 });
        expect(createPayloads.length).toBeGreaterThanOrEqual(1);
        expect(createPayloads[0]).toMatchObject({
          label: "CI Database",
          driverType: "postgresql",
          jdbcUrl: "jdbc:postgresql://ci-host:5432/ci_db",
        });
      });
    });
  });
});
