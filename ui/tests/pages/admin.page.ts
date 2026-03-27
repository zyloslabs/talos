import { type Page, type Locator, expect } from "@playwright/test";

export class AdminPage {
  readonly page: Page;
  readonly heading: Locator;

  // Sidebar nav links
  readonly authLink: Locator;
  readonly personalityLink: Locator;
  readonly modelsLink: Locator;
  readonly mcpLink: Locator;
  readonly envLink: Locator;
  readonly knowledgeLink: Locator;

  // Auth panel
  readonly authSection: Locator;
  readonly authBadge: Locator;
  readonly startDeviceAuthButton: Locator;

  // Personality panel
  readonly personalitySection: Locator;
  readonly personalityNameInput: Locator;
  readonly personalityPromptTextarea: Locator;
  readonly createPersonalityButton: Locator;

  // Models panel
  readonly modelsSection: Locator;

  // MCP panel
  readonly mcpSection: Locator;
  readonly mcpNameInput: Locator;
  readonly mcpCommandInput: Locator;
  readonly addServerButton: Locator;

  // Environment panel
  readonly envSection: Locator;

  // Network / Proxy panel
  readonly networkLink: Locator;
  readonly networkSection: Locator;
  readonly proxyToggle: Locator;
  readonly httpProxyInput: Locator;
  readonly httpsProxyInput: Locator;
  readonly noProxyInput: Locator;
  readonly proxySaveButton: Locator;
  readonly proxyTestButton: Locator;
  readonly proxyTestResult: Locator;

  // Knowledge panel
  readonly knowledgeSection: Locator;
  readonly knowledgeSearchInput: Locator;
  readonly knowledgeSearchButton: Locator;
  readonly reindexButton: Locator;

  // Sidebar (PR #344 — button-based controlled navigation)
  readonly sidebar: Locator;

  // MCP Preset Panel (PR #345, #346)
  readonly addMcpServerButton: Locator;
  readonly presetServerNameInput: Locator;
  readonly presetAddServerButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Admin Settings" });

    // Sidebar
    this.authLink = page.getByRole("link", { name: "Authentication" });
    this.personalityLink = page.getByRole("link", { name: "Personality" });
    this.modelsLink = page.getByRole("link", { name: "Models" });
    this.mcpLink = page.getByRole("link", { name: "MCP Servers" });
    this.networkLink = page.getByRole("link", { name: "Network / Proxy" });
    this.envLink = page.getByRole("link", { name: "Environment" });
    this.knowledgeLink = page.getByRole("link", { name: "Knowledge Base" });

    // Sections (by id-based locator text)
    this.authSection = page.locator("#auth");
    this.personalitySection = page.locator("#personality");
    this.modelsSection = page.locator("#models");
    this.mcpSection = page.locator("#mcp");
    this.networkSection = page.locator("#network");
    this.envSection = page.locator("#env");
    this.knowledgeSection = page.locator("#knowledge");

    // Auth panel
    this.authBadge = this.authSection.getByText(/Authenticated|Not Authenticated/);
    this.startDeviceAuthButton = page.getByRole("button", { name: "Start Device Auth" });

    // Personality panel
    this.personalityNameInput = this.personalitySection.getByPlaceholder("Name");
    this.personalityPromptTextarea = this.personalitySection.getByPlaceholder("System prompt");
    this.createPersonalityButton = this.personalitySection.getByRole("button", { name: "Create" });

    // Models
    // (dynamic buttons: model selection and reasoning effort)

    // MCP
    this.mcpNameInput = this.mcpSection.getByPlaceholder("Name");
    this.mcpCommandInput = this.mcpSection.getByPlaceholder("Command (for stdio)");
    this.addServerButton = this.mcpSection.getByRole("button", { name: "Add Server" });

    // Network / Proxy
    this.proxyToggle = this.networkSection.getByRole("switch");
    this.httpProxyInput = this.networkSection.getByLabel("HTTP Proxy");
    this.httpsProxyInput = this.networkSection.getByLabel("HTTPS Proxy");
    this.noProxyInput = this.networkSection.getByLabel("No Proxy");
    this.proxySaveButton = this.networkSection.getByRole("button", { name: "Save" });
    this.proxyTestButton = this.networkSection.getByRole("button", { name: "Test Connection" });
    this.proxyTestResult = this.networkSection.getByText(/Proxy connection successful|Proxy test failed/);

    // Env
    // (dynamic — env vars by category)

    // Knowledge
    this.knowledgeSearchInput = page.getByPlaceholder("Search knowledge base...");
    this.knowledgeSearchButton = this.knowledgeSection.getByRole("button", { name: "Search" });
    this.reindexButton = page.getByRole("button", { name: /Re-index/ });

    // Sidebar (PR #344)
    this.sidebar = page.getByRole("complementary");

    // MCP Preset Panel (PR #345, #346)
    this.addMcpServerButton = this.mcpSection.getByRole("button", { name: "Add MCP Server" });
    this.presetServerNameInput = this.mcpSection.getByPlaceholder("server-name");
    this.presetAddServerButton = this.mcpSection.getByRole("button", { name: "Add Server" });
  }

  async goto() {
    await this.page.goto("/admin");
  }

  // Environment helpers
  getEnvCategory(category: string): Locator {
    return this.envSection.getByText(category, { exact: true });
  }

  getEnvVarRow(key: string): Locator {
    return this.envSection.getByText(key, { exact: true });
  }

  getEnvEditButton(key: string): Locator {
    return this.envSection
      .getByText(key)
      .locator("..")
      .locator("..")
      .getByRole("button", { name: /Edit|Set/ });
  }

  getMissingRequiredWarning(): Locator {
    return this.envSection.getByText(/Missing required/);
  }

  // Knowledge helpers
  getKnowledgeStatCard(label: string): Locator {
    return this.knowledgeSection.getByText(label);
  }

  // Model helpers
  getModelButton(modelId: string): Locator {
    return this.modelsSection.getByRole("button", { name: modelId });
  }

  getReasoningEffortButton(effort: string): Locator {
    return this.modelsSection.getByRole("button", { name: effort });
  }

  // MCP type selector
  getMcpTypeButton(type: string): Locator {
    return this.mcpSection.getByRole("button", { name: type, exact: true });
  }

  // Personality helpers
  getPersonalityToggle(name: string): Locator {
    return this.personalitySection.getByText(name).locator("..").getByRole("switch");
  }

  // ── Sidebar Navigation (PR #344) ──────────────────────────────────────

  getSidebarButton(label: string): Locator {
    return this.sidebar.getByRole("button", { name: label });
  }
  /** Open the MCP section by clicking its SectionCard header toggle. */
  async openMcpSection() {
    await this.mcpSection.scrollIntoViewIfNeeded();
    // Only toggle if the section content is not already visible
    const isOpen = await this.addMcpServerButton.isVisible().catch(() => false);
    if (!isOpen) {
      await this.mcpSection.getByText("MCP Servers", { exact: true }).click();
    }
    await expect(this.addMcpServerButton).toBeVisible();
  }

  /**
   * Click an element inside the MCP section content.
   * Uses force:true because Playwright's pointer hit-testing fails on
   * elements inside SectionCard's overflow-hidden + max-h animated wrapper.
   */
  async clickInMcp(locator: Locator) {
    await expect(locator).toBeVisible();
    await locator.click({ force: true });
  }
  // ── MCP Server Cards (PR #345, #346) ──────────────────────────────────

  getPresetCard(label: string): Locator {
    return this.mcpSection.getByRole("button").filter({ hasText: label });
  }

  getServerCard(name: string): Locator {
    return this.mcpSection
      .locator(".rounded-lg.border.p-3")
      .filter({ has: this.page.getByText(name, { exact: true }) });
  }

  getServerToggle(name: string): Locator {
    return this.getServerCard(name).getByRole("switch");
  }

  getServerDeleteButton(name: string): Locator {
    // Delete button is the LAST button (role="button") in the card actions
    return this.getServerCard(name).first().getByRole("button").last();
  }
}
