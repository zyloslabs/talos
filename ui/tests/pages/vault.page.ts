import type { Page, Locator } from "@playwright/test";

/**
 * Page Object for the Vault Roles management page (`/talos/vault`).
 *
 * Covers the #531 Edit Vault Role dialog along with the list affordances and
 * the existing Add Vault Role dialog where those interactions are needed as
 * pre-conditions.
 */
export class VaultPage {
  readonly page: Page;

  // Page header
  readonly heading: Locator;
  readonly addRoleButton: Locator;
  readonly emptyState: Locator;

  // Edit dialog
  readonly editDialog: Locator;
  readonly editDialogTitle: Locator;
  readonly editNameInput: Locator;
  readonly editDescriptionInput: Locator;
  readonly editUsernameRefInput: Locator;
  readonly editPasswordRefInput: Locator;
  readonly editAdditionalRefsTextarea: Locator;
  readonly editAdditionalRefsError: Locator;
  readonly editSaveButton: Locator;
  readonly editCancelButton: Locator;

  constructor(page: Page) {
    this.page = page;

    this.heading = page.getByRole("heading", { name: "Vault Roles", exact: true });
    this.addRoleButton = page.getByRole("button", { name: "Add Vault Role" });
    this.emptyState = page.getByText("No vault roles yet");

    // The edit dialog is the one titled "Edit Vault Role" — scope all
    // locators to it to avoid accidentally matching the Add dialog's fields.
    this.editDialog = page.getByRole("dialog").filter({
      has: page.getByRole("heading", { name: "Edit Vault Role" }),
    });
    this.editDialogTitle = this.editDialog.getByRole("heading", { name: "Edit Vault Role" });
    this.editNameInput = this.editDialog.getByPlaceholder("Admin User");
    this.editDescriptionInput = this.editDialog.getByPlaceholder("Optional description");
    this.editUsernameRefInput = this.editDialog.getByPlaceholder("vault:app/admin/username");
    this.editPasswordRefInput = this.editDialog.getByPlaceholder("vault:app/admin/password");
    this.editAdditionalRefsTextarea = this.editDialog.getByPlaceholder(
      '{ "totp": "vault:app/admin/totp" }',
    );
    this.editAdditionalRefsError = this.editDialog.getByTestId("vault-role-refs-error");
    this.editSaveButton = this.editDialog.getByRole("button", { name: "Save Changes" });
    this.editCancelButton = this.editDialog.getByRole("button", { name: "Cancel" });
  }

  async goto() {
    await this.page.goto("/talos/vault");
  }

  /** Locate the card for a role by its visible name. */
  roleCard(name: string): Locator {
    return this.page
      .getByTestId("vault-role-card")
      .filter({ has: this.page.getByRole("heading", { name, exact: true }) })
      .first();
  }

  /** Click the Edit button on the card for a given role. */
  async openEditDialog(roleName: string) {
    const card = this.roleCard(roleName);
    await card.getByRole("button", { name: "Edit" }).click();
    await this.editDialog.waitFor({ state: "visible" });
  }
}
