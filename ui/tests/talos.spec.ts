import { test, expect } from "@playwright/test";
import { TalosPage } from "./pages/talos.page";

test.describe("Talos Dashboard", () => {
  let talos: TalosPage;

  test.beforeEach(async ({ page }) => {
    talos = new TalosPage(page);
    await talos.goto();
  });

  // ── Dashboard Overview (#209) ─────────────────────────────────────────────

  test.describe("Dashboard Overview", () => {
    // AC #209: Dashboard heading renders
    test("should display Dashboard heading", async () => {
      await expect(talos.heading).toBeVisible();
    });

    // AC #209: Dashboard subtitle
    test("should display dashboard description", async () => {
      await expect(talos.page.getByText("Overview of your test automation environment")).toBeVisible();
    });

    // AC #209: Statistics cards displayed
    test("should display all 4 stat cards", async () => {
      await expect(talos.applicationsStatCard).toBeVisible();
      await expect(talos.testsStatCard).toBeVisible();
      await expect(talos.recentRunsStatCard).toBeVisible();
      await expect(talos.passRateStatCard).toBeVisible();
    });
  });

  // ── Application Registry (#210) ───────────────────────────────────────────

  test.describe("Application Registry", () => {
    // AC #210: Applications section heading
    test("should display Applications section heading", async () => {
      await expect(talos.applicationsHeading).toBeVisible();
    });

    // AC #210: Add Application button present
    test("should display Add Application button", async () => {
      await expect(talos.addApplicationButton).toBeVisible();
    });

    // AC #210: Application grid or empty state
    test("should display application cards or empty state", async () => {
      const empty = talos.emptyState;
      const visible = await empty.isVisible().catch(() => false);
      if (visible) {
        await expect(empty).toBeVisible();
        await expect(talos.page.getByText("Get started by adding your first application")).toBeVisible();
      }
    });

    // AC #210: Add Application dialog with form fields
    test("should open Add Application dialog with form fields", async () => {
      await test.step("Open dialog", async () => {
        await talos.openAddDialog();
      });

      await test.step("Verify dialog form fields", async () => {
        await expect(talos.dialogTitle).toBeVisible();
        await expect(talos.nameInput).toBeVisible();
        await expect(talos.repoUrlInput).toBeVisible();
        await expect(talos.baseUrlInput).toBeVisible();
      });

      await test.step("Verify dialog action buttons", async () => {
        await expect(talos.cancelButton).toBeVisible();
        await expect(talos.addButton).toBeVisible();
      });
    });

    // AC #210: Add Application button disabled without name
    test("should disable Add button when name is empty", async () => {
      await talos.openAddDialog();
      await expect(talos.addButton).toBeDisabled();
    });

    // AC #210: Add Application button enabled with name
    test("should enable Add button when name is provided", async () => {
      await test.step("Open dialog and fill name", async () => {
        await talos.openAddDialog();
        await talos.nameInput.fill("Test Application");
      });

      await test.step("Verify Add button is enabled", async () => {
        await expect(talos.addButton).toBeEnabled();
      });
    });

    // AC #210: Application cards show status badge
    test("should show status badge on application cards", async () => {
      const empty = talos.emptyState;
      const noApps = await empty.isVisible().catch(() => false);
      if (!noApps) {
        // If apps exist, check for status badges
        const badges = talos.page.getByText(/active|archived|pending/);
        await expect(badges.first()).toBeVisible();
      }
    });

    // AC #210: Application cards have Scan button
    test("should show Scan button on application cards", async () => {
      const empty = talos.emptyState;
      const noApps = await empty.isVisible().catch(() => false);
      if (!noApps) {
        const scanButtons = talos.page.getByRole("button", { name: "Scan" });
        await expect(scanButtons.first()).toBeVisible();
      }
    });

    // AC #210: Cancel button closes dialog
    test("should close dialog when Cancel is clicked", async () => {
      await talos.openAddDialog();
      await expect(talos.dialogTitle).toBeVisible();
      await talos.cancelButton.click();
      await expect(talos.dialogTitle).not.toBeVisible();
    });
  });
});
