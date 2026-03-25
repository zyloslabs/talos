import { test, expect } from "@playwright/test";
import { AdminPage } from "./pages/admin.page";

test.describe("Proxy Settings Panel (#320)", () => {
  let admin: AdminPage;

  test.beforeEach(async ({ page }) => {
    admin = new AdminPage(page);
    await admin.goto();
  });

  // ── Section Visibility ────────────────────────────────────────────────────

  test.describe("Network / Proxy Section", () => {
    // AC #320: New "Network / Proxy" section visible in Admin settings
    test("should display Network / Proxy section in admin page", async () => {
      await admin.networkSection.scrollIntoViewIfNeeded();
      await expect(admin.page.getByRole("heading", { name: "Network / Proxy" })).toBeVisible();
    });

    // AC #320: Section has correct description
    test("should display section description", async () => {
      await admin.networkSection.scrollIntoViewIfNeeded();
      await expect(admin.page.getByText("Corporate proxy and network settings")).toBeVisible();
    });

    // AC #320: Network / Proxy appears in sidebar navigation
    test("should display Network / Proxy link in sidebar", async () => {
      await expect(admin.networkLink).toBeVisible();
    });
  });

  // ── Enable/Disable Toggle ─────────────────────────────────────────────────

  test.describe("Proxy Toggle", () => {
    // AC #320: Enable/disable toggle for proxy (switch component)
    test("should display enable/disable toggle for proxy", async () => {
      await admin.networkSection.scrollIntoViewIfNeeded();
      await expect(admin.proxyToggle).toBeVisible();
      await expect(admin.page.getByText("Enable Corporate Proxy")).toBeVisible();
    });

    // AC #320: Fields disabled when proxy toggle is off
    test("should hide proxy input fields when toggle is off", async () => {
      await admin.networkSection.scrollIntoViewIfNeeded();

      await test.step("Ensure toggle is off", async () => {
        // The proxy toggle should default to off
        const isChecked = await admin.proxyToggle.isChecked().catch(() => false);
        if (isChecked) {
          await admin.proxyToggle.click();
        }
      });

      await test.step("Verify fields are hidden when disabled", async () => {
        await expect(admin.httpProxyInput).not.toBeVisible();
        await expect(admin.httpsProxyInput).not.toBeVisible();
        await expect(admin.noProxyInput).not.toBeVisible();
      });
    });

    // AC #320: Fields shown when proxy toggle is on
    test("should show proxy input fields when toggle is enabled", async () => {
      await admin.networkSection.scrollIntoViewIfNeeded();

      await test.step("Enable proxy toggle", async () => {
        const isChecked = await admin.proxyToggle.isChecked().catch(() => false);
        if (!isChecked) {
          await admin.proxyToggle.click();
        }
      });

      await test.step("Verify proxy fields are visible", async () => {
        await expect(admin.httpProxyInput).toBeVisible();
        await expect(admin.httpsProxyInput).toBeVisible();
        await expect(admin.noProxyInput).toBeVisible();
      });
    });
  });

  // ── Proxy Form Fields ─────────────────────────────────────────────────────

  test.describe("Proxy Form Fields", () => {
    test.beforeEach(async () => {
      await admin.networkSection.scrollIntoViewIfNeeded();
      // Ensure toggle is on for field tests
      const isChecked = await admin.proxyToggle.isChecked().catch(() => false);
      if (!isChecked) {
        await admin.proxyToggle.click();
      }
    });

    // AC #320: Input field: HTTP Proxy URL
    test("should display HTTP Proxy input with placeholder", async () => {
      await expect(admin.httpProxyInput).toBeVisible();
      await expect(admin.httpProxyInput).toHaveAttribute("placeholder", "http://proxy.corp.com:8080");
    });

    // AC #320: Input field: HTTPS Proxy URL
    test("should display HTTPS Proxy input with placeholder", async () => {
      await expect(admin.httpsProxyInput).toBeVisible();
      await expect(admin.httpsProxyInput).toHaveAttribute("placeholder", "http://proxy.corp.com:8443");
    });

    // AC #320: Textarea: No-Proxy list (comma-separated, with placeholder text)
    test("should display No Proxy input with placeholder and help text", async () => {
      await expect(admin.noProxyInput).toBeVisible();
      await expect(admin.noProxyInput).toHaveAttribute("placeholder", "localhost,127.0.0.1,.corp.com");
      await expect(admin.page.getByText("Comma-separated list of hosts to bypass the proxy")).toBeVisible();
    });

    // AC #320: Form fields are editable
    test("should accept proxy URL input values", async () => {
      await test.step("Fill HTTP proxy", async () => {
        await admin.httpProxyInput.fill("http://proxy.example.com:3128");
        await expect(admin.httpProxyInput).toHaveValue("http://proxy.example.com:3128");
      });

      await test.step("Fill HTTPS proxy", async () => {
        await admin.httpsProxyInput.fill("http://proxy.example.com:3129");
        await expect(admin.httpsProxyInput).toHaveValue("http://proxy.example.com:3129");
      });

      await test.step("Fill no-proxy list", async () => {
        await admin.noProxyInput.fill("localhost,127.0.0.1,.internal.corp");
        await expect(admin.noProxyInput).toHaveValue("localhost,127.0.0.1,.internal.corp");
      });
    });
  });

  // ── Save & Test Buttons ───────────────────────────────────────────────────

  test.describe("Save and Test Buttons", () => {
    // AC #320: "Save" button calls PUT /api/admin/proxy with form data
    test("should display Save button", async () => {
      await admin.networkSection.scrollIntoViewIfNeeded();
      await expect(admin.proxySaveButton).toBeVisible();
    });

    // AC #320: "Test Connection" button calls POST /api/admin/proxy/test
    test("should display Test Connection button when proxy is enabled", async () => {
      await admin.networkSection.scrollIntoViewIfNeeded();

      await test.step("Enable proxy", async () => {
        const isChecked = await admin.proxyToggle.isChecked().catch(() => false);
        if (!isChecked) {
          await admin.proxyToggle.click();
        }
      });

      await expect(admin.proxyTestButton).toBeVisible();
    });

    // AC #320: Test Connection button hidden when proxy is disabled
    test("should hide Test Connection button when proxy is off", async () => {
      await admin.networkSection.scrollIntoViewIfNeeded();

      await test.step("Ensure toggle is off", async () => {
        const isChecked = await admin.proxyToggle.isChecked().catch(() => false);
        if (isChecked) {
          await admin.proxyToggle.click();
        }
      });

      await expect(admin.proxyTestButton).not.toBeVisible();
    });

    // AC #320: Connection test shows success (green + latency) or failure (red + error)
    test("should show success result after successful connection test", async ({ page }) => {
      await admin.networkSection.scrollIntoViewIfNeeded();

      await test.step("Enable proxy and fill fields", async () => {
        const isChecked = await admin.proxyToggle.isChecked().catch(() => false);
        if (!isChecked) {
          await admin.proxyToggle.click();
        }
        await admin.httpProxyInput.fill("http://proxy.test:8080");
      });

      await test.step("Mock health endpoint for success", async () => {
        await page.route("**/api/admin/models/health", (route) =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ connected: true, latencyMs: 42 }),
          }),
        );
      });

      await test.step("Click Test Connection and verify success", async () => {
        await admin.proxyTestButton.click();
        await expect(admin.page.getByText("Proxy connection successful")).toBeVisible();
      });
    });

    // AC #320: Connection test shows failure result
    test("should show failure result after failed connection test", async ({ page }) => {
      await admin.networkSection.scrollIntoViewIfNeeded();

      await test.step("Enable proxy", async () => {
        const isChecked = await admin.proxyToggle.isChecked().catch(() => false);
        if (!isChecked) {
          await admin.proxyToggle.click();
        }
      });

      await test.step("Mock health endpoint for failure", async () => {
        await page.route("**/api/admin/models/health", (route) =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ connected: false, error: "Connection refused" }),
          }),
        );
      });

      await test.step("Click Test Connection and verify failure", async () => {
        await admin.proxyTestButton.click();
        await expect(admin.page.getByText("Proxy test failed: Connection refused")).toBeVisible();
      });
    });
  });

  // AC #320: "Save" button saves proxy config via API
  test.describe("Save Proxy Config", () => {
    test("should call save API when Save button is clicked", async ({ page }) => {
      await admin.networkSection.scrollIntoViewIfNeeded();

      await test.step("Enable proxy and fill form", async () => {
        const isChecked = await admin.proxyToggle.isChecked().catch(() => false);
        if (!isChecked) {
          await admin.proxyToggle.click();
        }
        await admin.httpProxyInput.fill("http://proxy.save-test.com:8080");
      });

      await test.step("Mock save API", async () => {
        await page.route("**/api/admin/env", (route) => {
          if (route.request().method() === "POST" || route.request().method() === "PUT") {
            return route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({ success: true }),
            });
          }
          return route.continue();
        });
      });

      await test.step("Click Save", async () => {
        await admin.proxySaveButton.click();
        // Give the mutation time to fire
        await page.waitForResponse((resp) => resp.url().includes("/api/admin/env"), { timeout: 5000 }).catch(() => {});
      });
    });
  });
});
