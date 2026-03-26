/**
 * Config Module Tests
 */

import { describe, it, expect } from "vitest";
import { parseTalosConfig, getDefaultTalosConfig, talosConfigSchema, jdbcDataSourceConfigSchema, atlassianConfigSchema } from "./config.js";

describe("parseTalosConfig", () => {
  it("should return default config when no input provided", () => {
    const config = parseTalosConfig(undefined);
    const defaults = getDefaultTalosConfig();
    
    expect(config.vectorDb.path).toBe(defaults.vectorDb.path);
    expect(config.embedding.model).toBe(defaults.embedding.model);
    expect(config.runner.defaultBrowser).toBe(defaults.runner.defaultBrowser);
  });

  it("should merge partial config with defaults", () => {
    const config = parseTalosConfig({
      runner: { defaultBrowser: "firefox" },
    });
    
    expect(config.runner.defaultBrowser).toBe("firefox");
    expect(config.runner.headless).toBe(true); // default
    expect(config.embedding.model).toBe("text-embedding-3-small"); // default
  });

  it("should validate browser type", () => {
    expect(() =>
      parseTalosConfig({
        runner: { defaultBrowser: "invalid" },
      })
    ).toThrow();
  });

  it("should validate numeric constraints", () => {
    expect(() =>
      parseTalosConfig({
        runner: { timeout: -1 },
      })
    ).toThrow();
  });

  it("should accept valid complete config", () => {
    const input = {
      vectorDb: { path: "/custom/lancedb" },
      embedding: { model: "text-embedding-3-large", dimensions: 3072 },
      runner: {
        defaultBrowser: "webkit",
        headless: false,
        timeout: 60000,
        retries: 5,
        slowMo: 100,
        traceMode: "on",
        video: "on",
      },
      healing: {
        enabled: false,
        maxAttempts: 5,
        cooldownMinutes: 30,
        autoHeal: false,
      },
      generator: {
        model: "gpt-4",
        maxRetries: 5,
        contextChunks: 10,
      },
      export: { path: "/custom/exports" },
      artifacts: { path: "/custom/artifacts", retentionDays: 90 },
      discovery: {
        chunkSize: 2000,
        chunkOverlap: 400,
        maxFileSizeKb: 200,
        excludePatterns: ["*.log"],
      },
      githubMcp: { rateLimitPerMinute: 60, cacheEnabled: false },
    };

    const config = parseTalosConfig(input);
    
    expect(config.vectorDb.path).toBe("/custom/lancedb");
    expect(config.embedding.dimensions).toBe(3072);
    expect(config.runner.defaultBrowser).toBe("webkit");
    expect(config.healing.enabled).toBe(false);
  });
});

describe("getDefaultTalosConfig", () => {
  it("should return valid default configuration", () => {
    const config = getDefaultTalosConfig();
    
    expect(config.vectorDb.path).toContain("vectordb");
    expect(config.embedding.model).toBe("text-embedding-3-small");
    expect(config.embedding.dimensions).toBe(1536);
    expect(config.runner.defaultBrowser).toBe("chromium");
    expect(config.runner.headless).toBe(true);
    expect(config.runner.timeout).toBe(30000);
    expect(config.runner.retries).toBe(2);
    expect(config.healing.enabled).toBe(true);
    expect(config.healing.maxRetries).toBe(3);
    expect(config.generator.maxContextChunks).toBe(10);
    expect(config.artifacts.retentionDays).toBe(30);
  });

  it("should return a new object each time", () => {
    const config1 = getDefaultTalosConfig();
    const config2 = getDefaultTalosConfig();
    
    expect(config1).not.toBe(config2);
    expect(config1).toEqual(config2);
  });
});

describe("talosConfigSchema", () => {
  it("should be a valid Zod schema", () => {
    expect(talosConfigSchema.parse).toBeDefined();
    expect(typeof talosConfigSchema.parse).toBe("function");
  });
});

describe("jdbcDataSourceConfigSchema", () => {
  it("should return defaults when no input provided", () => {
    const config = jdbcDataSourceConfigSchema.parse({});
    expect(config.enabled).toBe(false);
    expect(config.driverType).toBe("postgresql");
    expect(config.readOnly).toBe(true);
    expect(config.jdbcUrl).toBe("");
    expect(config.label).toBe("");
  });

  it("should accept valid config", () => {
    const config = jdbcDataSourceConfigSchema.parse({
      enabled: true,
      jdbcUrl: "jdbc:postgresql://localhost:5432/mydb",
      driverType: "oracle",
      usernameVaultRef: "vault:db-user",
      passwordVaultRef: "vault:db-pass",
      label: "My Oracle DB",
      readOnly: true,
    });

    expect(config.enabled).toBe(true);
    expect(config.driverType).toBe("oracle");
    expect(config.label).toBe("My Oracle DB");
  });

  it("should reject invalid driver type", () => {
    expect(() => jdbcDataSourceConfigSchema.parse({ driverType: "invalid" })).toThrow();
  });
});

describe("atlassianConfigSchema", () => {
  it("should return defaults when no input provided", () => {
    const config = atlassianConfigSchema.parse({});
    expect(config.enabled).toBe(false);
    expect(config.deploymentType).toBe("cloud");
    expect(config.jiraSslVerify).toBe(true);
    expect(config.confluenceSslVerify).toBe(true);
    expect(config.confluenceSpaces).toEqual([]);
    expect(config.transport).toBe("docker");
  });

  it("should accept valid cloud config", () => {
    const config = atlassianConfigSchema.parse({
      enabled: true,
      deploymentType: "cloud",
      jiraUrl: "https://test.atlassian.net",
      jiraProject: "TEST",
      jiraUsernameVaultRef: "vault:jira-user",
      jiraApiTokenVaultRef: "vault:jira-token",
      confluenceUrl: "https://test.atlassian.net/wiki",
      confluenceSpaces: ["DEV", "QA"],
    });

    expect(config.enabled).toBe(true);
    expect(config.deploymentType).toBe("cloud");
    expect(config.confluenceSpaces).toEqual(["DEV", "QA"]);
  });

  it("should accept datacenter deployment type", () => {
    const config = atlassianConfigSchema.parse({ deploymentType: "datacenter" });
    expect(config.deploymentType).toBe("datacenter");
  });

  it("should reject invalid deployment type", () => {
    expect(() => atlassianConfigSchema.parse({ deploymentType: "invalid" })).toThrow();
  });
});

describe("talosConfigSchema with new fields", () => {
  it("should include jdbcDataSources and atlassian in default config", () => {
    const config = getDefaultTalosConfig();
    expect(config.jdbcDataSources).toEqual([]);
    expect(config.atlassian.enabled).toBe(false);
    expect(config.atlassian.deploymentType).toBe("cloud");
  });

  it("should parse config with JDBC data sources", () => {
    const config = parseTalosConfig({
      jdbcDataSources: [
        { enabled: true, jdbcUrl: "jdbc:pg://x", driverType: "postgresql", label: "PG" },
      ],
    });

    expect(config.jdbcDataSources).toHaveLength(1);
    expect(config.jdbcDataSources[0].label).toBe("PG");
  });

  it("should parse config with Atlassian settings", () => {
    const config = parseTalosConfig({
      atlassian: {
        enabled: true,
        jiraUrl: "https://jira.example.com",
        jiraProject: "PROJ",
      },
    });

    expect(config.atlassian.enabled).toBe(true);
    expect(config.atlassian.jiraUrl).toBe("https://jira.example.com");
  });
});
