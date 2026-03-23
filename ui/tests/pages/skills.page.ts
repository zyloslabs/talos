import type { Page, Locator } from "@playwright/test";

export class SkillsPage {
  readonly page: Page;
  readonly heading: Locator;

  // Actions
  readonly newSkillButton: Locator;
  readonly importButton: Locator;
  readonly exportButton: Locator;
  readonly templatesButton: Locator;

  // Template dialog
  readonly templateDialogTitle: Locator;

  // Create dialog
  readonly createDialogTitle: Locator;

  // Empty state
  readonly emptyState: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Skills" });

    // Top actions
    this.newSkillButton = page.getByRole("button", { name: "New Skill" });
    this.importButton = page.getByRole("button", { name: "Import" });
    this.exportButton = page.getByRole("button", { name: "Export" });
    this.templatesButton = page.getByRole("button", { name: "Templates" });

    // Dialogs
    this.templateDialogTitle = page.getByRole("heading", { name: "Skill Templates" });
    this.createDialogTitle = page.getByRole("heading", { name: "Create Skill" });

    // Empty state
    this.emptyState = page.getByText("No skills configured");
  }

  async goto() {
    await this.page.goto("/skills");
  }

  getSkillCard(name: string): Locator {
    return this.page.getByRole("heading", { name, exact: true });
  }

  getSkillToggle(name: string): Locator {
    return this.getSkillCard(name).locator("..").locator("..").getByRole("switch");
  }

  getRunButton(name: string): Locator {
    return this.getSkillCard(name).locator("..").locator("..").locator("..").getByRole("button", { name: "Run" });
  }

  getEditButton(name: string): Locator {
    return this.getSkillCard(name).locator("..").locator("..").locator("..").getByRole("button", { name: "Edit" });
  }

  getDeleteButton(name: string): Locator {
    return this.getSkillCard(name).locator("..").locator("..").locator("..").getByRole("button", { name: "Delete" });
  }

  getTemplateName(name: string): Locator {
    return this.page.getByRole("heading", { name, exact: true });
  }

  // Execution dialog
  getExecuteDialogTitle(): Locator {
    return this.page.getByRole("heading", { name: /Execute:/ });
  }

  getExecutionInput(): Locator {
    return this.page.getByPlaceholder("Input for this skill...");
  }

  getExecuteButton(): Locator {
    return this.page.getByRole("button", { name: "Execute" });
  }

  // Skill form
  getFormNameInput(): Locator {
    return this.page.getByPlaceholder("Skill name");
  }

  getFormDescriptionInput(): Locator {
    return this.page.getByPlaceholder("Description");
  }

  getFormTagsInput(): Locator {
    return this.page.getByPlaceholder("Tags (comma-separated)");
  }

  getFormContentTextarea(): Locator {
    return this.page.getByPlaceholder("Skill content / instructions...");
  }
}
