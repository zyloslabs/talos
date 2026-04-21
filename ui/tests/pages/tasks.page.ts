import type { Page, Locator } from "@playwright/test";

export class TasksPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly refreshButton: Locator;

  // Stats bar
  readonly pendingStat: Locator;
  readonly runningStat: Locator;
  readonly completedStat: Locator;
  readonly failedStat: Locator;
  readonly totalStat: Locator;

  // Tabs
  readonly allTab: Locator;
  readonly runningTab: Locator;
  readonly pendingTab: Locator;
  readonly completedTab: Locator;
  readonly failedTab: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Task Queue" });
    this.refreshButton = page.getByRole("button", { name: "Refresh" });

    // Stats — each stat is a Card with a value and label paragraph
    this.pendingStat = page.getByText("Pending").locator("..");
    this.runningStat = page.getByText("Running").locator("..");
    this.completedStat = page.getByText("Completed").locator("..").first();
    this.failedStat = page.getByText("Failed").locator("..").first();
    this.totalStat = page.getByText("Total").locator("..");

    // Tabs
    this.allTab = page.getByRole("tab", { name: "All" });
    this.runningTab = page.getByRole("tab", { name: "Running" });
    this.pendingTab = page.getByRole("tab", { name: "Pending" });
    this.completedTab = page.getByRole("tab", { name: "Completed" });
    this.failedTab = page.getByRole("tab", { name: "Failed" });
  }

  async goto() {
    await this.page.goto("/tasks");
  }

  /** Get the stat value paragraph for a given label. */
  getStatValue(label: string): Locator {
    return this.page
      .getByText(label, { exact: true })
      .locator("..")
      .locator("p.text-2xl")
      .first();
  }
}
