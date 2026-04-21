/**
 * E2E coverage for Vault full CRUD + cross-feature usage (issue #544).
 * Pairs with #531 / #536 (vault delete UI bug regression).
 */
import { test, expect } from "@playwright/test";
import { mockApi } from "./fixtures/route";
import { makeApplication, makeVaultRole, resetFactoryCounter } from "./fixtures/factories";
import { VaultPage } from "./pages/vault.page";

const app = makeApplication({ id: "app-vault-1", name: "Vault Demo" });
const role1 = makeVaultRole({ id: "vr-1", applicationId: app.id, name: "Admin Account", roleType: "admin" });
const role2 = makeVaultRole({ id: "vr-2", applicationId: app.id, name: "Standard Account", roleType: "standard" });

test.describe("Vault — full CRUD", () => {
  test.beforeEach(async ({ page }) => {
    resetFactoryCounter();
    await mockApi(page, [
      { url: "**/api/talos/applications", method: "GET", body: [app] },
      { url: "**/api/talos/vault-roles**", method: "GET", body: [role1, role2] },
    ]);
  });

  // AC: #544 list renders vault roles
  test("renders vault role list", async ({ page }) => {
    const vault = new VaultPage(page);
    await vault.goto();
    await expect(vault.heading).toBeVisible();
    await expect(page.getByRole("heading", { name: "Admin Account" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Standard Account" })).toBeVisible();
  });

  // AC: #544 create dialog POSTs and refreshes list
  test("create button opens add dialog", async ({ page }) => {
    const vault = new VaultPage(page);
    await vault.goto();
    await vault.addRoleButton.click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  // AC: #544 delete confirms then DELETEs (regression for #536)
  test("delete invokes the DELETE endpoint and removes the row", async ({ page }) => {
    let deleteCalled = false;
    await mockApi(page, [
      {
        url: /\/api\/talos\/vault-roles\/[^/]+/,
        method: "DELETE",
        handler: async (route) => {
          deleteCalled = true;
          await route.fulfill({ status: 204, body: "" });
        },
      },
    ]);
    page.on("dialog", (d) => d.accept());

    const vault = new VaultPage(page);
    await vault.goto();

    const card = vault.roleCard("Admin Account");
    await expect(card).toBeVisible();

    // Delete button is part of the Vault Manager UI (#531). If it's missing
    // here, the regression we are guarding (#536) has already silently
    // returned — fail loudly rather than soft-skip.
    const deleteBtn = card.getByRole("button", { name: /^Delete$/ });
    await expect(deleteBtn, "Delete button must be rendered on the vault role card").toBeVisible();

    // After the user confirms, the page invalidates the roles query and
    // re-fetches — register the post-delete GET handler now so it wins over
    // the beforeEach handler for the refresh.
    await mockApi(page, [
      { url: "**/api/talos/vault-roles**", method: "GET", body: [role2] },
    ]);

    await deleteBtn.click();

    await expect.poll(() => deleteCalled, { timeout: 5000 }).toBe(true);

    // Row should disappear once the refreshed list comes back without it.
    await expect(vault.roleCard("Admin Account")).toHaveCount(0, { timeout: 5000 });
    await expect(page.getByRole("heading", { name: "Standard Account" })).toBeVisible();
  });
});
