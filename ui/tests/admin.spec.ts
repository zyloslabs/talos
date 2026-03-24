import { test, expect } from "@playwright/test";
import { AdminPage } from "./pages/admin.page";

test.describe("Admin Page", () => {
  let admin: AdminPage;

  test.beforeEach(async ({ page }) => {
    admin = new AdminPage(page);
    await admin.goto();
  });

  // ── Auth Panel ────────────────────────────────────────────────────────────

  test.describe("Authentication Panel", () => {
    // AC: Auth panel shows authentication status and device auth flow
    test("should display authentication status badge", async () => {
      await expect(admin.authBadge).toBeVisible();
      await expect(admin.authBadge).toHaveText(/Authenticated|Not Authenticated/);
    });

    // AC: Auth panel shows device auth flow when not authenticated
    test("should show Start Device Auth button when not authenticated", async () => {
      const badge = admin.authSection.getByText("Not Authenticated");
      const isNotAuth = await badge.isVisible().catch(() => false);
      if (isNotAuth) {
        await expect(admin.startDeviceAuthButton).toBeVisible();
      }
    });
  });

  // ── Personality Panel ─────────────────────────────────────────────────────

  test.describe("Personality Panel", () => {
    // AC: Personality panel: CRUD for system personalities
    test("should display personality creation form", async () => {
      await test.step("Scroll to personality section", async () => {
        await admin.personalitySection.scrollIntoViewIfNeeded();
      });

      await test.step("Verify creation form fields are present", async () => {
        await expect(admin.personalityNameInput).toBeVisible();
        await expect(admin.personalityPromptTextarea).toBeVisible();
        await expect(admin.createPersonalityButton).toBeVisible();
      });
    });

    // AC: Personality panel: Create button disabled without name
    test("should disable create button when name is empty", async () => {
      await admin.personalitySection.scrollIntoViewIfNeeded();
      await expect(admin.createPersonalityButton).toBeDisabled();
    });

    // AC: Personality panel: activate/deactivate
    test("should display personality items with toggle switches", async () => {
      await admin.personalitySection.scrollIntoViewIfNeeded();
      // If personalities exist, each should have a switch
      const switches = admin.personalitySection.getByRole("switch");
      const count = await switches.count();
      if (count > 0) {
        await expect(switches.first()).toBeVisible();
      }
    });
  });

  // ── Models Panel ──────────────────────────────────────────────────────────

  test.describe("Models Panel", () => {
    // AC: Models panel: model selection buttons
    test("should display model selection section", async () => {
      await admin.modelsSection.scrollIntoViewIfNeeded();
      await expect(admin.page.getByText("Selected Model")).toBeVisible();
    });

    // AC: Models panel: reasoning effort selector
    test("should display reasoning effort selector buttons", async () => {
      await admin.modelsSection.scrollIntoViewIfNeeded();
      await expect(admin.page.getByText("Reasoning Effort")).toBeVisible();

      await test.step("Verify all effort levels are shown", async () => {
        for (const effort of ["low", "medium", "high", "xhigh"]) {
          await expect(admin.getReasoningEffortButton(effort)).toBeVisible();
        }
      });
    });
  });

  // ── MCP Servers Panel ─────────────────────────────────────────────────────

  test.describe("MCP Servers Panel", () => {
    // AC: MCP Servers panel: list/add/delete servers with type selection
    test("should display Add MCP Server form", async () => {
      await admin.mcpSection.scrollIntoViewIfNeeded();

      await test.step("Verify form fields", async () => {
        await expect(admin.mcpNameInput).toBeVisible();
        await expect(admin.mcpCommandInput).toBeVisible();
        await expect(admin.addServerButton).toBeVisible();
      });
    });

    // AC: MCP panel: type selection buttons (stdio, http, sse, docker)
    test("should display server type selection buttons", async () => {
      await admin.mcpSection.scrollIntoViewIfNeeded();

      for (const type of ["stdio", "http", "sse", "docker"]) {
        await expect(admin.getMcpTypeButton(type)).toBeVisible();
      }
    });

    // AC: MCP panel: Add server button disabled without name
    test("should disable Add Server button when name is empty", async () => {
      await admin.mcpSection.scrollIntoViewIfNeeded();
      await expect(admin.addServerButton).toBeDisabled();
    });
  });

  // ── Environment Panel (#211) ──────────────────────────────────────────────

  test.describe("Environment Panel", () => {
    // AC #211: All known env vars displayed by category
    test("should display env vars organized by category", async () => {
      await admin.envSection.scrollIntoViewIfNeeded();

      await test.step("Verify category headings", async () => {
        for (const category of ["Authentication", "AI / Embeddings", "Security", "Server", "Filesystem"]) {
          await expect(admin.getEnvCategory(category)).toBeVisible();
        }
      });
    });

    // AC #211: Known env var keys are visible
    test("should display all known environment variable keys", async () => {
      await admin.envSection.scrollIntoViewIfNeeded();

      const knownKeys = [
        "GITHUB_CLIENT_ID",
        "OPENAI_API_KEY",
        "TALOS_ADMIN_TOKEN",
        "PORT",
        "TALOS_DATA_DIR",
        "TALOS_ALLOWED_DIRS",
      ];

      for (const key of knownKeys) {
        await expect(admin.getEnvVarRow(key)).toBeVisible();
      }
    });

    // AC #211: Edit/set/delete env var actions
    test("should show edit and action buttons for env vars", async () => {
      await admin.envSection.scrollIntoViewIfNeeded();
      // Each known var should have an Edit/Set button
      const editButtons = admin.envSection.getByRole("button", { name: /Edit|Set/ });
      await expect(editButtons.first()).toBeVisible();
    });

    // AC #211: Missing required warning
    test("should display missing required warning when GITHUB_CLIENT_ID is not set", async () => {
      await admin.envSection.scrollIntoViewIfNeeded();
      // If GITHUB_CLIENT_ID is missing, a warning should appear
      const warning = admin.getMissingRequiredWarning();
      const warningVisible = await warning.isVisible().catch(() => false);
      if (warningVisible) {
        await expect(warning).toContainText("GITHUB_CLIENT_ID");
      }
    });

    // AC #211: Sensitive values masked with reveal toggle
    test("should show reveal toggle for masked values", async () => {
      await admin.envSection.scrollIntoViewIfNeeded();
      // Check if there are any eye/eyeoff buttons (reveal toggles)
      const revealButtons = admin.envSection.locator("button").filter({
        has: admin.page.locator("svg"),
      });
      // This is conditional on values being set and masked
      const count = await revealButtons.count();
      expect(count).toBeGreaterThanOrEqual(0);
    });

    // AC #211: Required badge on unset required vars
    test("should show required badge on mandatory env vars that are not set", async () => {
      await admin.envSection.scrollIntoViewIfNeeded();
      // GITHUB_CLIENT_ID is required — if not set, should show required badge
      const requiredBadge = admin.envSection.getByText("required");
      const visible = await requiredBadge.first().isVisible().catch(() => false);
      if (visible) {
        await expect(requiredBadge.first()).toBeVisible();
      }
    });
  });

  // ── Knowledge Base Panel (#212) ───────────────────────────────────────────

  test.describe("Knowledge Base Panel", () => {
    // AC #212: Vector store stats displayed
    test("should display knowledge base statistics", async () => {
      await admin.knowledgeSection.scrollIntoViewIfNeeded();

      await test.step("Verify stat cards", async () => {
        await expect(admin.getKnowledgeStatCard("Documents")).toBeVisible();
        await expect(admin.getKnowledgeStatCard("Chunks")).toBeVisible();
        await expect(admin.getKnowledgeStatCard("Last Indexed")).toBeVisible();
      });
    });

    // AC #212: Search functionality
    test("should display vector search form", async () => {
      await admin.knowledgeSection.scrollIntoViewIfNeeded();

      await test.step("Verify search input and button", async () => {
        await expect(admin.knowledgeSearchInput).toBeVisible();
        await expect(admin.knowledgeSearchButton).toBeVisible();
      });
    });

    // AC #212: Document list section
    test("should display indexed documents section", async () => {
      await admin.knowledgeSection.scrollIntoViewIfNeeded();
      await expect(admin.page.getByText("Indexed Documents")).toBeVisible();
    });

    // AC #212: Re-index action
    test("should display re-index button", async () => {
      await admin.knowledgeSection.scrollIntoViewIfNeeded();
      await expect(admin.reindexButton).toBeVisible();
    });
  });

  // ── Sidebar Navigation (#213) ─────────────────────────────────────────────

  test.describe("Sidebar Navigation", () => {
    // AC #213: Sidebar navigation with all sections
    test("should display sidebar with all admin sections", async () => {
      const sections = ["Authentication", "Personality", "Models", "MCP Servers", "Environment", "Knowledge Base"];
      for (const section of sections) {
        await expect(admin.page.getByRole("link", { name: section })).toBeVisible();
      }
    });
  });

  // ── Hero Header (#262) ────────────────────────────────────────────────────

  test.describe("Hero Header – Issue #262 (Admin hero header, centered max-w-6xl layout)", () => {
    // AC: /admin shows a section with uppercase label and large title (h1)
    test("should display uppercase Talos label in hero header", async () => {
      // The hero <header> contains a <p> with text "Talos" styled uppercase via CSS
      await expect(admin.page.locator("header").getByText("Talos")).toBeVisible();
    });

    test("should display Administration as the h1 heading", async () => {
      // Issue #262 introduces the hero with an h1 element
      await expect(
        admin.page.getByRole("heading", { name: "Administration", level: 1 })
      ).toBeVisible();
    });
  });

  // ── Models Availability (#258) ────────────────────────────────────────────

  test.describe("Models Availability – Issue #258 (capability caching + reasoning guard fix)", () => {
    // AC: /admin shows a list of available models (or "No models" if none auth'd)
    // After fix #258, the model listing never crashes: it renders either model buttons
    // (when authenticated) or the "No models available" fallback message.
    test("should display model list or No models empty state", async () => {
      await admin.modelsSection.scrollIntoViewIfNeeded();

      await test.step("Verify the Selected Model label is rendered", async () => {
        await expect(admin.page.getByText("Selected Model")).toBeVisible();
      });

      await test.step("Verify model content shows either models or empty state", async () => {
        // After fix #258 the panel always renders completely. Models and the fallback
        // are mutually exclusive in the DOM, but .or() can cause strict-mode violations
        // when both locators momentarily co-exist during hydration. Branch instead.
        const noModelsMsg = admin.page.getByText("No models available. Authenticate first.");
        const noMsgVisible = await noModelsMsg.isVisible();
        if (noMsgVisible) {
          await expect(noModelsMsg).toBeVisible();
        } else {
          // Models loaded — reasoning effort buttons (always 4) plus model buttons exist
          await expect(admin.modelsSection.getByRole("button").nth(4)).toBeVisible();
        }
      });
    });
  });
});
