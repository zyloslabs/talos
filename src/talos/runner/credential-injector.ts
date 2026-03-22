/**
 * Credential Injector
 *
 * Injects vault credentials into Playwright browser contexts.
 */

import type { TalosVaultRole, TalosVaultRoleType } from "../types.js";
import type { TalosRepository } from "../repository.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CredentialInjectorOptions = {
  repository: TalosRepository;
  /** Function to resolve vault secret references to plaintext */
  resolveSecret: (ref: string) => Promise<string>;
};

export type ResolvedCredentials = {
  username: string;
  password: string;
  additional: Record<string, string>;
  roleType: TalosVaultRoleType;
  roleName: string;
};

export type StorageState = {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: "Strict" | "Lax" | "None";
  }>;
  origins: Array<{
    origin: string;
    localStorage: Array<{ name: string; value: string }>;
  }>;
};

// ── Credential Injector ───────────────────────────────────────────────────────

export class CredentialInjector {
  private repository: TalosRepository;
  private resolveSecret: (ref: string) => Promise<string>;

  // Cache resolved credentials (cleared on role change)
  private credentialCache = new Map<string, ResolvedCredentials>();

  constructor(options: CredentialInjectorOptions) {
    this.repository = options.repository;
    this.resolveSecret = options.resolveSecret;
  }

  /**
   * Get resolved credentials for an application's vault role.
   */
  async getCredentials(
    applicationId: string,
    roleType: TalosVaultRoleType
  ): Promise<ResolvedCredentials | null> {
    const cacheKey = `${applicationId}:${roleType}`;
    
    // Check cache
    const cached = this.credentialCache.get(cacheKey);
    if (cached) return cached;

    // Get role from repository
    const role = this.repository.getRoleByType(applicationId, roleType);
    if (!role) return null;

    // Resolve credentials
    const credentials = await this.resolveRole(role);
    
    // Cache and return
    this.credentialCache.set(cacheKey, credentials);
    return credentials;
  }

  /**
   * Get resolved credentials by role ID.
   */
  async getCredentialsById(roleId: string): Promise<ResolvedCredentials | null> {
    const role = this.repository.getVaultRole(roleId);
    if (!role) return null;

    return this.resolveRole(role);
  }

  /**
   * Resolve a vault role to plaintext credentials.
   */
  private async resolveRole(role: TalosVaultRole): Promise<ResolvedCredentials> {
    const [username, password] = await Promise.all([
      this.resolveSecret(role.usernameRef),
      this.resolveSecret(role.passwordRef),
    ]);

    // Resolve additional refs
    const additional: Record<string, string> = {};
    for (const [key, ref] of Object.entries(role.additionalRefs)) {
      additional[key] = await this.resolveSecret(ref);
    }

    return {
      username,
      password,
      additional,
      roleType: role.roleType,
      roleName: role.name,
    };
  }

  /**
   * Clear credential cache.
   */
  clearCache(): void {
    this.credentialCache.clear();
  }

  /**
   * Clear cache for specific application.
   */
  clearCacheForApplication(applicationId: string): void {
    for (const key of this.credentialCache.keys()) {
      if (key.startsWith(`${applicationId}:`)) {
        this.credentialCache.delete(key);
      }
    }
  }

  /**
   * Create a login function for Playwright Page.
   * Returns a function that can be called to log in with the given credentials.
   */
  createLoginFunction(
    credentials: ResolvedCredentials,
    loginConfig: {
      loginUrl: string;
      usernameSelector: string;
      passwordSelector: string;
      submitSelector: string;
      successIndicator: string;
      mfaSelector?: string;
      mfaSecretKey?: string;
    }
  ): (page: PlaywrightPage) => Promise<void> {
    return async (page: PlaywrightPage) => {
      // Navigate to login page
      await page.goto(loginConfig.loginUrl);

      // Fill credentials
      await page.fill(loginConfig.usernameSelector, credentials.username);
      await page.fill(loginConfig.passwordSelector, credentials.password);

      // Submit
      await page.click(loginConfig.submitSelector);

      // Handle MFA if configured
      if (loginConfig.mfaSelector && loginConfig.mfaSecretKey && credentials.additional[loginConfig.mfaSecretKey]) {
        const mfaCode = this.generateTOTP(credentials.additional[loginConfig.mfaSecretKey]);
        await page.fill(loginConfig.mfaSelector, mfaCode);
        await page.click(loginConfig.submitSelector);
      }

      // Wait for success indicator
      await page.waitForSelector(loginConfig.successIndicator, { timeout: 30000 });
    };
  }

  /**
   * Generate TOTP code from secret.
   * Basic implementation - in production use a proper TOTP library.
   */
  private generateTOTP(_secret: string): string {
    // This is a placeholder - real implementation would use otplib or similar
    // For now, return empty string (MFA would need manual handling)
    return "";
  }
}

// ── Playwright Page Interface ─────────────────────────────────────────────────

interface PlaywrightPage {
  goto(url: string): Promise<void>;
  fill(selector: string, value: string): Promise<void>;
  click(selector: string): Promise<void>;
  waitForSelector(selector: string, options?: { timeout?: number }): Promise<void>;
}
