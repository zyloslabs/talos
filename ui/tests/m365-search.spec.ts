import { test, expect, type Page } from "@playwright/test";
import { M365SearchPage } from "./pages/m365-search.page";

/** Navigate to the wizard's Upload Docs step (step 2) by creating an app first. */
async function goToUploadDocsStep(page: Page, appName: string) {
  await page.goto("/talos/setup");
  // Mock the create application API so we don't need a running backend
  await page.route("**/api/talos/applications", (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: `app-${Date.now()}`, name: body.name, status: "active" }),
      });
    }
    return route.continue();
  });
  // Mock M365 status (default: disabled)
  await page.route("**/api/talos/m365/status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "disabled", message: "M365 integration is not enabled" }),
    }),
  );
  await page.getByPlaceholder("Application name").fill(appName);
  await page.getByRole("button", { name: "Create Application" }).click();
  await expect(page.getByText("Upload Docs")).toBeVisible({ timeout: 5000 });
}

test.describe("M365 Document Search (#318)", () => {
  let m365: M365SearchPage;

  // ── Tab UI ────────────────────────────────────────────────────────────────

  test.describe("Upload Docs Tab Switcher", () => {
    // AC #318: "Upload Docs" step has a tab/toggle: "Upload Local Files" | "Search M365"
    test("should display both tabs in Upload Docs step", async ({ page }) => {
      m365 = new M365SearchPage(page);
      await goToUploadDocsStep(page, "E2E Tab Display App");

      await expect(m365.uploadLocalTab).toBeVisible();
      await expect(m365.searchM365Tab).toBeVisible();
    });

    // AC #318: Tab switching works correctly
    test("should switch between Upload Local and Search M365 tabs", async ({ page }) => {
      m365 = new M365SearchPage(page);
      await goToUploadDocsStep(page, "E2E Tab Switch App");

      await test.step("Switch to M365 tab", async () => {
        await m365.switchToM365Tab();
        await expect(m365.searchInput).toBeVisible();
      });

      await test.step("Switch back to local tab", async () => {
        await m365.switchToLocalTab();
        await expect(m365.searchInput).not.toBeVisible();
      });
    });
  });

  // ── Session Status ────────────────────────────────────────────────────────

  test.describe("M365 Session Status", () => {
    // AC #318: M365 tab shows session status badge (active/expired/error) via GET /api/talos/m365/status
    test("should display session status badge on M365 tab", async ({ page }) => {
      m365 = new M365SearchPage(page);
      await goToUploadDocsStep(page, "E2E Status App");
      await m365.switchToM365Tab();

      await expect(m365.statusBadge).toBeVisible();
    });

    // AC #318: M365 tab disabled with tooltip when m365.enabled === false
    test("should show M365 Disabled badge when M365 is not configured", async ({ page }) => {
      m365 = new M365SearchPage(page);
      await goToUploadDocsStep(page, "E2E Disabled App");
      await m365.switchToM365Tab();

      // Default mock returns status: "disabled"
      await expect(m365.statusDisabled).toBeVisible();
    });
  });

  // ── Search Input & Results ────────────────────────────────────────────────

  test.describe("Search Functionality", () => {
    // AC #318: Search input field sends query to POST /api/talos/m365/search
    test("should display search input and button on M365 tab", async ({ page }) => {
      m365 = new M365SearchPage(page);
      await goToUploadDocsStep(page, "E2E Search Input App");
      await m365.switchToM365Tab();

      await expect(m365.searchInput).toBeVisible();
      await expect(m365.searchInput).toHaveAttribute("placeholder", "Search M365 documents...");
      await expect(m365.searchButton).toBeVisible();
    });

    // AC #318: Search button disabled when query is empty
    test("should disable search button when query is empty", async ({ page }) => {
      m365 = new M365SearchPage(page);
      await goToUploadDocsStep(page, "E2E Empty Query App");
      await m365.switchToM365Tab();

      await expect(m365.searchButton).toBeDisabled();
    });

    // AC #318: Search results displayed as a list with document title, snippet, and file type icon
    test("should display search results with title, snippet, and file type after search", async ({ page }) => {
      m365 = new M365SearchPage(page);
      await goToUploadDocsStep(page, "E2E Results App");

      await test.step("Mock search API and switch to M365 tab", async () => {
        await page.route("**/api/talos/m365/search", (route) =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              results: [
                { title: "Test PRD Document", snippet: "Product requirements for the Q2 release", url: "https://sharepoint.com/doc1", fileType: "docx" },
                { title: "Security Policy", snippet: "Corporate security policy version 3", url: "https://sharepoint.com/doc2", fileType: "pdf" },
              ],
            }),
          }),
        );
        await m365.switchToM365Tab();
      });

      await test.step("Perform search", async () => {
        await m365.search("requirements");
      });

      await test.step("Verify results", async () => {
        await expect(m365.getResultByTitle("Test PRD Document")).toBeVisible();
        await expect(m365.getResultByTitle("Security Policy")).toBeVisible();
        await expect(page.getByText("Product requirements for the Q2 release")).toBeVisible();
        await expect(page.getByText("DOCX")).toBeVisible();
        await expect(page.getByText("PDF")).toBeVisible();
      });
    });

    // AC #318: Checkbox selection to pick multiple documents for fetching
    test("should allow selecting multiple results with checkboxes", async ({ page }) => {
      m365 = new M365SearchPage(page);
      await goToUploadDocsStep(page, "E2E Checkbox App");

      await page.route("**/api/talos/m365/search", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            results: [
              { title: "Doc Alpha", snippet: "Alpha content", url: "https://sp.com/a", fileType: "docx" },
              { title: "Doc Beta", snippet: "Beta content", url: "https://sp.com/b", fileType: "pdf" },
            ],
          }),
        }),
      );
      await m365.switchToM365Tab();
      await m365.search("test docs");

      await test.step("Select results and verify Fetch button", async () => {
        await m365.selectResult("Doc Alpha");
        await m365.selectResult("Doc Beta");
        await expect(m365.fetchSelectedButton).toBeVisible();
        await expect(m365.fetchSelectedButton).toContainText("Fetch Selected (2)");
      });
    });

    // AC #318: "Fetch & Ingest" button calls POST /api/talos/m365/fetch for each selected document
    test("should call fetch API for each selected document when Fetch Selected is clicked", async ({ page }) => {
      m365 = new M365SearchPage(page);
      await goToUploadDocsStep(page, "E2E Fetch App");

      const fetchCalls: string[] = [];

      await test.step("Mock APIs", async () => {
        await page.route("**/api/talos/m365/search", (route) =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              results: [
                { title: "Fetch Doc 1", snippet: "Content 1", url: "https://sp.com/1", fileType: "docx" },
                { title: "Fetch Doc 2", snippet: "Content 2", url: "https://sp.com/2", fileType: "pdf" },
              ],
            }),
          }),
        );

        await page.route("**/api/talos/m365/fetch", (route) => {
          const body = route.request().postDataJSON();
          fetchCalls.push(body.url);
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ content: "# Markdown content", savedPath: "/docs/test.md" }),
          });
        });

        await page.route("**/api/talos/applications/*/ingest", (route) =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ chunksCreated: 5, documentId: "doc-1" }),
          }),
        );
      });

      await test.step("Search, select, and fetch", async () => {
        await m365.switchToM365Tab();
        await m365.search("fetch test");
        await m365.selectResult("Fetch Doc 1");
        await m365.selectResult("Fetch Doc 2");
        await m365.fetchSelectedButton.click();
      });

      await test.step("Verify API calls were made", async () => {
        await expect(page.getByText(/chunks/)).toBeVisible({ timeout: 10000 });
        expect(fetchCalls).toHaveLength(2);
        expect(fetchCalls).toContain("https://sp.com/1");
        expect(fetchCalls).toContain("https://sp.com/2");
      });
    });
  });
});
