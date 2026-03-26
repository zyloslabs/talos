import type { Page, Locator } from "@playwright/test";

/**
 * Page Object for Atlassian Integration — covers both the Setup Wizard
 * "Atlassian" step and the standalone AtlassianSettings panel.
 */
export class AtlassianWizardPage {
  readonly page: Page;

  // Step header
  readonly stepHeading: Locator;
  readonly stepDescription: Locator;

  // Deployment type toggle buttons
  readonly cloudButton: Locator;
  readonly dataCenterButton: Locator;

  // Jira fields
  readonly jiraSection: Locator;
  readonly jiraUrlInput: Locator;
  readonly jiraProjectKeyInput: Locator;

  // Cloud-specific Jira fields
  readonly jiraUsernameInput: Locator;
  readonly jiraApiTokenInput: Locator;

  // Data Center-specific Jira field
  readonly jiraPersonalTokenInput: Locator;

  // Jira SSL
  readonly jiraSslCheckbox: Locator;

  // Confluence fields
  readonly confluenceSection: Locator;
  readonly confluenceUrlInput: Locator;
  readonly confluenceSpaceKeysInput: Locator;

  // Cloud-specific Confluence fields
  readonly confluenceUsernameInput: Locator;
  readonly confluenceApiTokenInput: Locator;

  // Data Center-specific Confluence field
  readonly confluencePersonalTokenInput: Locator;

  // Confluence SSL
  readonly confluenceSslCheckbox: Locator;

  // Actions
  readonly testConnectionButton: Locator;
  readonly saveAndContinueButton: Locator;
  readonly skipButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Step header
    this.stepHeading = page.getByRole("heading", { name: "Atlassian" });
    this.stepDescription = page.getByText("Connect Jira & Confluence (optional)");

    // Deployment toggle
    this.cloudButton = page.getByRole("button", { name: "Cloud" });
    this.dataCenterButton = page.getByRole("button", { name: "Data Center" });

    // Jira fields (wizard uses placeholder-based inputs inside bordered sections)
    this.jiraSection = page.getByText("Jira").first();
    this.jiraUrlInput = page.getByPlaceholder("Jira URL (https://your-org.atlassian.net)");
    this.jiraProjectKeyInput = page.getByPlaceholder("Project key (e.g., PROJ)");
    this.jiraUsernameInput = page.getByPlaceholder("Username vault ref").first();
    this.jiraApiTokenInput = page.getByPlaceholder("API token vault ref").first();
    this.jiraPersonalTokenInput = page.getByPlaceholder("Personal access token vault ref").first();
    this.jiraSslCheckbox = page.getByText("Verify SSL").first();

    // Confluence fields
    this.confluenceSection = page.getByText("Confluence").first();
    this.confluenceUrlInput = page.getByPlaceholder("Confluence URL (https://your-org.atlassian.net/wiki)");
    this.confluenceSpaceKeysInput = page.getByPlaceholder("Space keys (comma-separated: DEV, QA)");
    this.confluenceUsernameInput = page.getByPlaceholder("Username vault ref").nth(1);
    this.confluenceApiTokenInput = page.getByPlaceholder("API token vault ref").nth(1);
    this.confluencePersonalTokenInput = page.getByPlaceholder("Personal access token vault ref").nth(1);
    this.confluenceSslCheckbox = page.getByText("Verify SSL").nth(1);

    // Actions
    this.testConnectionButton = page.getByRole("button", { name: "Test Connection" });
    this.saveAndContinueButton = page.getByRole("button", { name: "Save & Continue" });
    this.skipButton = page.getByRole("button", { name: "Skip" }).last();
  }

  async selectCloud() {
    await this.cloudButton.click();
  }

  async selectDataCenter() {
    await this.dataCenterButton.click();
  }
}

/**
 * Page Object for the AtlassianSettings panel (post-setup management).
 */
export class AtlassianSettingsPage {
  readonly page: Page;

  // Header
  readonly heading: Locator;
  readonly removeButton: Locator;

  // Deployment toggle
  readonly cloudButton: Locator;
  readonly dataCenterButton: Locator;

  // Jira section
  readonly jiraHeading: Locator;
  readonly jiraUrlInput: Locator;
  readonly jiraProjectKeyInput: Locator;

  // Confluence section
  readonly confluenceHeading: Locator;
  readonly confluenceUrlInput: Locator;
  readonly confluenceSpaceKeysInput: Locator;

  // Actions
  readonly testConnectionButton: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    this.page = page;

    this.heading = page.getByText("Atlassian Integration");
    this.removeButton = page.getByRole("button", { name: "Remove" });

    this.cloudButton = page.getByRole("button", { name: "Cloud" });
    this.dataCenterButton = page.getByRole("button", { name: "Data Center" });

    this.jiraHeading = page.getByRole("heading", { name: "Jira" });
    this.jiraUrlInput = page.getByPlaceholder("Jira URL");
    this.jiraProjectKeyInput = page.getByPlaceholder("Project key");

    this.confluenceHeading = page.getByRole("heading", { name: "Confluence" });
    this.confluenceUrlInput = page.getByPlaceholder("Confluence URL");
    this.confluenceSpaceKeysInput = page.getByPlaceholder("Space keys (comma-separated)");

    this.testConnectionButton = page.getByRole("button", { name: "Test Connection" });
    this.saveButton = page.getByRole("button", { name: "Save" });
  }
}
