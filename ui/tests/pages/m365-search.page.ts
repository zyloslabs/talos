import type { Page, Locator } from "@playwright/test";

/**
 * Page Object for the M365 Document Search tab in the Setup Wizard's
 * "Upload Docs" step (step 2).
 */
export class M365SearchPage {
  readonly page: Page;

  // Tab switcher
  readonly uploadLocalTab: Locator;
  readonly searchM365Tab: Locator;

  // Session status
  readonly statusBadge: Locator;
  readonly statusConnected: Locator;
  readonly statusDisabled: Locator;
  readonly statusExpired: Locator;

  // Search
  readonly searchInput: Locator;
  readonly searchButton: Locator;

  // Results
  readonly resultsList: Locator;
  readonly fetchSelectedButton: Locator;

  // File status
  readonly fileStatusList: Locator;

  constructor(page: Page) {
    this.page = page;

    // Tab buttons
    this.uploadLocalTab = page.getByRole("button", { name: /Upload Local Files/ });
    this.searchM365Tab = page.getByRole("button", { name: /Search M365 Documents/ });

    // Status badges
    this.statusBadge = page.getByText(/M365 Connected|M365 Disabled|M365 expired|M365 error/);
    this.statusConnected = page.getByText("M365 Connected");
    this.statusDisabled = page.getByText("M365 Disabled");
    this.statusExpired = page.getByText(/M365 expired/);

    // Search form
    this.searchInput = page.getByPlaceholder("Search M365 documents...");
    this.searchButton = this.searchInput.locator("..").getByRole("button");

    // Results list (checkbox labels)
    this.resultsList = page.locator("label").filter({ has: page.locator("input[type='checkbox']") });

    // Fetch button
    this.fetchSelectedButton = page.getByRole("button", { name: /Fetch Selected/ });

    // File status items
    this.fileStatusList = page.locator("[class*='space-y']").filter({ has: page.getByText(/chunks|Error|Pending|ingesting/) });
  }

  async switchToM365Tab() {
    await this.searchM365Tab.click();
  }

  async switchToLocalTab() {
    await this.uploadLocalTab.click();
  }

  async search(query: string) {
    await this.searchInput.fill(query);
    await this.searchButton.click();
  }

  getResultByTitle(title: string): Locator {
    return this.resultsList.filter({ hasText: title });
  }

  getResultCheckbox(title: string): Locator {
    return this.getResultByTitle(title).locator("input[type='checkbox']");
  }

  async selectResult(title: string) {
    await this.getResultCheckbox(title).check();
  }

  async deselectResult(title: string) {
    await this.getResultCheckbox(title).uncheck();
  }
}
