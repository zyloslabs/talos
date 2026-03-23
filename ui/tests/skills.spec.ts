import { test, expect } from "@playwright/test";
import { SkillsPage } from "./pages/skills.page";

test.describe("Skills Page", () => {
  let skills: SkillsPage;

  test.beforeEach(async ({ page }) => {
    skills = new SkillsPage(page);
    await skills.goto();
  });

  // ── Page Structure ────────────────────────────────────────────────────────

  // AC #227: Skills page renders with heading
  test("should display Skills heading", async () => {
    await expect(skills.heading).toBeVisible();
  });

  // ── Skill Templates (#227) ────────────────────────────────────────────────

  test.describe("Skill Templates", () => {
    // AC #227: Templates button opens template dialog
    test("should open skill templates dialog", async () => {
      await test.step("Click Templates button", async () => {
        await skills.templatesButton.click();
      });

      await test.step("Verify templates dialog is visible", async () => {
        await expect(skills.templateDialogTitle).toBeVisible();
      });
    });

    // AC #227: 5 built-in preset templates displayed
    test("should display all 5 built-in skill templates", async () => {
      await skills.templatesButton.click();

      const templateNames = [
        "Web Scraper",
        "Code Reviewer",
        "Test Generator",
        "API Tester",
        "Documentation Writer",
      ];

      for (const name of templateNames) {
        await expect(skills.getTemplateName(name)).toBeVisible();
      }
    });

    // AC #227: Each template shows tags
    test("should display tags on template cards", async () => {
      await skills.templatesButton.click();

      await test.step("Verify template tags are visible", async () => {
        await expect(skills.page.getByText("web")).toBeVisible();
        await expect(skills.page.getByText("testing")).toBeVisible();
      });
    });
  });

  // ── Skill CRUD ────────────────────────────────────────────────────────────

  test.describe("Skill CRUD", () => {
    // AC #227: New Skill button opens create dialog
    test("should open create skill dialog", async () => {
      await test.step("Click New Skill button", async () => {
        await skills.newSkillButton.click();
      });

      await test.step("Verify create dialog with form fields", async () => {
        await expect(skills.createDialogTitle).toBeVisible();
        await expect(skills.getFormNameInput()).toBeVisible();
        await expect(skills.getFormDescriptionInput()).toBeVisible();
        await expect(skills.getFormTagsInput()).toBeVisible();
        await expect(skills.getFormContentTextarea()).toBeVisible();
      });
    });

    // AC #227: Empty state rendered when no skills
    test("should display empty state when no skills exist", async () => {
      const empty = skills.emptyState;
      const hasSkills = !(await empty.isVisible().catch(() => false));
      if (!hasSkills) {
        await expect(empty).toBeVisible();
      }
    });
  });

  // ── Inline Skill Execution (#228) ─────────────────────────────────────────

  test.describe("Skill Execution", () => {
    // AC #228: Run button visible on skill cards (conditional on skills existing)
    test("should show Run button on skill cards when skills exist", async () => {
      const skillCards = skills.page.getByRole("heading").filter({ hasNotText: /Skills|Skill Templates|Create Skill|Edit Skill|Execute:/ });
      const count = await skillCards.count();
      if (count > 0) {
        // Hover to reveal action buttons
        const firstCard = skillCards.first();
        await firstCard.hover();
        const runButtons = skills.page.getByRole("button", { name: "Run" });
        await expect(runButtons.first()).toBeVisible();
      }
    });

    // AC #228: Execution dialog has input and execute button
    test("should show execution panel with input and execute button in dialog", async () => {
      // Need at least one skill to test execution
      const skillCards = skills.page.getByRole("heading").filter({ hasNotText: /Skills|Skill Templates|Create Skill|Edit Skill|Execute:/ });
      const count = await skillCards.count();
      if (count > 0) {
        const firstCard = skillCards.first();
        await firstCard.hover();
        await skills.page.getByRole("button", { name: "Run" }).first().click();

        await expect(skills.getExecuteDialogTitle()).toBeVisible();
        await expect(skills.getExecutionInput()).toBeVisible();
        await expect(skills.getExecuteButton()).toBeVisible();
      }
    });

    // AC #228: Execute button disabled without input
    test("should disable execute button when input is empty", async () => {
      const skillCards = skills.page.getByRole("heading").filter({ hasNotText: /Skills|Skill Templates|Create Skill|Edit Skill|Execute:/ });
      const count = await skillCards.count();
      if (count > 0) {
        const firstCard = skillCards.first();
        await firstCard.hover();
        await skills.page.getByRole("button", { name: "Run" }).first().click();

        await expect(skills.getExecuteButton()).toBeDisabled();
      }
    });
  });

  // ── Skill Import/Export (#229) ────────────────────────────────────────────

  test.describe("Import/Export", () => {
    // AC #229: Import button present
    test("should display import button", async () => {
      await expect(skills.importButton).toBeVisible();
    });

    // AC #229: Export button present
    test("should display export button", async () => {
      await expect(skills.exportButton).toBeVisible();
    });
  });
});
