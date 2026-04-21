import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3001);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

/**
 * Playwright configuration.
 *
 * Foundation for epic #537 (sub-issue #540):
 * - `webServer` block auto-spawns the Next.js UI dev server on port 3001 when
 *   the suite runs locally; when CI=true Playwright launches a fresh server.
 *   Setting `reuseExistingServer: !process.env.CI` lets developers run
 *   `pnpm --filter ui dev` once and re-run tests without bouncing the server.
 * - `setup` project runs `auth.setup.ts` once and persists storage state to
 *   `ui/tests/.auth/user.json`.
 * - `chromium` project depends on `setup` and reuses the persisted state.
 *
 * NOTE: The dev server only starts the UI. Every spec mocks API calls via
 * `page.route` (see `ui/tests/fixtures/route.ts`) — no backend required.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html", { open: "never" }], ["list"]],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts$/,
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "tests/.auth/user.json",
      },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "pnpm dev",
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
