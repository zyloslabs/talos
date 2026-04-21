/**
 * GitHub export coverage (issue #551). PR #534 wired real ZIP packaging via
 * archiver. The current UI surface is "Export to GitHub" (push-to-repo) — we
 * verify the flow invokes the API and the response carries the expected
 * fields. A pure ZIP download endpoint is tracked separately if/when added.
 */
import { test, expect } from "@playwright/test";
import { mockApi } from "./fixtures/route";
import { makeApplication, makeTest, makeTestRun, makeVaultRole, resetFactoryCounter } from "./fixtures/factories";

const app = makeApplication({ id: "app-export-1", name: "Export App" });

test.beforeEach(async ({ page }) => {
  resetFactoryCounter();
  await mockApi(page, [
    { url: "**/api/talos/applications", method: "GET", body: [app] },
    { url: "**/api/talos/tests", method: "GET", body: [makeTest({ applicationId: app.id })] },
    { url: /\/api\/talos\/tests\?.*/, method: "GET", body: [makeTest({ applicationId: app.id })] },
    { url: "**/api/talos/test-runs**", method: "GET", body: [makeTestRun({ applicationId: app.id })] },
    { url: "**/api/talos/vault-roles**", method: "GET", body: [makeVaultRole({ applicationId: app.id })] },
    { url: `**/api/talos/applications/${app.id}/export-info`, method: "GET", body: { exportRepoUrl: null } },
  ]);
});

test.describe("GitHub export", () => {
  // AC: #551 export endpoint produces a non-empty body — driven via the dialog
  test("export dialog drives the export endpoint and shows success", async ({ page }) => {
    let exportCalled = false;
    let capturedBody: { targetRepo?: string; branch?: string; createIfNotExists?: boolean } | null = null;
    await mockApi(page, [
      {
        url: `**/api/talos/applications/${app.id}/export-to-github`,
        method: "POST",
        handler: async (route) => {
          exportCalled = true;
          capturedBody = JSON.parse(route.request().postData() ?? "{}");
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              success: true,
              repository: "owner/exported",
              repoUrl: "https://github.com/owner/exported",
              commitSha: "abc123",
              filesUpdated: 4,
              created: true,
            }),
          });
        },
      },
    ]);

    await page.goto("/talos/tests");
    await page.getByRole("combobox").first().click();
    await page.getByRole("option").filter({ hasText: "Export App" }).first().click();
    await page.getByRole("button", { name: /Export to GitHub/i }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Fill the form and click the dialog's own Export button (not a raw fetch).
    await dialog.getByLabel("Target repository").fill("owner/exported");
    await dialog.getByLabel("Branch").fill("main");
    await dialog.getByRole("button", { name: /^Export$/ }).click();

    await expect.poll(() => exportCalled, { timeout: 5000 }).toBe(true);
    expect(capturedBody?.targetRepo).toBe("owner/exported");
    expect(capturedBody?.branch).toBe("main");
    expect(typeof capturedBody?.createIfNotExists).toBe("boolean");

    // Success state should render and link to the new repo.
    await expect(dialog.getByText(/exported successfully/i)).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByRole("link", { name: /View on GitHub/i })).toBeVisible();
  });
});
