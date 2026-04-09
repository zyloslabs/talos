/**
 * Auth-Aware Test Generator (#476)
 *
 * Generates login/auth setup blocks when vault roles exist.
 * Produces separate test suites per role with beforeAll/beforeEach blocks
 * that use the CredentialInjector.
 */

import type {
  TalosVaultRole,
  TalosVaultRoleType,
  TalosApplication,
} from "../types.js";
import type { TalosRepository } from "../repository.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AuthSetupBlock = {
  roleType: TalosVaultRoleType;
  roleName: string;
  beforeAllCode: string;
  beforeEachCode: string;
  imports: string[];
};

export type AuthAwareTestSuite = {
  roleType: TalosVaultRoleType;
  roleName: string;
  setupCode: string;
  teardownCode: string;
  testPrefix: string;
};

export type AuthGeneratorOptions = {
  repository: TalosRepository;
  loginUrl?: string;
};

// ── Auth Generator ────────────────────────────────────────────────────────────

export class AuthGenerator {
  private repository: TalosRepository;
  private loginUrl: string | undefined;

  constructor(options: AuthGeneratorOptions) {
    this.repository = options.repository;
    this.loginUrl = options.loginUrl;
  }

  /**
   * Generate auth setup blocks for all active vault roles of an application.
   */
  generateAuthSetups(applicationId: string): AuthSetupBlock[] {
    const roles = this.repository.getRolesByApplication(applicationId);
    const activeRoles = roles.filter((r) => r.isActive);

    if (activeRoles.length === 0) return [];

    return activeRoles.map((role) => this.generateSetupForRole(role));
  }

  /**
   * Generate a complete auth-aware test suite wrapper for a role.
   */
  generateTestSuite(
    application: TalosApplication,
    role: TalosVaultRole,
    _testBody: string
  ): AuthAwareTestSuite {
    const loginUrl = this.loginUrl ?? application.baseUrl;

    const setupCode = this.buildSetupCode(role, loginUrl);
    const teardownCode = this.buildTeardownCode();

    return {
      roleType: role.roleType,
      roleName: role.name,
      setupCode,
      teardownCode,
      testPrefix: `[${role.roleType}]`,
    };
  }

  /**
   * Check if an application has auth configuration.
   */
  hasAuthConfig(applicationId: string): boolean {
    const roles = this.repository.getRolesByApplication(applicationId);
    return roles.some((r) => r.isActive);
  }

  /**
   * Generate role-specific test wrapper code.
   */
  generateRoleTestWrapper(role: TalosVaultRole, baseUrl: string): string {
    const loginUrl = this.loginUrl ?? baseUrl;

    return [
      `import { test, expect } from '@playwright/test';`,
      ``,
      `// Auth setup for role: ${role.name} (${role.roleType})`,
      `test.describe('${role.name} (${role.roleType}) tests', () => {`,
      `  let credentials: { username: string; password: string };`,
      ``,
      `  test.beforeAll(async () => {`,
      `    // Resolve credentials from vault`,
      `    credentials = {`,
      `      username: process.env['TALOS_VAULT_${role.roleType.toUpperCase()}_USER'] ?? '',`,
      `      password: process.env['TALOS_VAULT_${role.roleType.toUpperCase()}_PASS'] ?? '',`,
      `    };`,
      `  });`,
      ``,
      `  test.beforeEach(async ({ page }) => {`,
      `    // Navigate to login and authenticate`,
      `    await page.goto('${this.escapeString(loginUrl)}');`,
      `    await page.getByLabel('Username').fill(credentials.username);`,
      `    await page.getByLabel('Password').fill(credentials.password);`,
      `    await page.getByRole('button', { name: /sign in|log in|submit/i }).click();`,
      `    await page.waitForURL('**/*', { timeout: 10000 });`,
      `  });`,
      ``,
      `  // --- Tests go here ---`,
      `});`,
    ].join("\n");
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private generateSetupForRole(role: TalosVaultRole): AuthSetupBlock {
    const envPrefix = `TALOS_VAULT_${role.roleType.toUpperCase()}`;

    const beforeAllCode = [
      `// Resolve ${role.name} (${role.roleType}) credentials`,
      `const ${role.roleType}Credentials = {`,
      `  username: process.env['${envPrefix}_USER'] ?? '',`,
      `  password: process.env['${envPrefix}_PASS'] ?? '',`,
      `};`,
    ].join("\n");

    const beforeEachCode = [
      `// Login as ${role.roleType}`,
      `await page.goto(loginUrl);`,
      `await page.getByLabel('Username').fill(${role.roleType}Credentials.username);`,
      `await page.getByLabel('Password').fill(${role.roleType}Credentials.password);`,
      `await page.getByRole('button', { name: /sign in|log in|submit/i }).click();`,
      `await page.waitForURL('**/*', { timeout: 10000 });`,
    ].join("\n");

    return {
      roleType: role.roleType,
      roleName: role.name,
      beforeAllCode,
      beforeEachCode,
      imports: [`import { test, expect } from '@playwright/test';`],
    };
  }

  private buildSetupCode(role: TalosVaultRole, loginUrl: string): string {
    return [
      `test.beforeEach(async ({ page }) => {`,
      `  const username = process.env['TALOS_VAULT_${role.roleType.toUpperCase()}_USER'] ?? '';`,
      `  const password = process.env['TALOS_VAULT_${role.roleType.toUpperCase()}_PASS'] ?? '';`,
      `  await page.goto('${this.escapeString(loginUrl)}');`,
      `  await page.getByLabel('Username').fill(username);`,
      `  await page.getByLabel('Password').fill(password);`,
      `  await page.getByRole('button', { name: /sign in|log in|submit/i }).click();`,
      `  await page.waitForURL('**/*', { timeout: 10000 });`,
      `});`,
    ].join("\n");
  }

  private buildTeardownCode(): string {
    return [
      `test.afterEach(async ({ page }) => {`,
      `  // Clear auth state`,
      `  await page.context().clearCookies();`,
      `});`,
    ].join("\n");
  }

  private escapeString(s: string): string {
    return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  }
}
