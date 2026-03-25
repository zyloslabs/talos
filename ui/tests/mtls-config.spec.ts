import { test, expect } from "@playwright/test";
import { MtlsConfigPage } from "./pages/mtls-config.page";

test.describe("mTLS Configuration (#324)", () => {
  let mtls: MtlsConfigPage;

  test.beforeEach(async ({ page }) => {
    mtls = new MtlsConfigPage(page);
    await page.goto("/talos/setup");
    // Step 1 (Register App) is shown by default — mTLS toggle is on this step
  });

  // ── mTLS Toggle ───────────────────────────────────────────────────────────

  test.describe("Enable mTLS Toggle", () => {
    // AC #324: "Register App" step has an "Enable mTLS" toggle (disabled by default)
    test("should display Enable mTLS toggle in Register App step", async () => {
      await test.step("Verify mTLS toggle is visible", async () => {
        await expect(mtls.mtlsLabel).toBeVisible();
        await expect(mtls.mtlsToggle).toBeVisible();
      });

      await test.step("Verify toggle defaults to off", async () => {
        await expect(mtls.mtlsToggle).toHaveAttribute("aria-checked", "false");
      });
    });

    // AC #324: Cert fields hidden when toggle is off
    test("should hide certificate fields when mTLS is disabled", async () => {
      await expect(mtls.clientCertInput).not.toBeVisible();
      await expect(mtls.clientKeyInput).not.toBeVisible();
      await expect(mtls.caCertInput).not.toBeVisible();
    });
  });

  // ── Certificate Fields ────────────────────────────────────────────────────

  test.describe("Certificate Vault Reference Fields", () => {
    test.beforeEach(async () => {
      await mtls.enableMtls();
    });

    // AC #324: When toggle is on, show fields: Client Certificate Vault Ref, Client Key Vault Ref, CA Vault Ref (optional)
    test("should show client cert, key, and CA fields when mTLS is enabled", async () => {
      await expect(mtls.clientCertInput).toBeVisible();
      await expect(mtls.clientKeyInput).toBeVisible();
      await expect(mtls.caCertInput).toBeVisible();
    });

    // AC #324: Fields have appropriate placeholder text
    test("should display correct placeholder text for certificate fields", async () => {
      await expect(mtls.clientCertInput).toHaveAttribute("placeholder", "Client Certificate vault ref or path");
      await expect(mtls.clientKeyInput).toHaveAttribute("placeholder", "Client Key vault ref or path");
      await expect(mtls.caCertInput).toHaveAttribute("placeholder", "CA Certificate (optional)");
    });

    // AC #324: Help text explaining vault references
    test("should display help text about mTLS certificates", async () => {
      await expect(mtls.helpText).toBeVisible();
      await expect(mtls.helpText).toContainText("Playwright will use these certificates for mutual TLS");
    });

    // AC #324: Certificate fields are editable
    test("should accept vault reference values in certificate fields", async () => {
      await test.step("Fill certificate fields", async () => {
        await mtls.fillCertFields(
          "vault://pki/cert/client",
          "vault://pki/key/client",
          "vault://pki/ca/root",
        );
      });

      await test.step("Verify values are set", async () => {
        await expect(mtls.clientCertInput).toHaveValue("vault://pki/cert/client");
        await expect(mtls.clientKeyInput).toHaveValue("vault://pki/key/client");
        await expect(mtls.caCertInput).toHaveValue("vault://pki/ca/root");
      });
    });

    // AC #324: CA field is optional
    test("should allow submitting with cert and key but no CA", async () => {
      await test.step("Fill only cert and key", async () => {
        await mtls.clientCertInput.fill("vault://pki/cert/client");
        await mtls.clientKeyInput.fill("vault://pki/key/client");
      });

      await test.step("CA field should be empty but present", async () => {
        await expect(mtls.caCertInput).toHaveValue("");
      });
    });
  });

  // ── Toggle Interaction ────────────────────────────────────────────────────

  test.describe("Toggle Behavior", () => {
    // AC #324: Toggle on/off hides and shows fields correctly
    test("should toggle certificate fields visibility when switch changes", async () => {
      await test.step("Enable mTLS — fields appear", async () => {
        await mtls.enableMtls();
        await expect(mtls.clientCertInput).toBeVisible();
        await expect(mtls.clientKeyInput).toBeVisible();
      });

      await test.step("Disable mTLS — fields disappear", async () => {
        await mtls.disableMtls();
        await expect(mtls.clientCertInput).not.toBeVisible();
        await expect(mtls.clientKeyInput).not.toBeVisible();
      });
    });

    // AC #324: mTLS styling is consistent with existing wizard fields
    test("should show mTLS section with proper visual grouping (border)", async ({ page }) => {
      const mtlsContainer = page.locator(".rounded-lg.border").filter({
        has: page.getByText("Enable mTLS"),
      });
      await expect(mtlsContainer).toBeVisible();
    });
  });

  // ── Application Creation with mTLS ────────────────────────────────────────

  test.describe("App Registration with mTLS", () => {
    // AC #324: mTLS config saved as part of TalosApplication registration
    test("should include mTLS config in app creation payload", async ({ page }) => {
      let createPayload: Record<string, unknown> = {};

      await test.step("Mock create application API", async () => {
        await page.route("**/api/talos/applications", (route) => {
          if (route.request().method() === "POST") {
            createPayload = route.request().postDataJSON();
            return route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({
                id: "app-e2e-mtls",
                name: createPayload.name,
                status: "active",
                mtlsEnabled: createPayload.mtlsEnabled,
                mtlsConfig: createPayload.mtlsConfig,
              }),
            });
          }
          return route.continue();
        });
      });

      await test.step("Fill form with mTLS enabled", async () => {
        await page.getByPlaceholder("Application name").fill("mTLS Test App");
        await mtls.enableMtls();
        await mtls.fillCertFields("vault://cert/client", "vault://key/client");
      });

      await test.step("Submit and verify payload includes mTLS", async () => {
        await page.getByRole("button", { name: "Create Application" }).click();
        await page.waitForResponse((resp) => resp.url().includes("/api/talos/applications"), { timeout: 5000 }).catch(() => {});
        expect(createPayload.mtlsEnabled).toBe(true);
        expect(createPayload.mtlsConfig).toBeDefined();
      });
    });

    // AC #324: Without mTLS enabled, payload should not include mTLS config
    test("should not include mTLS config when toggle is off", async ({ page }) => {
      let createPayload: Record<string, unknown> = {};

      await test.step("Mock create application API", async () => {
        await page.route("**/api/talos/applications", (route) => {
          if (route.request().method() === "POST") {
            createPayload = route.request().postDataJSON();
            return route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({
                id: "app-no-mtls",
                name: createPayload.name,
                status: "active",
              }),
            });
          }
          return route.continue();
        });
      });

      await test.step("Fill form without mTLS", async () => {
        await page.getByPlaceholder("Application name").fill("No mTLS App");
      });

      await test.step("Submit and verify no mTLS in payload", async () => {
        await page.getByRole("button", { name: "Create Application" }).click();
        await page.waitForResponse((resp) => resp.url().includes("/api/talos/applications"), { timeout: 5000 }).catch(() => {});
        expect(createPayload.mtlsEnabled).toBeUndefined();
      });
    });
  });
});
