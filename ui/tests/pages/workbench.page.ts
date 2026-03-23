import type { Page, Locator } from "@playwright/test";

export class WorkbenchPage {
  readonly page: Page;
  readonly heading: Locator;

  // Step indicator
  readonly stepIndicator: Locator;

  // Step 1: Select App
  readonly noAppsMessage: Locator;

  // Step 2: Configure
  readonly startPipelineButton: Locator;
  readonly startOverButton: Locator;

  // Step 3: Running
  readonly pipelineRunningHeading: Locator;

  // Step 4: Results
  readonly newPipelineButton: Locator;
  readonly rerunButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Test Workbench" });

    // Step indicator (numbered circles)
    this.stepIndicator = page.locator(".flex.items-center.gap-2.mb-8");

    // Step 1
    this.noAppsMessage = page.getByText("No applications registered");

    // Step 2
    this.startPipelineButton = page.getByRole("button", { name: /Start Pipeline/ });
    this.startOverButton = page.getByRole("button", { name: "Start Over" });

    // Step 3
    this.pipelineRunningHeading = page.getByRole("heading", { name: "Pipeline Running" });

    // Step 4
    this.newPipelineButton = page.getByRole("button", { name: "New Pipeline" });
    this.rerunButton = page.getByRole("button", { name: "Re-run with Changes" });
  }

  async goto(step?: number) {
    const url = step ? `/workbench?step=${step}` : "/workbench";
    await this.page.goto(url);
  }

  // Step indicator helpers
  getStepCircle(stepNumber: number): Locator {
    return this.stepIndicator.locator(`div:has-text("${stepNumber}")`).first();
  }

  getStepLabel(label: string): Locator {
    return this.stepIndicator.getByText(label);
  }

  // App selection (Step 1)
  getAppCard(appName: string): Locator {
    return this.page.getByRole("heading", { name: appName, exact: true });
  }

  // Pipeline step toggles (Step 2)
  getPipelineStepLabel(label: string): Locator {
    return this.page.getByText(label, { exact: true });
  }

  getDiscoverConfigInput(): Locator {
    return this.page.getByPlaceholder("Max pages to crawl");
  }

  getGenerateConfigInput(): Locator {
    return this.page.getByPlaceholder(/Test types/);
  }

  getExecuteConfigInput(): Locator {
    return this.page.getByPlaceholder(/Browser:/);
  }

  // Results (Step 4)
  getResultStatCard(label: string): Locator {
    return this.page.getByText(label).first();
  }

  getStepResult(stepLabel: string): Locator {
    return this.page.getByText(stepLabel, { exact: true }).locator("..");
  }
}
