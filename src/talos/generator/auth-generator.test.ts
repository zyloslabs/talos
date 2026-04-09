/**
 * Tests for AuthGenerator (#476)
 */

import { describe, it, expect, vi } from "vitest";
import { AuthGenerator } from "./auth-generator.js";
import type { TalosRepository } from "../repository.js";
import type { TalosVaultRole, TalosApplication } from "../types.js";

function createMockRepository(roles: TalosVaultRole[]): TalosRepository {
  return {
    getRolesByApplication: vi.fn(() => roles),
  } as unknown as TalosRepository;
}

function createRole(overrides?: Partial<TalosVaultRole>): TalosVaultRole {
  return {
    id: crypto.randomUUID(),
    applicationId: "app-1",
    roleType: "admin",
    name: "Admin User",
    description: "Admin role",
    usernameRef: "vault:admin-user",
    passwordRef: "vault:admin-pass",
    additionalRefs: {},
    isActive: true,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createApp(overrides?: Partial<TalosApplication>): TalosApplication {
  return {
    id: "app-1",
    name: "Test App",
    description: "A test app",
    repositoryUrl: "https://github.com/test/app",
    branch: "main",
    githubPatRef: null,
    baseUrl: "https://app.example.com",
    status: "active",
    mtlsEnabled: false,
    mtlsConfig: null,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("AuthGenerator", () => {
  describe("generateAuthSetups", () => {
    it("generates auth setups for active vault roles", () => {
      const roles = [
        createRole({ roleType: "admin", name: "Admin", isActive: true }),
        createRole({ roleType: "standard", name: "Standard User", isActive: true }),
      ];
      const repo = createMockRepository(roles);
      const gen = new AuthGenerator({ repository: repo });

      const setups = gen.generateAuthSetups("app-1");

      expect(setups).toHaveLength(2);
      expect(setups[0].roleType).toBe("admin");
      expect(setups[0].beforeAllCode).toContain("TALOS_VAULT_ADMIN_USER");
      expect(setups[1].roleType).toBe("standard");
      expect(setups[1].beforeAllCode).toContain("TALOS_VAULT_STANDARD_USER");
    });

    it("skips inactive roles", () => {
      const roles = [
        createRole({ roleType: "admin", isActive: true }),
        createRole({ roleType: "guest", isActive: false }),
      ];
      const repo = createMockRepository(roles);
      const gen = new AuthGenerator({ repository: repo });

      const setups = gen.generateAuthSetups("app-1");

      expect(setups).toHaveLength(1);
      expect(setups[0].roleType).toBe("admin");
    });

    it("returns empty array when no roles exist", () => {
      const repo = createMockRepository([]);
      const gen = new AuthGenerator({ repository: repo });

      const setups = gen.generateAuthSetups("app-1");

      expect(setups).toHaveLength(0);
    });

    it("includes login code in beforeEachCode", () => {
      const roles = [createRole({ roleType: "admin" })];
      const repo = createMockRepository(roles);
      const gen = new AuthGenerator({ repository: repo });

      const setups = gen.generateAuthSetups("app-1");

      expect(setups[0].beforeEachCode).toContain("getByLabel('Username')");
      expect(setups[0].beforeEachCode).toContain("getByLabel('Password')");
      expect(setups[0].beforeEachCode).toContain("getByRole('button'");
    });

    it("includes imports in each setup block", () => {
      const roles = [createRole()];
      const repo = createMockRepository(roles);
      const gen = new AuthGenerator({ repository: repo });

      const setups = gen.generateAuthSetups("app-1");

      expect(setups[0].imports.length).toBeGreaterThan(0);
      expect(setups[0].imports[0]).toContain("@playwright/test");
    });
  });

  describe("generateTestSuite", () => {
    it("generates complete test suite wrapper", () => {
      const role = createRole({ roleType: "admin", name: "Admin" });
      const app = createApp();
      const repo = createMockRepository([role]);
      const gen = new AuthGenerator({ repository: repo });

      const suite = gen.generateTestSuite(app, role, "test code here");

      expect(suite.roleType).toBe("admin");
      expect(suite.roleName).toBe("Admin");
      expect(suite.testPrefix).toBe("[admin]");
      expect(suite.setupCode).toContain("beforeEach");
      expect(suite.teardownCode).toContain("afterEach");
    });
  });

  describe("hasAuthConfig", () => {
    it("returns true when active roles exist", () => {
      const roles = [createRole({ isActive: true })];
      const repo = createMockRepository(roles);
      const gen = new AuthGenerator({ repository: repo });

      expect(gen.hasAuthConfig("app-1")).toBe(true);
    });

    it("returns false when no active roles", () => {
      const roles = [createRole({ isActive: false })];
      const repo = createMockRepository(roles);
      const gen = new AuthGenerator({ repository: repo });

      expect(gen.hasAuthConfig("app-1")).toBe(false);
    });

    it("returns false when no roles at all", () => {
      const repo = createMockRepository([]);
      const gen = new AuthGenerator({ repository: repo });

      expect(gen.hasAuthConfig("app-1")).toBe(false);
    });
  });

  describe("generateRoleTestWrapper", () => {
    it("generates complete wrapper code", () => {
      const role = createRole({ roleType: "standard", name: "Standard User" });
      const repo = createMockRepository([role]);
      const gen = new AuthGenerator({ repository: repo });

      const code = gen.generateRoleTestWrapper(role, "https://app.example.com");

      expect(code).toContain("import { test, expect }");
      expect(code).toContain("test.describe('Standard User (standard) tests'");
      expect(code).toContain("TALOS_VAULT_STANDARD_USER");
      expect(code).toContain("TALOS_VAULT_STANDARD_PASS");
      expect(code).toContain("beforeAll");
      expect(code).toContain("beforeEach");
    });

    it("uses custom loginUrl when provided", () => {
      const role = createRole();
      const repo = createMockRepository([role]);
      const gen = new AuthGenerator({ repository: repo, loginUrl: "https://auth.example.com/login" });

      const code = gen.generateRoleTestWrapper(role, "https://app.example.com");

      expect(code).toContain("https://auth.example.com/login");
    });
  });
});
