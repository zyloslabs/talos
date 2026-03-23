import type { Page, Locator } from "@playwright/test";

export class TalosPage {
  readonly page: Page;
  readonly heading: Locator;

  // Stats
  readonly applicationsStatCard: Locator;
  readonly testsStatCard: Locator;
  readonly recentRunsStatCard: Locator;
  readonly passRateStatCard: Locator;

  // Application grid
  readonly applicationsHeading: Locator;
  readonly addApplicationButton: Locator;
  readonly emptyState: Locator;

  // Add Application dialog
  readonly dialogTitle: Locator;
  readonly nameInput: Locator;
  readonly repoUrlInput: Locator;
  readonly baseUrlInput: Locator;
  readonly cancelButton: Locator;
  readonly addButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Dashboard" });

    // Stat cards
    this.applicationsStatCard = page.getByText("Applications").first();
    this.testsStatCard = page.getByText("Tests").first();
    this.recentRunsStatCard = page.getByText("Recent Runs");
    this.passRateStatCard = page.getByText("Pass Rate");

    // App section
    this.applicationsHeading = page.getByRole("heading", { name: "Applications" });
    this.addApplicationButton = page.getByRole("button", { name: "Add Application" });
    this.emptyState = page.getByText("No applications yet");

    // Dialog
    this.dialogTitle = page.getByRole("heading", { name: "Add Application" });
    this.nameInput = page.getByLabel("Application Name");
    this.repoUrlInput = page.getByLabel("Repository URL");
    this.baseUrlInput = page.getByLabel("Base URL");
    this.cancelButton = page.getByRole("button", { name: "Cancel" });
    this.addButton = page.getByRole("button", { name: "Add Application", exact: true }).last();
  }

  async goto() {
    await this.page.goto("/talos");
  }

  getAppCard(name: string): Locator {
    return this.page.getByRole("heading", { name, exact: true });
  }

  getAppStatus(name: string): Locator {
    return this.getAppCard(name).locator("..").getByText(/active|archived|pending/);
  }

  getScanButton(name: string): Locator {
    return this.getAppCard(name).locator("..").locator("..").getByRole("button", { name: "Scan" });
  }

  async openAddDialog() {
    await this.addApplicationButton.click();
  }

  async fillAddForm(name: string, repoUrl?: string, baseUrl?: string) {
    await this.nameInput.fill(name);
    if (repoUrl) await this.repoUrlInput.fill(repoUrl);
    if (baseUrl) await this.baseUrlInput.fill(baseUrl);
  }
}
