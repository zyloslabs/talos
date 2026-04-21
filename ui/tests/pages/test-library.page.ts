import type { Page, Locator } from "@playwright/test";

/**
 * Page Object for the Test Library at `/talos/tests` (epic #537 / #539).
 * Backed by `ui/components/talos/test-matrix.tsx`.
 */
export class TestLibraryPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly appFilter: Locator;
  readonly typeTabs: Locator;
  readonly testCards: Locator;
  readonly exportButton: Locator;

  // Code viewer dialog
  readonly codeDialog: Locator;
  readonly codeViewer: Locator;
  readonly explainPanel: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Test Library" });
    this.appFilter = page.getByRole("combobox").first();
    this.typeTabs = page.getByRole("tab");
    this.testCards = page.locator('[class*="animate-slide-in"]');
    this.exportButton = page.getByRole("button", { name: /Export to GitHub/i });

    this.codeDialog = page.getByRole("dialog");
    this.codeViewer = page.locator(".monaco-editor").first();
    this.explainPanel = page.getByText(/Test Explanation|Explain/i).first();
  }

  async goto() {
    await this.page.goto("/talos/tests");
  }

  card(name: string): Locator {
    return this.page.getByRole("heading", { level: 3, name }).locator("xpath=ancestor::*[contains(@class,'animate-slide-in')]").first();
  }

  cardByText(name: string): Locator {
    // Each TestCard is wrapped in a Card with the test name as CardTitle.
    return this.page.locator(`text="${name}"`).first().locator("xpath=ancestor::*[contains(@class,'animate-slide-in')]").first();
  }

  runButtonForCard(card: Locator): Locator {
    return card.getByRole("button", { name: /Run/ });
  }

  codeButtonForCard(card: Locator): Locator {
    return card.getByRole("button", { name: /^Code$/ });
  }

  generationBadge(name: string): Locator {
    return this.cardByText(name).locator('[data-testid="generation-path-badge"]');
  }
}
