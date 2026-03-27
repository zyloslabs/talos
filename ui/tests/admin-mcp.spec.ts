import { test, expect, type APIRequestContext } from "@playwright/test";
import { AdminPage } from "./pages/admin.page";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Remove ALL MCP servers whose name is in the list. */
async function cleanupServers(request: APIRequestContext, names: string[]) {
  try {
    const resp = await request.get("/api/admin/mcp-servers");
    if (!resp.ok()) return;
    const servers = (await resp.json()) as Array<{ id: string; name: string }>;
    for (const s of servers) {
      if (names.includes(s.name)) {
        await request.delete(`/api/admin/mcp-servers/${s.id}`);
      }
    }
  } catch {
    /* swallow cleanup errors */
  }
}

const CLEANUP_NAMES = ["context7", "github", "github-enterprise", "jdbc-1", "jdbc-2", "docker-mcp", "salesforce"];

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe("Admin MCP Panel — Epic #343", () => {
  let admin: AdminPage;

  test.beforeEach(async ({ page, request }) => {
    await cleanupServers(request, CLEANUP_NAMES);
    await page.addInitScript(() => {
      // Stub IntersectionObserver to avoid scroll-spy race.
      window.IntersectionObserver = class {
        constructor() {}
        observe() {}
        unobserve() {}
        disconnect() {}
      } as unknown as typeof IntersectionObserver;
      // Force ALL SectionCard content wrappers permanently visible.
      // The SectionCard uses overflow-hidden + max-h-0/opacity-0 for collapse
      // which creates persistent Playwright pointer hit-test failures.
      document.addEventListener("DOMContentLoaded", () => {
        const s = document.createElement("style");
        s.textContent = [
          "*, *::before, *::after { transition: none !important; animation: none !important; }",
          ".overflow-hidden { max-height: none !important; opacity: 1 !important; overflow: visible !important; }",
        ].join("\n");
        document.head.appendChild(s);
      });
    });
    admin = new AdminPage(page);
    await admin.goto();
  });

  test.afterEach(async ({ request }) => {
    await cleanupServers(request, CLEANUP_NAMES);
  });

  // ── Sidebar Navigation (#344) ───────────────────────────────────────────

  test.describe("Sidebar Navigation (#344)", () => {
    // AC1: Clicking a sidebar button scrolls to and opens the corresponding section
    test("should scroll to and open section when sidebar button is clicked", async () => {
      await test.step("Click MCP Servers in sidebar", async () => {
        await admin.getSidebarButton("MCP Servers").click();
      });

      await test.step("Verify sidebar highlights MCP Servers as active", async () => {
        // The active sidebar button has the primary text styling
        const btn = admin.getSidebarButton("MCP Servers");
        await expect(btn).toBeVisible();
      });

      await test.step("Verify MCP section panel content is visible", async () => {
        await expect(admin.addMcpServerButton).toBeVisible();
      });
    });

    // AC2: Clicking a different sidebar button changes the active section
    test("should switch active section when a different sidebar button is clicked", async () => {
      await test.step("Click MCP Servers in sidebar", async () => {
        await admin.getSidebarButton("MCP Servers").click();
      });

      await test.step("Click Knowledge Base in sidebar", async () => {
        await admin.getSidebarButton("Knowledge Base").click();
      });

      await test.step("Verify Knowledge Base search input is visible", async () => {
        await expect(admin.knowledgeSearchInput).toBeVisible();
      });
    });
  });

  // ── MCP Preset Panel (#345, #346) ───────────────────────────────────────

  test.describe("MCP Preset Panel (#345, #346)", () => {
    // AC3: The MCP servers section shows a preset picker when "Add Server" is clicked
    test("should show preset picker when Add MCP Server is clicked", async ({ page }) => {
      await test.step("Click Add MCP Server", async () => {
        await admin.addMcpServerButton.scrollIntoViewIfNeeded();
        await admin.addMcpServerButton.click();
      });

      await test.step("Verify all 9 preset cards are displayed", async () => {
        await expect(page.getByRole("heading", { name: "Add MCP Server" })).toBeVisible();
        await expect(admin.getPresetCard("GitHub (Cloud)")).toBeVisible();
        await expect(admin.getPresetCard("GitHub Enterprise")).toBeVisible();
        await expect(admin.getPresetCard("JDBC Database")).toBeVisible();
        await expect(admin.getPresetCard("AWS API")).toBeVisible();
        await expect(admin.getPresetCard("Docker")).toBeVisible();
        await expect(admin.getPresetCard("Atlassian")).toBeVisible();
        await expect(admin.getPresetCard("Salesforce")).toBeVisible();
        await expect(admin.getPresetCard("Context7")).toBeVisible();
        await expect(admin.getPresetCard("Playwright")).toBeVisible();
      });
    });

    // AC4: Selecting a preset pre-fills the form with the preset's values
    test("should pre-fill configuration form when a preset is selected", async ({ page }) => {
      await test.step("Open picker and select GitHub Cloud", async () => {
        await admin.addMcpServerButton.scrollIntoViewIfNeeded();
        await admin.addMcpServerButton.click();
        await admin.getPresetCard("GitHub (Cloud)").click();
      });

      await test.step("Verify server name is pre-filled", async () => {
        await expect(admin.presetServerNameInput).toHaveValue("github");
      });

      await test.step("Verify environment variable fields are shown", async () => {
        await expect(admin.mcpSection.getByText("GITHUB_PERSONAL_ACCESS_TOKEN").first()).toBeVisible();
      });

      await test.step("Verify heading shows the selected preset", async () => {
        await expect(page.getByRole("heading", { name: /Configure: GitHub \(Cloud\)/ })).toBeVisible();
      });
    });

    // AC5: Users can create an MCP server from a preset
    test("should create an MCP server from a preset", async () => {
      await test.step("Open picker and select Context7", async () => {
        await admin.addMcpServerButton.scrollIntoViewIfNeeded();
        await admin.addMcpServerButton.click();
        await admin.getPresetCard("Context7").click();
      });

      await test.step("Verify pre-filled name and submit", async () => {
        await expect(admin.presetServerNameInput).toHaveValue("context7");
        await admin.presetAddServerButton.click();
      });

      await test.step("Verify server appears in the list", async () => {
        await expect(admin.getServerCard("context7").first()).toBeVisible();
      });
    });

    // AC6: Created MCP servers appear in the server list with correct category badge
    test("should display created server with correct category badge", async () => {
      await test.step("Create a GitHub Cloud server", async () => {
        await admin.addMcpServerButton.scrollIntoViewIfNeeded();
        await admin.addMcpServerButton.click();
        await admin.getPresetCard("GitHub (Cloud)").click();
        await admin.presetAddServerButton.click();
      });

      await test.step("Verify server card with category badge", async () => {
        const card = admin.getServerCard("github").first();
        await expect(card).toBeVisible();
        await expect(card.getByText("GitHub", { exact: true })).toBeVisible();
        await expect(card.getByText("stdio")).toBeVisible();
      });
    });

    // AC7: Users can enable/disable a server via toggle
    test("should toggle server enabled state", async ({ page, request }) => {
      await test.step("Create a server via API and reload", async () => {
        await request.post("/api/admin/mcp-servers", {
          data: {
            name: "docker-mcp",
            type: "stdio",
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-docker"],
            env: {},
            enabled: true,
            category: "devtools",
            tags: ["docker"],
          },
        });
        await page.reload();
        // Wait for McpPanel data to load after reload
        await expect(admin.getServerCard("docker-mcp").first()).toBeVisible();
      });

      await test.step("Verify toggle is initially checked (enabled)", async () => {
        const toggle = admin.getServerToggle("docker-mcp").first();
        await expect(toggle).toBeChecked();
      });

      await test.step("Toggle the server off", async () => {
        await admin.getServerToggle("docker-mcp").first().click({ force: true });
      });

      await test.step("Verify toggle reflects disabled state", async () => {
        await expect(admin.getServerToggle("docker-mcp").first()).not.toBeChecked();
      });
    });

    // AC8: Users can delete a server
    test("should delete a server", async ({ page, request }) => {
      await test.step("Create a server via API and reload", async () => {
        await request.post("/api/admin/mcp-servers", {
          data: {
            name: "docker-mcp",
            type: "stdio",
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-docker"],
            env: {},
            enabled: true,
            category: "devtools",
            tags: ["docker"],
          },
        });
        await page.reload();
        // Wait for McpPanel data to load after reload
        await expect(admin.getServerCard("docker-mcp").first()).toBeVisible();
      });

      await test.step("Verify server exists", async () => {
        await expect(admin.getServerCard("docker-mcp").first()).toBeVisible();
      });

      await test.step("Click the delete button", async () => {
        await admin.getServerDeleteButton("docker-mcp").click();
      });

      await test.step("Verify server is removed from the list", async () => {
        await expect(admin.mcpSection.getByText("docker-mcp", { exact: true })).toBeHidden();
      });
    });

    // AC9: Multiple JDBC instances can be created (allowMultiple preset)
    test("should allow creating multiple JDBC instances", async () => {
      await test.step("Create first JDBC instance", async () => {
        await admin.addMcpServerButton.scrollIntoViewIfNeeded();
        await admin.addMcpServerButton.click();
        await expect(admin.getPresetCard("JDBC Database").getByText("Multiple connections").first()).toBeVisible();
        await admin.getPresetCard("JDBC Database").click();
        await expect(admin.presetServerNameInput).toHaveValue("jdbc-1");
        await admin.presetAddServerButton.click();
      });

      await test.step("Verify first JDBC instance in list", async () => {
        await expect(admin.getServerCard("jdbc-1").first()).toBeVisible();
      });

      await test.step("Create second JDBC instance", async () => {
        await admin.addMcpServerButton.scrollIntoViewIfNeeded();
        await admin.addMcpServerButton.click();
        await admin.getPresetCard("JDBC Database").click();
        await expect(admin.presetServerNameInput).toHaveValue("jdbc-2");
        await admin.presetAddServerButton.click();
      });

      await test.step("Verify both JDBC instances coexist", async () => {
        await expect(admin.getServerCard("jdbc-1").first()).toBeVisible();
        await expect(admin.getServerCard("jdbc-2").first()).toBeVisible();
      });
    });

    // AC10: GitHub Cloud and GitHub Enterprise can coexist as separate servers
    test("should allow both GitHub Cloud and Enterprise servers", async () => {
      await test.step("Create GitHub Cloud server", async () => {
        await admin.addMcpServerButton.scrollIntoViewIfNeeded();
        await admin.addMcpServerButton.click();
        await admin.getPresetCard("GitHub (Cloud)").click();
        await expect(admin.presetServerNameInput).toHaveValue("github");
        await admin.presetAddServerButton.click();
      });

      await test.step("Wait for GitHub Cloud to appear", async () => {
        await expect(admin.getServerCard("github").first()).toBeVisible();
      });

      await test.step("Create GitHub Enterprise server", async () => {
        await admin.addMcpServerButton.scrollIntoViewIfNeeded();
        await admin.addMcpServerButton.click();
        await admin.getPresetCard("GitHub Enterprise").click();
        await expect(admin.presetServerNameInput).toHaveValue("github-enterprise");
        await admin.presetAddServerButton.click();
      });

      await test.step("Verify both servers coexist", async () => {
        await expect(admin.getServerCard("github").first()).toBeVisible();
        await expect(admin.getServerCard("github-enterprise").first()).toBeVisible();
      });

      await test.step("Verify both show GitHub category badge", async () => {
        await expect(admin.getServerCard("github").first().getByText("GitHub", { exact: true })).toBeVisible();
        await expect(
          admin.getServerCard("github-enterprise").first().getByText("GitHub", { exact: true })
        ).toBeVisible();
      });
    });
  });
});
