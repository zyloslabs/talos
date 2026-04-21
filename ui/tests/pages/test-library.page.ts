import type { Page, Locator } from "@playwright/test";

/**
 * Page Object for the Test Library at `/talos/tests` (epic #537 / #539).
 * Backed by `ui/components/talos/test-matrix.tsx`.
 *
 * Locator strategy: each TestCard renders with `data-testid="test-card"` and
 * `data-test-name="<test name>"`. We avoid CSS-class / animation selectors and
 * fragile xpath ancestor walks — instead scope by the test-id and filter by
 * the visible heading text.
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
    this.testCards = page.getByTestId("test-card");
    this.exportButton = page.getByRole("button", { name: /Export to GitHub/i });

    this.codeDialog = page.getByRole("dialog");
    this.codeViewer = page.locator(".monaco-editor").first();
    this.explainPanel = page.getByText(/Test Explanation|Explain/i).first();
  }

  async goto() {
    await this.page.goto("/talos/tests");
  }

  /** Locate a test card by the visible test name. */
  card(name: string): Locator {
    return this.page
      .getByTestId("test-card")
      .filter({ has: this.page.getByRole("heading", { name }) })
      .first();
  }

  /** Backwards-compatible alias for callers using the previous API. */
  cardByText(name: string): Locator {
    return this.card(name);
  }

  runButtonForCard(card: Locator): Locator {
    return card.getByRole("button", { name: /Run/ });
  }

  codeButtonForCard(card: Locator): Locator {
    return card.getByRole("button", { name: /^Code$/ });
  }

  generationBadge(name: string): Locator {
    return this.card(name).getByTestId("generation-path-badge");
  }
}
