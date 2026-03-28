/**
 * Test User Scanner
 *
 * Scans .env.example, .env.test, and Playwright config files for patterns
 * indicating test credentials (e.g. TEST_USER_*, ADMIN_*, E2E_*, SEED_*).
 */

import type { DetectedTestUser } from "../../types.js";

type FileEntry = { path: string; content: string };

// ── Patterns ──────────────────────────────────────────────────────────────────

const ENV_VAR_PATTERNS: { pattern: RegExp; roleHint: string }[] = [
  { pattern: /^(TEST_USER[A-Z0-9_]*)=/gm, roleHint: "test-user" },
  { pattern: /^(TEST_PASSWORD[A-Z0-9_]*)=/gm, roleHint: "test-user" },
  { pattern: /^(TEST_EMAIL[A-Z0-9_]*)=/gm, roleHint: "test-user" },
  { pattern: /^(ADMIN_USER[A-Z0-9_]*)=/gm, roleHint: "admin" },
  { pattern: /^(ADMIN_PASSWORD[A-Z0-9_]*)=/gm, roleHint: "admin" },
  { pattern: /^(ADMIN_EMAIL[A-Z0-9_]*)=/gm, roleHint: "admin" },
  { pattern: /^(E2E_USER[A-Z0-9_]*)=/gm, roleHint: "e2e" },
  { pattern: /^(E2E_PASSWORD[A-Z0-9_]*)=/gm, roleHint: "e2e" },
  { pattern: /^(E2E_EMAIL[A-Z0-9_]*)=/gm, roleHint: "e2e" },
  { pattern: /^(SEED_USER[A-Z0-9_]*)=/gm, roleHint: "seed" },
  { pattern: /^(SEED_PASSWORD[A-Z0-9_]*)=/gm, roleHint: "seed" },
  { pattern: /^(CYPRESS_USER[A-Z0-9_]*)=/gm, roleHint: "e2e" },
  { pattern: /^(CYPRESS_PASSWORD[A-Z0-9_]*)=/gm, roleHint: "e2e" },
  { pattern: /^(PLAYWRIGHT_USER[A-Z0-9_]*)=/gm, roleHint: "e2e" },
  { pattern: /^(PLAYWRIGHT_PASSWORD[A-Z0-9_]*)=/gm, roleHint: "e2e" },
  { pattern: /^(LOGIN_USER[A-Z0-9_]*)=/gm, roleHint: "test-user" },
  { pattern: /^(LOGIN_PASSWORD[A-Z0-9_]*)=/gm, roleHint: "test-user" },
];

const PLAYWRIGHT_PATTERNS: { pattern: RegExp; variableName: string; roleHint: string }[] = [
  { pattern: /globalSetup/g, variableName: "globalSetup", roleHint: "e2e" },
  { pattern: /storageState/g, variableName: "storageState", roleHint: "e2e" },
  { pattern: /httpCredentials/g, variableName: "httpCredentials", roleHint: "e2e" },
];

// ── Public API ────────────────────────────────────────────────────────────────

export function detectTestUsers(files: FileEntry[]): DetectedTestUser[] {
  const results: DetectedTestUser[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    const basename = file.path.split("/").pop() ?? "";

    // Scan .env* files
    if (basename.startsWith(".env")) {
      scanEnvFile(file, results, seen);
    }

    // Scan Playwright config files
    if (basename === "playwright.config.ts" || basename === "playwright.config.js") {
      scanPlaywrightConfig(file, results, seen);
    }

    // Scan Cypress config files
    if (basename === "cypress.config.ts" || basename === "cypress.config.js" || basename === "cypress.json") {
      scanEnvFile(file, results, seen);
    }
  }

  return results;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function addResult(results: DetectedTestUser[], seen: Set<string>, item: DetectedTestUser): void {
  const key = `${item.variableName}:${item.source}`.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  results.push(item);
}

function scanEnvFile(file: FileEntry, results: DetectedTestUser[], seen: Set<string>): void {
  for (const { pattern, roleHint } of ENV_VAR_PATTERNS) {
    // Reset lastIndex since we reuse patterns across files
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(file.content)) !== null) {
      addResult(results, seen, {
        variableName: match[1],
        source: file.path,
        roleHint,
      });
    }
  }
}

function scanPlaywrightConfig(file: FileEntry, results: DetectedTestUser[], seen: Set<string>): void {
  for (const { pattern, variableName, roleHint } of PLAYWRIGHT_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    if (regex.test(file.content)) {
      addResult(results, seen, {
        variableName,
        source: file.path,
        roleHint,
      });
    }
  }

  // Also scan for env-var-like patterns embedded in code
  scanEnvFile(file, results, seen);
}
