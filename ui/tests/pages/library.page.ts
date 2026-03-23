import type { Page, Locator } from "@playwright/test";

export class LibraryPage {
  readonly page: Page;
  readonly heading: Locator;

  // Actions
  readonly newPromptButton: Locator;
  readonly importButton: Locator;
  readonly exportButton: Locator;

  // Search
  readonly searchInput: Locator;
  readonly allFilterButton: Locator;

  // Create/Edit dialog
  readonly createDialogTitle: Locator;
  readonly editDialogTitle: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Prompt Library" });

    // Action buttons
    this.newPromptButton = page.getByRole("button", { name: "New Prompt" });
    this.importButton = page.getByRole("button", { name: "Import" });
    this.exportButton = page.getByRole("button", { name: "Export" });

    // Search
    this.searchInput = page.getByPlaceholder("Search prompts...");
    this.allFilterButton = page.getByRole("button", { name: "All" });

    // Dialogs
    this.createDialogTitle = page.getByRole("heading", { name: "Create Prompt" });
    this.editDialogTitle = page.getByRole("heading", { name: "Edit Prompt" });
  }

  async goto() {
    await this.page.goto("/library");
  }

  getPromptCard(name: string): Locator {
    return this.page.getByRole("heading", { name, exact: true });
  }

  getCategoryFilter(category: string): Locator {
    return this.page.getByRole("button", { name: category });
  }

  getDeleteButton(promptName: string): Locator {
    return this.getPromptCard(promptName)
      .locator("..").locator("..").locator("button")
      .filter({ has: this.page.locator("svg") });
  }

  getVariableButton(promptName: string): Locator {
    return this.getPromptCard(promptName)
      .locator("..").locator("..").getByRole("button", { name: "Template variables" });
  }

  getPipelineButton(promptName: string): Locator {
    return this.getPromptCard(promptName)
      .locator("..").locator("..").getByRole("button", { name: "Pipeline stages" });
  }

  getStagesBadge(): Locator {
    return this.page.getByText(/\d+ stages/);
  }

  getVariableBadge(): Locator {
    return this.page.getByText(/\{\{/);
  }

  // Form helpers (inside dialog)
  getFormNameInput(): Locator {
    return this.page.getByPlaceholder("Prompt name");
  }

  getFormContentTextarea(): Locator {
    return this.page.getByPlaceholder("Prompt content...");
  }
}
