import type { Page, Locator } from "@playwright/test";

export class AgentsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly searchInput: Locator;
  readonly newAgentButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Agents" });
    this.searchInput = page.getByPlaceholder("Search agents...");
    this.newAgentButton = page.getByRole("button", { name: "New Agent" });
  }

  async goto() {
    await this.page.goto("/agents");
  }

  getAgentCard(name: string): Locator {
    return this.page.getByRole("heading", { name, exact: true, level: 3 });
  }

  getAgentDescription(name: string): Locator {
    return this.getAgentCard(name).locator("..").locator("p");
  }

  getShowMoreButton(name: string): Locator {
    return this.getAgentCard(name).locator("..").getByRole("button", { name: "Show more" });
  }
}
