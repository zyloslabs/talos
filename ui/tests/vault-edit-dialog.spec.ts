/**
 * E2E tests for the Vault Role Edit dialog (#531, epic #524).
 *
 * Issue #531 — "B1: Vault entry edit dialog" — adds inline edit of vault
 * role entries in `ui/components/talos/vault-manager.tsx` so users can
 * update credential references without losing downstream references.
 *
 * Acceptance criteria → test coverage:
 *   AC1 "Each row exposes an Edit affordance"
 *        → describe "Edit affordance" (2 tests)
 *   AC2 "Clicking Edit opens a dialog pre-populated with the entry's name,
 *        type, and metadata"
 *        → describe "Dialog pre-population" (2 tests)
 *   AC3 "Submitting calls the vault-role update endpoint and updates the
 *        row" (implementation uses PATCH /api/talos/vault-roles/:id)
 *        → describe "Save flow" (2 tests)
 *   AC4 "Validation matches the Create dialog (same schema)"
 *        → describe "Validation" (4 tests — required fields + JSON errors)
 *   AC5 "Cancel discards changes"
 *        → describe "Cancel flow" (2 tests)
 *   AC8 "No accessibility regressions (focus trap works; Esc closes)"
 *        → describe "Accessibility" (1 test — Esc closes)
 *
 * AC6 (toast on success/error) and AC7 (component unit test) are handled
 * outside the e2e layer — toast wiring is in the component's mutation
 * callbacks and the Vitest unit test lives in `vault-manager.test.tsx`.
 */

import { test, expect, type Page, type Route } from "@playwright/test";
import { VaultPage } from "./pages/vault.page";

// ── Fixture data ────────────────────────────────────────────────────────────

const APP_ID = "app-vault-test";

const baseRole = {
  id: "role-1",
  applicationId: APP_ID,
  roleType: "admin" as const,
  name: "Admin User",
  description: "Primary admin role",
  usernameRef: "vault:app/admin/username",
  passwordRef: "vault:app/admin/password",
  additionalRefs: { totp: "vault:app/admin/totp" },
  isActive: true,
  metadata: {},
  createdAt: "2026-04-01T00:00:00Z",
  updatedAt: "2026-04-01T00:00:00Z",
};

// ── Helpers ─────────────────────────────────────────────────────────────────

interface MockState {
  roles: typeof baseRole[];
  updateCalls: Array<{ id: string; body: Record<string, unknown> }>;
  updateShouldFail: boolean;
}

async function setupVaultMocks(page: Page, state: MockState) {
  await page.route("**/api/talos/applications", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ id: APP_ID, name: "Test App", status: "active" }]),
    }),
  );

  await page.route(/\/api\/talos\/vault-roles(\?.*)?$/, (route: Route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(state.roles),
      });
    }
    return route.continue();
  });

  await page.route(/\/api\/talos\/vault-roles\/[^?]+$/, async (route: Route) => {
    const method = route.request().method();
    const url = route.request().url();
    const id = url.split("/").pop()!.split("?")[0];

    if (method === "PATCH" || method === "PUT") {
      const body = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
      state.updateCalls.push({ id, body });
      if (state.updateShouldFail) {
        return route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "update failed" }),
        });
      }
      const idx = state.roles.findIndex((r) => r.id === id);
      if (idx !== -1) {
        state.roles[idx] = {
          ...state.roles[idx],
          ...(body as Partial<typeof baseRole>),
          updatedAt: new Date().toISOString(),
        };
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(state.roles[idx]),
      });
    }
    return route.continue();
  });
}

function freshState(): MockState {
  return {
    roles: [structuredClone(baseRole)],
    updateCalls: [],
    updateShouldFail: false,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

test.describe("Vault Edit Dialog (#531)", () => {
  let vault: VaultPage;
  let state: MockState;

  test.beforeEach(async ({ page }) => {
    state = freshState();
    await setupVaultMocks(page, state);
    vault = new VaultPage(page);
    await vault.goto();
    await expect(vault.heading).toBeVisible();
  });

  // ── AC1: Edit affordance ──────────────────────────────────────────────────
  test.describe("Edit affordance", () => {
    // AC1: Each row in the vault list exposes an "Edit" affordance
    test("should show an Edit button on each role card", async ({ page }) => {
      await expect(page.getByRole("heading", { name: "Admin User" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
    });

    // AC1: Edit button is actionable (enabled)
    test("Edit button should be enabled", async ({ page }) => {
      await expect(page.getByRole("button", { name: "Edit" })).toBeEnabled();
    });
  });

  // ── AC2: Dialog pre-population ────────────────────────────────────────────
  test.describe("Dialog pre-population", () => {
    // AC2: Clicking Edit opens dialog with pre-populated fields
    test("should open dialog with existing name, description and refs", async () => {
      await vault.openEditDialog("Admin User");

      await expect(vault.editDialogTitle).toBeVisible();
      await expect(vault.editNameInput).toHaveValue("Admin User");
      await expect(vault.editDescriptionInput).toHaveValue("Primary admin role");
      await expect(vault.editUsernameRefInput).toHaveValue("vault:app/admin/username");
      await expect(vault.editPasswordRefInput).toHaveValue("vault:app/admin/password");
    });

    // AC2: additionalRefs metadata serialised as JSON in the textarea
    test("should pre-populate additionalRefs as formatted JSON", async () => {
      await vault.openEditDialog("Admin User");

      const jsonValue = await vault.editAdditionalRefsTextarea.inputValue();
      expect(JSON.parse(jsonValue)).toEqual({ totp: "vault:app/admin/totp" });
    });
  });

  // ── AC3: Save flow ────────────────────────────────────────────────────────
  test.describe("Save flow", () => {
    // AC3: Submitting the dialog calls the update endpoint and closes the dialog
    test("should send updated fields to the API and close the dialog on success", async () => {
      await vault.openEditDialog("Admin User");

      await vault.editNameInput.fill("Admin User (renamed)");
      await vault.editUsernameRefInput.fill("vault:app/admin/username-v2");
      await vault.editSaveButton.click();

      await expect(vault.editDialog).toBeHidden();
      await expect.poll(() => state.updateCalls.length).toBe(1);
      expect(state.updateCalls[0].id).toBe("role-1");
      expect(state.updateCalls[0].body).toMatchObject({
        name: "Admin User (renamed)",
        usernameRef: "vault:app/admin/username-v2",
        passwordRef: "vault:app/admin/password",
      });
    });

    // AC3: additionalRefs edits are serialised back into the update payload
    test("should send edited additionalRefs as an object in the request body", async () => {
      await vault.openEditDialog("Admin User");

      await vault.editAdditionalRefsTextarea.fill(
        JSON.stringify({ totp: "vault:app/admin/totp", otp: "vault:app/admin/otp" }, null, 2),
      );
      await vault.editSaveButton.click();

      await expect(vault.editDialog).toBeHidden();
      await expect.poll(() => state.updateCalls.length).toBe(1);
      expect(state.updateCalls[0].body.additionalRefs).toEqual({
        totp: "vault:app/admin/totp",
        otp: "vault:app/admin/otp",
      });
    });
  });

  // ── AC4: Validation ───────────────────────────────────────────────────────
  test.describe("Validation", () => {
    // AC4: Save disabled when required fields are empty
    test("should disable Save when Role Name is empty", async () => {
      await vault.openEditDialog("Admin User");
      await vault.editNameInput.fill("");
      await expect(vault.editSaveButton).toBeDisabled();
    });

    // AC4: Invalid JSON in additionalRefs shows an error and blocks submit
    test("should show an error for malformed JSON in additional refs", async () => {
      await vault.openEditDialog("Admin User");

      await vault.editAdditionalRefsTextarea.fill("{ not valid json");
      await vault.editSaveButton.click();

      await expect(vault.editAdditionalRefsError).toBeVisible();
      expect(state.updateCalls).toHaveLength(0);
      await expect(vault.editDialog).toBeVisible();
    });

    // AC4: Non-object JSON (e.g. array) is rejected with a precise message
    test("should reject non-object JSON (arrays) in additional refs", async () => {
      await vault.openEditDialog("Admin User");

      await vault.editAdditionalRefsTextarea.fill('["a", "b"]');
      await vault.editSaveButton.click();

      await expect(vault.editAdditionalRefsError).toHaveText(
        "Additional refs must be a JSON object",
      );
      expect(state.updateCalls).toHaveLength(0);
    });

    // AC4: Non-string values in the JSON object are rejected
    test("should reject non-string values inside the additional refs object", async () => {
      await vault.openEditDialog("Admin User");

      await vault.editAdditionalRefsTextarea.fill('{ "totp": 42 }');
      await vault.editSaveButton.click();

      await expect(vault.editAdditionalRefsError).toContainText(
        'Value for "totp" must be a string',
      );
      expect(state.updateCalls).toHaveLength(0);
    });
  });

  // ── AC5: Cancel flow ──────────────────────────────────────────────────────
  test.describe("Cancel flow", () => {
    // AC5: Cancel discards changes without calling the API
    test("should close the dialog without calling PUT when Cancel is clicked", async () => {
      await vault.openEditDialog("Admin User");

      await vault.editNameInput.fill("Throwaway name");
      await vault.editCancelButton.click();

      await expect(vault.editDialog).toBeHidden();
      expect(state.updateCalls).toHaveLength(0);
    });

    // AC5: Re-opening the dialog after cancel shows the original values
    test("should reset to persisted values after a cancelled edit", async () => {
      await vault.openEditDialog("Admin User");
      await vault.editNameInput.fill("Throwaway name");
      await vault.editCancelButton.click();
      await expect(vault.editDialog).toBeHidden();

      await vault.openEditDialog("Admin User");
      await expect(vault.editNameInput).toHaveValue("Admin User");
    });
  });

  // ── AC8: Accessibility ────────────────────────────────────────────────────
  test.describe("Accessibility", () => {
    // AC8: Esc closes the dialog (Radix Dialog primitive preserved)
    test("should close the dialog when Escape is pressed", async ({ page }) => {
      await vault.openEditDialog("Admin User");
      await expect(vault.editDialog).toBeVisible();

      await page.keyboard.press("Escape");

      await expect(vault.editDialog).toBeHidden();
      expect(state.updateCalls).toHaveLength(0);
    });
  });
});
