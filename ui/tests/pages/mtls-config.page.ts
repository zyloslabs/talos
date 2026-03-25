import type { Page, Locator } from "@playwright/test";

/**
 * Page Object for the mTLS configuration section in the Setup Wizard's
 * "Register App" step (step 1).
 */
export class MtlsConfigPage {
  readonly page: Page;

  // mTLS toggle
  readonly mtlsToggle: Locator;
  readonly mtlsLabel: Locator;

  // Certificate fields (visible only when toggle is on)
  readonly clientCertInput: Locator;
  readonly clientKeyInput: Locator;
  readonly caCertInput: Locator;

  // Help text
  readonly helpText: Locator;

  constructor(page: Page) {
    this.page = page;

    // Toggle
    this.mtlsToggle = page.getByRole("switch", { name: /mTLS/i });
    this.mtlsLabel = page.getByText("Enable mTLS");

    // Certificate fields
    this.clientCertInput = page.getByPlaceholder("Client Certificate vault ref or path");
    this.clientKeyInput = page.getByPlaceholder("Client Key vault ref or path");
    this.caCertInput = page.getByPlaceholder("CA Certificate (optional)");

    // Help text
    this.helpText = page.getByText(/Playwright will use these certificates for mutual TLS/);
  }

  async enableMtls() {
    const isChecked = await this.mtlsToggle.getAttribute("aria-checked");
    if (isChecked !== "true") {
      await this.mtlsToggle.click();
    }
  }

  async disableMtls() {
    const isChecked = await this.mtlsToggle.getAttribute("aria-checked");
    if (isChecked === "true") {
      await this.mtlsToggle.click();
    }
  }

  async fillCertFields(cert: string, key: string, ca?: string) {
    await this.clientCertInput.fill(cert);
    await this.clientKeyInput.fill(key);
    if (ca) {
      await this.caCertInput.fill(ca);
    }
  }
}
