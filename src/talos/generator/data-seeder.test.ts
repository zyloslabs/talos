/**
 * Tests for DataSeeder (#480)
 */

import { describe, it, expect } from "vitest";
import { DataSeeder } from "./data-seeder.js";
import type { TestDataSeedConfig } from "../types.js";

describe("DataSeeder", () => {
  const seeder = new DataSeeder({ apiBaseUrl: "http://localhost:3000" });

  describe("generateSeedHooks", () => {
    it("generates API-based hooks with fixtures", () => {
      const config: TestDataSeedConfig = {
        strategy: "api",
        setupScript: "",
        cleanupScript: "",
        fixtures: [{ name: "Test User", email: "test@example.com" }],
      };

      const hooks = seeder.generateSeedHooks(config);

      expect(hooks.beforeAllCode).toContain("test.beforeAll");
      expect(hooks.beforeAllCode).toContain("fetch");
      expect(hooks.afterAllCode).toContain("test.afterAll");
      expect(hooks.afterAllCode).toContain("cleanup");
      expect(hooks.fixtureImports.length).toBeGreaterThan(0);
    });

    it("generates API hooks with custom setup script", () => {
      const config: TestDataSeedConfig = {
        strategy: "api",
        setupScript: "await seedDatabase();",
        cleanupScript: "await cleanupDatabase();",
      };

      const hooks = seeder.generateSeedHooks(config);

      expect(hooks.beforeAllCode).toContain("await seedDatabase()");
      expect(hooks.afterAllCode).toContain("await cleanupDatabase()");
    });

    it("generates SQL-based hooks", () => {
      const config: TestDataSeedConfig = {
        strategy: "sql",
        setupScript: "INSERT INTO users (name) VALUES ('test');",
        cleanupScript: "DELETE FROM users WHERE name = 'test';",
      };

      const hooks = seeder.generateSeedHooks(config);

      expect(hooks.beforeAllCode).toContain("INSERT INTO users");
      expect(hooks.afterAllCode).toContain("DELETE FROM users");
    });

    it("generates fixture-based hooks", () => {
      const config: TestDataSeedConfig = {
        strategy: "fixture",
        setupScript: "",
        cleanupScript: "",
      };

      const hooks = seeder.generateSeedHooks(config);

      expect(hooks.beforeAllCode).toContain("fixture");
      expect(hooks.fixtureImports.length).toBeGreaterThan(0);
    });

    it("uses default API base URL when none provided", () => {
      const defaultSeeder = new DataSeeder();
      const config: TestDataSeedConfig = {
        strategy: "api",
        setupScript: "",
        cleanupScript: "",
      };

      const hooks = defaultSeeder.generateSeedHooks(config);

      expect(hooks.beforeAllCode).toContain("http://localhost:3000");
    });
  });

  describe("generateFixtureFile", () => {
    it("generates fixture file content", () => {
      const content = seeder.generateFixtureFile({
        name: "test-users",
        data: [
          { name: "Alice", email: "alice@test.com" },
          { name: "Bob", email: "bob@test.com" },
        ],
        parameters: { env: "test" },
      });

      expect(content).toContain("testUsersFixture");
      expect(content).toContain("Alice");
      expect(content).toContain("Bob");
      expect(content).toContain("env: 'test'");
    });

    it("handles empty data array", () => {
      const content = seeder.generateFixtureFile({
        name: "empty-fixture",
        data: [],
        parameters: {},
      });

      expect(content).toContain("emptyFixtureFixture");
      expect(content).toContain("data: []");
    });
  });

  describe("buildSeedConfig", () => {
    it("builds config with provided values", () => {
      const config = seeder.buildSeedConfig(
        "sql",
        "INSERT INTO ...",
        "DELETE FROM ...",
        [{ id: 1 }],
        { env: "test" }
      );

      expect(config.strategy).toBe("sql");
      expect(config.setupScript).toBe("INSERT INTO ...");
      expect(config.cleanupScript).toBe("DELETE FROM ...");
      expect(config.fixtures).toHaveLength(1);
      expect(config.parameters).toEqual({ env: "test" });
    });

    it("uses default strategy when none provided", () => {
      const config = seeder.buildSeedConfig();

      expect(config.strategy).toBe("api");
    });
  });

  describe("executeSeed", () => {
    it("returns success result with fixture count", async () => {
      const config: TestDataSeedConfig = {
        strategy: "api",
        setupScript: "",
        cleanupScript: "",
        fixtures: [{ a: 1 }, { b: 2 }],
      };

      const result = await seeder.executeSeed(config);

      expect(result.success).toBe(true);
      expect(result.recordsCreated).toBe(2);
      expect(result.strategy).toBe("api");
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("returns zero records when no fixtures", async () => {
      const config: TestDataSeedConfig = {
        strategy: "sql",
        setupScript: "",
        cleanupScript: "",
      };

      const result = await seeder.executeSeed(config);

      expect(result.success).toBe(true);
      expect(result.recordsCreated).toBe(0);
    });
  });
});
