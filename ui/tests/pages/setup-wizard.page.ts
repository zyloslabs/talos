import type { Page, Locator } from "@playwright/test";

/**
 * Page Object for the Talos Setup Wizard at /talos/setup.
 * Covers all 9 wizard steps and their common UI elements.
 */
export class SetupWizardPage {
  readonly page: Page;

  // ── Step progress bar ─────────────────────────────────────────────────────

  readonly stepButtons: Locator;

  // ── Step header (changes per step) ────────────────────────────────────────

  readonly stepHeading: (name: string) => Locator;
  readonly stepDescription: (text: string) => Locator;

  // ── Navigation ────────────────────────────────────────────────────────────

  readonly backButton: Locator;
  readonly nextButton: Locator;
  readonly skipButton: Locator;

  // ── Step 0: Register App ──────────────────────────────────────────────────

  readonly appNameInput: Locator;
  readonly createAppButton: Locator;

  // ── Step 2: Atlassian ─────────────────────────────────────────────────────

  readonly cloudToggle: Locator;
  readonly dataCenterToggle: Locator;

  // Cloud token fields (identified by placeholder)
  readonly jiraApiTokenInput: Locator;
  readonly confluenceApiTokenInput: Locator;

  // Data Center PAT fields (identified by placeholder)
  readonly jiraPersonalTokenInput: Locator;
  readonly confluencePersonalTokenInput: Locator;

  // ── Step 5: Discovery ─────────────────────────────────────────────────────

  readonly startDiscoveryButton: Locator;
  readonly discoveryInProgress: Locator;
  readonly discoveryComplete: Locator;

  // ── Step 6: Generate Criteria ─────────────────────────────────────────────

  readonly generateCriteriaButton: Locator;
  readonly criteriaGeneratedCount: Locator;

  // ── Step 7: Review Criteria ───────────────────────────────────────────────

  readonly aiSuggestInput: Locator;
  readonly aiSuggestButton: Locator;

  // ── Step 8: Generate Tests ────────────────────────────────────────────────

  readonly generateAllTestsButton: Locator;

  // ── Error alert (shared across steps) ─────────────────────────────────────

  readonly errorAlert: Locator;

  constructor(page: Page) {
    this.page = page;

    // Step bar
    this.stepButtons = page
      .locator("button")
      .filter({
        hasText: /^\d+$|Register|Data Sources|Atlassian|Upload|Vault|Discovery|Generate Criteria|Review|Generate Tests/,
      });

    // Headings
    this.stepHeading = (name: string) => page.getByRole("heading", { name });
    this.stepDescription = (text: string) => page.getByText(text);

    // Nav
    this.backButton = page.getByRole("button", { name: "Back" });
    this.nextButton = page.getByRole("button", { name: "Continue" });
    this.skipButton = page.getByRole("button", { name: "Skip" }).last();

    // Step 0
    this.appNameInput = page.getByPlaceholder("Application name");
    this.createAppButton = page.getByRole("button", { name: "Create Application" });

    // Step 2: Atlassian
    this.cloudToggle = page.getByRole("button", { name: "Cloud" });
    this.dataCenterToggle = page.getByRole("button", { name: "Data Center" });
    this.jiraApiTokenInput = page.getByPlaceholder("API token vault ref").first();
    this.confluenceApiTokenInput = page.getByPlaceholder("API token vault ref").nth(1);
    this.jiraPersonalTokenInput = page.getByPlaceholder("Personal access token vault ref").first();
    this.confluencePersonalTokenInput = page.getByPlaceholder("Personal access token vault ref").nth(1);

    // Step 5: Discovery
    this.startDiscoveryButton = page.getByRole("button", { name: "Start Discovery" });
    this.discoveryInProgress = page.getByText("Discovery in progress...");
    this.discoveryComplete = page.getByText("Discovery complete");

    // Step 6: Generate Criteria — use exact to avoid matching the step progress bar button
    this.generateCriteriaButton = page.getByRole("button", { name: "Generate Criteria", exact: true });
    this.criteriaGeneratedCount = page.getByText("Criteria generated");

    // Step 7: Review Criteria
    this.aiSuggestInput = page.getByPlaceholder("Describe a new criterion for AI to suggest...");
    this.aiSuggestButton = page.getByRole("button", { name: "AI Suggest" });

    // Step 8: Generate Tests
    this.generateAllTestsButton = page.getByRole("button", { name: "Generate Tests for All Criteria" });

    // Shared error alert — matches the red error border pattern
    this.errorAlert = page.locator("[class*='border-red']");
  }

  async goto() {
    await this.page.goto("/talos/setup");
  }

  existingAppButton(appName: string): Locator {
    return this.page.getByRole("button", { name: appName });
  }

  stepProgressButton(label: string): Locator {
    return this.page.getByRole("button", { name: label });
  }

  completedStepIcon(stepIndex: number): Locator {
    // Completed steps show a CheckCircle2 icon instead of the step number
    return this.page.locator("button").filter({ hasText: new RegExp(`^${stepIndex + 1}$`) });
  }
}
