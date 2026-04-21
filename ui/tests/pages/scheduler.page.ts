import type { Page, Locator } from "@playwright/test";

/**
 * Page Object for `/scheduler` (epic #537 / #546).
 *
 * Locator strategy: each scheduled-job card renders with
 * `data-testid="scheduler-job-card"` and `data-job-name="<job name>"`. We
 * scope by the test-id and filter by the visible heading text rather than
 * walking xpath ancestors of a class match.
 */
export class SchedulerPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly newJobButton: Locator;
  readonly jobCards: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Scheduler" });
    this.newJobButton = page.getByRole("button", { name: /New Job/i });
    this.jobCards = page.getByTestId("scheduler-job-card");
  }

  async goto() {
    await this.page.goto("/scheduler");
  }

  /** Locate a job card by its visible name. */
  jobCard(name: string): Locator {
    return this.page
      .getByTestId("scheduler-job-card")
      .filter({ has: this.page.getByRole("heading", { name }) })
      .first();
  }
}
