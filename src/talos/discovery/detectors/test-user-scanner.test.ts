import { describe, it, expect } from "vitest";
import { detectTestUsers } from "./test-user-scanner.js";

describe("detectTestUsers", () => {
  it("detects TEST_USER_* variables in .env files", () => {
    const files = [
      {
        path: ".env.example",
        content: `TEST_USER_EMAIL=test@example.com
TEST_USER_PASSWORD=secret123
ADMIN_USER=admin@example.com
ADMIN_PASSWORD=adminpass`,
      },
    ];
    const results = detectTestUsers(files);
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ variableName: "TEST_USER_EMAIL", roleHint: "test-user" }),
        expect.objectContaining({ variableName: "TEST_USER_PASSWORD", roleHint: "test-user" }),
        expect.objectContaining({ variableName: "ADMIN_USER", roleHint: "admin" }),
        expect.objectContaining({ variableName: "ADMIN_PASSWORD", roleHint: "admin" }),
      ])
    );
  });

  it("detects E2E and SEED patterns", () => {
    const files = [
      {
        path: ".env.test",
        content: `E2E_USER_EMAIL=e2e@test.com
E2E_PASSWORD=pass
SEED_USER_NAME=seeder
SEED_PASSWORD=seedpass`,
      },
    ];
    const results = detectTestUsers(files);
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ variableName: "E2E_USER_EMAIL", roleHint: "e2e" }),
        expect.objectContaining({ variableName: "E2E_PASSWORD", roleHint: "e2e" }),
        expect.objectContaining({ variableName: "SEED_USER_NAME", roleHint: "seed" }),
        expect.objectContaining({ variableName: "SEED_PASSWORD", roleHint: "seed" }),
      ])
    );
  });

  it("detects Playwright config patterns", () => {
    const files = [
      {
        path: "playwright.config.ts",
        content: `import { defineConfig } from '@playwright/test';
export default defineConfig({
  globalSetup: require.resolve('./global-setup'),
  use: {
    storageState: 'playwright/.auth/user.json',
    httpCredentials: { username: 'user', password: 'pass' },
  },
});`,
      },
    ];
    const results = detectTestUsers(files);
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ variableName: "globalSetup", roleHint: "e2e" }),
        expect.objectContaining({ variableName: "storageState", roleHint: "e2e" }),
        expect.objectContaining({ variableName: "httpCredentials", roleHint: "e2e" }),
      ])
    );
  });

  it("ignores non-matching env vars", () => {
    const files = [
      {
        path: ".env.example",
        content: `NODE_ENV=production
PORT=3000
DATABASE_URL=postgres://localhost/db`,
      },
    ];
    const results = detectTestUsers(files);
    expect(results).toEqual([]);
  });

  it("includes source file in results", () => {
    const files = [
      { path: "config/.env.example", content: "TEST_USER_EMAIL=test@example.com" },
    ];
    const results = detectTestUsers(files);
    expect(results[0].source).toBe("config/.env.example");
  });

  it("deduplicates identical var+source pairs", () => {
    const files = [
      { path: ".env.example", content: "TEST_USER_EMAIL=a\nTEST_USER_EMAIL=b" },
    ];
    const results = detectTestUsers(files);
    const matches = results.filter((r) => r.variableName === "TEST_USER_EMAIL");
    expect(matches).toHaveLength(1);
  });

  it("scans multiple .env files", () => {
    const files = [
      { path: ".env.example", content: "TEST_USER_EMAIL=a" },
      { path: ".env.test", content: "ADMIN_USER=b" },
    ];
    const results = detectTestUsers(files);
    expect(results).toHaveLength(2);
  });

  it("returns empty for non-env files", () => {
    const files = [{ path: "src/index.ts", content: "console.log('hello')" }];
    const results = detectTestUsers(files);
    expect(results).toEqual([]);
  });
});
