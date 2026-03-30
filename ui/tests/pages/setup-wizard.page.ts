import type { Page, Locator } from "@playwright/test";

/**
 * Page Object Model for the Talos Setup Wizard at /talos/setup.
 * Covers all nine steps: Register App → Data Sources → Atlassian → Upload Docs →
 * Vault Roles → Discovery → Generate Criteria → Review Criteria → Generate Tests.
 */
export class SetupWizardPage {
  readonly page: Page;

  // ── Bottom navigation ────────────────────────────────────────────────────
  /** The global "Skip" button in the wizard bottom-nav (steps 1–7). */
  readonly skipNavButton: Locator;
  /** The global "Back" button in the wizard bottom-nav. */
  readonly backButton: Locator;

  // ── Step 0: Register App ─────────────────────────────────────────────────
  readonly nameInput: Locator;
  readonly repoUrlInput: Locator;
  readonly baseUrlInput: Locator;
  readonly createAppButton: Locator;

  // ── Step 3: Upload Docs ──────────────────────────────────────────────────
  /** Hidden <input type="file"> – use setInputFiles() to upload. */
  readonly fileInput: Locator;
  /**
   * The dynamic continue/skip button inside the Upload Docs step card.
   * Label is "Skip This Step →" (0 files), "Continue (N file(s) uploaded)"
   * (files done), or disabled "Uploading…" (files in-flight).
   */
  readonly uploadContinueButton: Locator;

  // ── Step 5: Discovery ────────────────────────────────────────────────────
  readonly startDiscoveryButton: Locator;

  // ── Step 8: Generate Tests ───────────────────────────────────────────────
  readonly generateAllTestsButton: Locator;
  readonly goToTestLibraryButton: Locator;
  /** The "Skip & Go to Test Library →" underline link. */
  readonly skipToTestLibraryLink: Locator;

  constructor(page: Page) {
    this.page = page;

    // Navigation — use .last() to target the wizard footer nav Skip, not any
    // step-internal "Skip" button (e.g. AtlassianStep has its own).
    this.skipNavButton = page.getByRole("button", { name: "Skip", exact: true }).last();
    this.backButton = page.getByRole("button", { name: "Back" });

    // Register App
    this.nameInput = page.getByPlaceholder("Application name");
    this.repoUrlInput = page.getByPlaceholder(/Repository URL/);
    this.baseUrlInput = page.getByPlaceholder(/Base URL/);
    this.createAppButton = page.getByRole("button", { name: "Create Application" });

    // Upload Docs
    this.fileInput = page.locator('input[type="file"]');
    this.uploadContinueButton = page.getByRole("button", { name: /Skip This Step|Continue \(|Uploading/ });

    // Discovery
    this.startDiscoveryButton = page.getByRole("button", { name: "Start Discovery" });

    // Generate Tests
    this.generateAllTestsButton = page.getByRole("button", {
      name: /Generate Tests for All Criteria/,
    });
    this.goToTestLibraryButton = page.getByRole("button", { name: "Go to Test Library" });
    this.skipToTestLibraryLink = page.getByText(/Skip.*Go to Test Library/);
  }

  async goto() {
    await this.page.goto("/talos/setup");
  }

  /** Fill in the Register App form and submit it. */
  async registerApp(
    name = "E2E Test App",
    repoUrl = "https://github.com/test/repo",
    baseUrl = "https://test.example.com"
  ) {
    await this.nameInput.fill(name);
    await this.repoUrlInput.fill(repoUrl);
    await this.baseUrlInput.fill(baseUrl);
    await this.createAppButton.click();
  }

  /**
   * After app registration, click a step in the progress bar by its label.
   * Works for any step once appId is set.
   */
  async goToStep(stepLabel: string | RegExp) {
    await this.page.getByRole("button", { name: stepLabel }).click();
  }
}
