/**
 * Auth setup for Playwright e2e tests (epic #537 / sub-issue #540).
 *
 * Talos has no real login screen for most internal pages — auth gating is per
 * route via Copilot 365 session checks. To keep specs deterministic we:
 *
 * 1. Open the app once
 * 2. Seed `localStorage` with a fake "authenticated" marker so any future
 *    route-level guard that reads it (introduced post-#537) treats the test
 *    as authed
 * 3. Persist the storage state to `tests/.auth/user.json` so every spec in
 *    the `chromium` project starts already "logged in"
 *
 * If a real auth flow is added later, replace the seed below with actual
 * navigation + form submission, then `await page.context().storageState(...)`.
 */
import { test as setup, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_FILE = path.resolve(__dirname, ".auth/user.json");

setup("authenticate", async ({ page }) => {
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });

  // Mock the Copilot 365 status endpoint so the "Authenticated" badge shows
  // and any auth-gated client code believes a session exists.
  await page.route("**/api/admin/copilot365/status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        authenticated: true,
        user: { id: "e2e-user", login: "playwright-e2e", name: "E2E User" },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }),
    })
  );

  // Mock the apps list so the dashboard does not 500 during seeding.
  await page.route("**/api/talos/applications", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    })
  );

  await page.goto("/");

  // Seed the auth marker. Read by any future client guard.
  await page.evaluate(() => {
    window.localStorage.setItem(
      "talos:auth",
      JSON.stringify({ authenticated: true, user: "playwright-e2e" })
    );
  });

  // Sanity check that the page rendered (`/` may redirect to `/talos`).
  await expect(page).toHaveURL(/^http:\/\/localhost:\d+\//);

  await page.context().storageState({ path: AUTH_FILE });
});
