import type { Page, Locator } from "@playwright/test";

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

  // Knowledge panel
  readonly knowledgeSection: Locator;
  readonly knowledgeSearchInput: Locator;
  readonly knowledgeSearchButton: Locator;
  readonly reindexButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Admin Settings" });

    // Sidebar
    this.authLink = page.getByRole("link", { name: "Authentication" });
    this.personalityLink = page.getByRole("link", { name: "Personality" });
    this.modelsLink = page.getByRole("link", { name: "Models" });
    this.mcpLink = page.getByRole("link", { name: "MCP Servers" });
    this.envLink = page.getByRole("link", { name: "Environment" });
    this.knowledgeLink = page.getByRole("link", { name: "Knowledge Base" });

    // Sections (by id-based locator text)
    this.authSection = page.locator("#auth");
    this.personalitySection = page.locator("#personality");
    this.modelsSection = page.locator("#models");
    this.mcpSection = page.locator("#mcp");
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

    // Env
    // (dynamic — env vars by category)

    // Knowledge
    this.knowledgeSearchInput = page.getByPlaceholder("Search knowledge base...");
    this.knowledgeSearchButton = this.knowledgeSection.getByRole("button", { name: "Search" });
    this.reindexButton = page.getByRole("button", { name: /Re-index/ });
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
    return this.envSection.getByText(key).locator("..").locator("..").getByRole("button", { name: /Edit|Set/ });
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
}
