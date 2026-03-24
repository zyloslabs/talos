import type { Page, Locator } from "@playwright/test";

export class NavBarPage {
  readonly page: Page;
  readonly nav: Locator;
  readonly brandLink: Locator;
  readonly modeToggleButton: Locator;

  // Top-level direct links rendered inline in the bar
  readonly dashboardLink: Locator;
  readonly chatLink: Locator;
  readonly workbenchLink: Locator;

  // Dropdown triggers (DropdownMenuTrigger → <button>)
  readonly testingDropdownTrigger: Locator;
  readonly automationDropdownTrigger: Locator;
  readonly adminDropdownTrigger: Locator;

  constructor(page: Page) {
    this.page = page;
    // Some pages (e.g. /admin) render a second <nav> inside the sidebar.
    // Use .first() to always target the sticky top NavBar.
    this.nav = page.getByRole("navigation").first();
    this.brandLink = this.nav.getByRole("link", { name: "Talos" });
    // ModeToggle is only in the top NavBar — scope to this.nav to avoid
    // matching any other button that might carry the same accessible name.
    this.modeToggleButton = this.nav.getByRole("button", { name: "Toggle theme" });

    this.dashboardLink = this.nav.getByRole("link", { name: "Dashboard" });
    this.chatLink = this.nav.getByRole("link", { name: "Chat" });
    this.workbenchLink = this.nav.getByRole("link", { name: "Workbench" });

    // Dropdown triggers — scoped to the nav to avoid collisions
    this.testingDropdownTrigger = this.nav.getByRole("button", { name: /Testing/ });
    this.automationDropdownTrigger = this.nav.getByRole("button", { name: /Automation/ });
    this.adminDropdownTrigger = this.nav.getByRole("button", { name: /Admin/ });
  }

  async goto(path: string = "/talos") {
    await this.page.goto(path);
  }

  /** Returns a portal-rendered dropdown menu item by visible label. */
  getDropdownItem(label: string): Locator {
    return this.page.getByRole("menuitem", { name: label });
  }
}
