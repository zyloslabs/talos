import type { Page, Locator } from "@playwright/test";

/**
 * Page Object for `/scheduler` (epic #537 / #546).
 */
export class SchedulerPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly newJobButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Scheduler" });
    this.newJobButton = page.getByRole("button", { name: /New Job/i });
  }

  async goto() {
    await this.page.goto("/scheduler");
  }

  jobCard(name: string): Locator {
    return this.page.getByRole("heading", { name }).locator("xpath=ancestor::*[contains(@class,'rounded')]").first();
  }
}
