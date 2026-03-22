/**
 * Config Module Tests
 */

import { describe, it, expect } from "vitest";
import { parseTalosConfig, getDefaultTalosConfig, talosConfigSchema } from "./config.js";

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
