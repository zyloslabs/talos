import type { Page, Locator } from "@playwright/test";

/**
 * Page Object for Data Sources — covers both the Setup Wizard "Data Sources"
 * step and the standalone DataSourceSettings panel.
 */
export class DataSourcesPage {
  readonly page: Page;

  // Wizard step header
  readonly stepHeading: Locator;
  readonly stepDescription: Locator;

  // Draft data source form fields (wizard step uses placeholder-based inputs)
  readonly labelInput: Locator;
  readonly driverTypeSelect: Locator;
  readonly jdbcUrlInput: Locator;
  readonly usernameVaultRefInput: Locator;
  readonly passwordVaultRefInput: Locator;

  // Draft actions
  readonly addDataSourceButton: Locator;
  readonly saveAndContinueButton: Locator;

  // Navigation
  readonly skipButton: Locator;
  readonly backButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Step header
    this.stepHeading = page.getByRole("heading", { name: "Data Sources" });
    this.stepDescription = page.getByText("Configure JDBC database connections");

    // Form fields (first draft block)
    this.labelInput = page.getByPlaceholder("Label (e.g., Production Oracle)").first();
    this.driverTypeSelect = page.locator("select").first();
    this.jdbcUrlInput = page.getByPlaceholder("JDBC URL (jdbc:postgresql://host:5432/db)").first();
    this.usernameVaultRefInput = page.getByPlaceholder("Username vault ref (vault:db-user)").first();
    this.passwordVaultRefInput = page.getByPlaceholder("Password vault ref (vault:db-pass)").first();

    // Actions
    this.addDataSourceButton = page.getByRole("button", { name: "Add Data Source" });
    this.saveAndContinueButton = page.getByRole("button", { name: "Save & Continue" });

    // Navigation
    this.skipButton = page.getByRole("button", { name: "Skip" });
    this.backButton = page.getByRole("button", { name: "Back" });
  }

  /** Get the label input for a specific draft index (0-based). */
  getLabelInput(index: number): Locator {
    return this.page.getByPlaceholder("Label (e.g., Production Oracle)").nth(index);
  }

  getJdbcUrlInput(index: number): Locator {
    return this.page.getByPlaceholder("JDBC URL (jdbc:postgresql://host:5432/db)").nth(index);
  }

  getUsernameVaultRefInput(index: number): Locator {
    return this.page.getByPlaceholder("Username vault ref (vault:db-user)").nth(index);
  }

  getPasswordVaultRefInput(index: number): Locator {
    return this.page.getByPlaceholder("Password vault ref (vault:db-pass)").nth(index);
  }

  getDriverTypeSelect(index: number): Locator {
    return this.page.locator("select").nth(index);
  }

  /** Get the remove button for a specific draft (button with Trash icon). */
  getRemoveButton(index: number): Locator {
    return this.page.getByText(`Data Source ${index + 1}`).locator("..").getByRole("button");
  }

  /** Get the data source draft card by 1-based number label. */
  getDraftLabel(num: number): Locator {
    return this.page.getByText(`Data Source ${num}`);
  }

  async fillDraft(index: number, data: { label: string; driverType?: string; jdbcUrl: string; usernameVaultRef?: string; passwordVaultRef?: string }) {
    await this.getLabelInput(index).fill(data.label);
    if (data.driverType) {
      await this.getDriverTypeSelect(index).selectOption(data.driverType);
    }
    await this.getJdbcUrlInput(index).fill(data.jdbcUrl);
    if (data.usernameVaultRef) {
      await this.getUsernameVaultRefInput(index).fill(data.usernameVaultRef);
    }
    if (data.passwordVaultRef) {
      await this.getPasswordVaultRefInput(index).fill(data.passwordVaultRef);
    }
  }
}

/**
 * Page Object for the DataSourceSettings panel (post-setup management).
 */
export class DataSourceSettingsPage {
  readonly page: Page;

  // Header
  readonly heading: Locator;
  readonly addButton: Locator;

  // Empty state
  readonly emptyMessage: Locator;

  // New data source form
  readonly newSourceHeading: Locator;

  constructor(page: Page) {
    this.page = page;

    this.heading = page.getByText("Data Sources").first();
    this.addButton = page.getByRole("button", { name: "Add Data Source" });
    this.emptyMessage = page.getByText("No data sources configured");
    this.newSourceHeading = page.getByRole("heading", { name: "New Data Source" });
  }

  // Settings form fields (shared form component using placeholder inputs)
  get labelInput(): Locator {
    return this.page.getByPlaceholder("Label");
  }

  get jdbcUrlInput(): Locator {
    return this.page.getByPlaceholder("JDBC URL");
  }

  get usernameVaultRefInput(): Locator {
    return this.page.getByPlaceholder("Username vault ref");
  }

  get passwordVaultRefInput(): Locator {
    return this.page.getByPlaceholder("Password vault ref");
  }

  get createButton(): Locator {
    return this.page.getByRole("button", { name: "Create" });
  }

  get updateButton(): Locator {
    return this.page.getByRole("button", { name: "Update" });
  }

  get testConnectionButton(): Locator {
    return this.page.getByRole("button", { name: "Test Connection" });
  }

  get cancelButton(): Locator {
    return this.page.getByRole("button", { name: "Cancel" });
  }
}
