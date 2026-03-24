import { test, expect } from "@playwright/test";
import { NavBarPage } from "./pages/nav-bar.page";

// Routes (/ redirects server-side to /talos; all others are direct pages)
const ROUTES = ["/", "/talos", "/chat", "/admin", "/library", "/skills", "/workbench"] as const;

test.describe("NavBar – Issue #261 (NavBar with dropdown groups and ModeToggle)", () => {
  // ── AC: NavBar renders on all pages ─────────────────────────────────────────
  // Each main route must have a visible sticky navbar with brand and theme toggle.

  for (const route of ROUTES) {
    test(`should display sticky navbar on ${route}`, async ({ page }) => {
      const navbar = new NavBarPage(page);
      await navbar.goto(route);

      await test.step("Verify nav element is visible", async () => {
        await expect(navbar.nav).toBeVisible();
      });

      await test.step("Verify brand link is present", async () => {
        await expect(navbar.brandLink).toBeVisible();
      });

      await test.step("Verify ModeToggle button is present", async () => {
        await expect(navbar.modeToggleButton).toBeVisible();
      });
    });
  }

  // ── AC: ModeToggle toggles dark/light mode ───────────────────────────────────
  // Clicking the theme toggle on the NavBar switches the color scheme via next-themes.
  // next-themes adds/removes the "dark" class on the <html> element.

  test.describe("ModeToggle – Issue #261", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/talos");
    });

    test("should switch to dark mode when Dark is selected from ModeToggle", async ({ page }) => {
      const navbar = new NavBarPage(page);

      await test.step("Open theme dropdown and select Dark", async () => {
        await navbar.modeToggleButton.click();
        await page.getByRole("menuitem", { name: "Dark" }).click();
      });

      await test.step("Verify the dark class is applied to <html>", async () => {
        await expect(page.locator("html")).toHaveClass(/dark/);
      });
    });

    test("should switch to light mode when Light is selected from ModeToggle", async ({ page }) => {
      const navbar = new NavBarPage(page);

      await test.step("First set to dark so there is a visible state change", async () => {
        await navbar.modeToggleButton.click();
        await page.getByRole("menuitem", { name: "Dark" }).click();
        await expect(page.locator("html")).toHaveClass(/dark/);
      });

      await test.step("Switch to light and verify dark class is removed", async () => {
        await navbar.modeToggleButton.click();
        await page.getByRole("menuitem", { name: "Light" }).click();
        await expect(page.locator("html")).not.toHaveClass(/dark/);
      });
    });
  });

  // ── AC: Nav dropdown groups work ─────────────────────────────────────────────
  // Each dropdown trigger opens a Radix DropdownMenuContent with the sub-links
  // defined in NAV_GROUPS inside nav-bar.tsx.

  test.describe("Nav Dropdown Groups – Issue #261", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/talos");
    });

    // AC: Testing dropdown opens with its sub-links visible
    test("Testing dropdown opens and shows sub-navigation links", async ({ page }) => {
      const navbar = new NavBarPage(page);

      await test.step("Click the Testing dropdown trigger", async () => {
        await navbar.testingDropdownTrigger.click();
      });

      await test.step("Verify Testing sub-links are rendered in the menu", async () => {
        await expect(navbar.getDropdownItem("Test Library")).toBeVisible();
        await expect(navbar.getDropdownItem("Vault Roles")).toBeVisible();
        await expect(navbar.getDropdownItem("Artifacts")).toBeVisible();
      });
    });

    // AC: Automation dropdown opens with its sub-links visible
    test("Automation dropdown opens and shows sub-navigation links", async ({ page }) => {
      const navbar = new NavBarPage(page);

      await test.step("Click the Automation dropdown trigger", async () => {
        await navbar.automationDropdownTrigger.click();
      });

      await test.step("Verify Automation sub-links are rendered in the menu", async () => {
        await expect(navbar.getDropdownItem("Prompts")).toBeVisible();
        await expect(navbar.getDropdownItem("Skills")).toBeVisible();
        await expect(navbar.getDropdownItem("Agents")).toBeVisible();
        await expect(navbar.getDropdownItem("Scheduler")).toBeVisible();
        await expect(navbar.getDropdownItem("Tasks")).toBeVisible();
      });
    });

    // AC: Admin dropdown opens with its sub-links visible
    test("Admin dropdown opens and shows Settings link", async ({ page }) => {
      const navbar = new NavBarPage(page);

      await test.step("Click the Admin dropdown trigger", async () => {
        await navbar.adminDropdownTrigger.click();
      });

      await test.step("Verify Admin sub-link (Settings → /admin) is visible", async () => {
        await expect(navbar.getDropdownItem("Settings")).toBeVisible();
      });
    });
  });
});
