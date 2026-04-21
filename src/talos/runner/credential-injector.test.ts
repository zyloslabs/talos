/**
 * Tests for CredentialInjector
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { TalosRepository } from "../repository.js";
import { CredentialInjector } from "./credential-injector.js";

function setup() {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const repo = new TalosRepository(db);
  repo.migrate();

  const resolveSecret = vi.fn().mockImplementation(async (ref: string) => {
    const secrets: Record<string, string> = {
      "vault://user": "admin",
      "vault://pass": "secret123",
      "vault://token": "tok_abc",
    };
    return secrets[ref] ?? "unknown";
  });

  const injector = new CredentialInjector({ repository: repo, resolveSecret });
  return { repo, injector, resolveSecret };
}

describe("CredentialInjector", () => {
  let repo: TalosRepository;
  let injector: CredentialInjector;
  let resolveSecret: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    ({ repo, injector, resolveSecret } = setup());
  });

  it("returns null for unknown role", async () => {
    const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://a.com" });
    const result = await injector.getCredentials(app.id, "admin");
    expect(result).toBeNull();
  });

  it("resolves credentials for existing role", async () => {
    const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://a.com" });
    repo.createVaultRole({
      applicationId: app.id,
      name: "Admin",
      roleType: "admin",
      usernameRef: "vault://user",
      passwordRef: "vault://pass",
      additionalRefs: { token: "vault://token" },
    });

    const creds = await injector.getCredentials(app.id, "admin");
    expect(creds).not.toBeNull();
    expect(creds!.username).toBe("admin");
    expect(creds!.password).toBe("secret123");
    expect(creds!.additional.token).toBe("tok_abc");
    expect(creds!.roleType).toBe("admin");
  });

  it("caches credentials", async () => {
    const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://a.com" });
    repo.createVaultRole({
      applicationId: app.id,
      name: "Admin",
      roleType: "admin",
      usernameRef: "vault://user",
      passwordRef: "vault://pass",
      additionalRefs: {},
    });

    await injector.getCredentials(app.id, "admin");
    await injector.getCredentials(app.id, "admin");
    // resolveSecret should only be called once per ref due to caching
    expect(resolveSecret).toHaveBeenCalledTimes(2); // user + pass
  });

  it("clearCache empties the cache", async () => {
    const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://a.com" });
    repo.createVaultRole({
      applicationId: app.id,
      name: "Admin",
      roleType: "admin",
      usernameRef: "vault://user",
      passwordRef: "vault://pass",
      additionalRefs: {},
    });

    await injector.getCredentials(app.id, "admin");
    injector.clearCache();
    await injector.getCredentials(app.id, "admin");
    expect(resolveSecret).toHaveBeenCalledTimes(4); // 2 initial + 2 after clear
  });

  it("clearCacheForApplication only clears specific app", async () => {
    const app1 = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://a.com" });
    const app2 = repo.createApplication({ name: "B", repositoryUrl: "https://github.com/a/c", baseUrl: "https://b.com" });
    repo.createVaultRole({ applicationId: app1.id, name: "Admin1", roleType: "admin", usernameRef: "vault://user", passwordRef: "vault://pass", additionalRefs: {} });
    repo.createVaultRole({ applicationId: app2.id, name: "Admin2", roleType: "admin", usernameRef: "vault://user", passwordRef: "vault://pass", additionalRefs: {} });

    await injector.getCredentials(app1.id, "admin");
    await injector.getCredentials(app2.id, "admin");
    injector.clearCacheForApplication(app1.id);
    await injector.getCredentials(app1.id, "admin"); // Re-resolves
    await injector.getCredentials(app2.id, "admin"); // Still cached
    // app1: 2 (initial) + 2 (after clear) = 4, app2: 2 (initial) = 2 → total 6
    expect(resolveSecret).toHaveBeenCalledTimes(6);
  });

  it("getCredentialsById returns null for unknown id", async () => {
    const result = await injector.getCredentialsById("nope");
    expect(result).toBeNull();
  });

  it("getCredentialsById resolves role", async () => {
    const app = repo.createApplication({ name: "A", repositoryUrl: "https://github.com/a/b", baseUrl: "https://a.com" });
    const role = repo.createVaultRole({
      applicationId: app.id,
      name: "Admin",
      roleType: "admin",
      usernameRef: "vault://user",
      passwordRef: "vault://pass",
      additionalRefs: {},
    });

    const creds = await injector.getCredentialsById(role.id);
    expect(creds).not.toBeNull();
    expect(creds!.username).toBe("admin");
  });

  it("createLoginFunction returns executable function", async () => {
    const creds = {
      username: "admin",
      password: "secret",
      additional: {},
      roleType: "admin" as const,
      roleName: "Admin",
    };

    const mockPage = {
      goto: vi.fn(),
      fill: vi.fn(),
      click: vi.fn(),
      waitForSelector: vi.fn(),
    };

    const loginFn = injector.createLoginFunction(creds, {
      loginUrl: "/login",
      usernameSelector: "#user",
      passwordSelector: "#pass",
      submitSelector: "button",
      successIndicator: ".dashboard",
    });

    await loginFn(mockPage as never);
    expect(mockPage.goto).toHaveBeenCalledWith("/login");
    expect(mockPage.fill).toHaveBeenCalledWith("#user", "admin");
    expect(mockPage.fill).toHaveBeenCalledWith("#pass", "secret");
    expect(mockPage.click).toHaveBeenCalledWith("button");
    expect(mockPage.waitForSelector).toHaveBeenCalledWith(".dashboard", { timeout: 30000 });
  });

  it("createLoginFunction handles MFA when fully configured", async () => {
    const creds = {
      username: "admin",
      password: "secret",
      additional: { mfa: "JBSWY3DPEHPK3PXP" }, // valid base32 secret
      roleType: "admin" as const,
      roleName: "Admin",
    };

    const mockPage = {
      goto: vi.fn(),
      fill: vi.fn(),
      click: vi.fn(),
      waitForSelector: vi.fn(),
    };

    const loginFn = injector.createLoginFunction(creds, {
      loginUrl: "/login",
      usernameSelector: "#user",
      passwordSelector: "#pass",
      submitSelector: "button",
      successIndicator: ".dashboard",
      mfaSelector: "#mfa-code",
      mfaSecretKey: "mfa",
    });

    await loginFn(mockPage as never);

    // TOTP should now produce a real 6-digit numeric code (#532)
    const mfaCall = mockPage.fill.mock.calls.find((c) => c[0] === "#mfa-code");
    expect(mfaCall).toBeDefined();
    const mfaCode = mfaCall![1] as string;
    expect(mfaCode).toMatch(/^\d{6}$/);
    expect(mockPage.click).toHaveBeenCalledTimes(2); // submit + after MFA
  });

  it("MFA falls back to empty string when secret is invalid (#532)", async () => {
    const creds = {
      username: "admin",
      password: "secret",
      additional: { mfa: "" }, // empty/invalid secret
      roleType: "admin" as const,
      roleName: "Admin",
    };

    const mockPage = {
      goto: vi.fn(),
      fill: vi.fn(),
      click: vi.fn(),
      waitForSelector: vi.fn(),
    };

    const loginFn = injector.createLoginFunction(creds, {
      loginUrl: "/login",
      usernameSelector: "#user",
      passwordSelector: "#pass",
      submitSelector: "button",
      successIndicator: ".dashboard",
      mfaSelector: "#mfa-code",
      mfaSecretKey: "mfa",
    });

    // Empty mfa value => createLoginFunction skips MFA branch entirely (truthy check)
    await loginFn(mockPage as never);
    expect(mockPage.fill).not.toHaveBeenCalledWith("#mfa-code", expect.anything());
  });
});
