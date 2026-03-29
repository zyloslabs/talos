/**
 * M365 Config Tests (#317)
 */

import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { homedir } from "node:os";
import { m365ConfigSchema, parseTalosConfig } from "./config.js";

describe("m365ConfigSchema", () => {
  it("returns defaults when parsing empty object", () => {
    const result = m365ConfigSchema.parse({});
    expect(result.enabled).toBe(false);
    expect(result.url).toBe("https://m365.cloud.microsoft/chat/");
    expect(result.browserDataDir).toBe(join(homedir(), ".talos", "browser-data"));
    expect(result.docsDir).toBe(join(homedir(), ".talos", "docs"));
    expect(result.mfaTimeout).toBe(300000);
  });

  it("accepts full M365 config", () => {
    const result = m365ConfigSchema.parse({
      enabled: true,
      url: "https://custom.copilot.com/chat/",
      browserDataDir: "/tmp/browser",
      docsDir: "/tmp/docs",
      mfaTimeout: 600000,
    });
    expect(result.enabled).toBe(true);
    expect(result.url).toBe("https://custom.copilot.com/chat/");
    expect(result.mfaTimeout).toBe(600000);
  });

  it("rejects invalid types", () => {
    expect(() => m365ConfigSchema.parse({ enabled: "yes" })).toThrow();
    expect(() => m365ConfigSchema.parse({ mfaTimeout: "slow" })).toThrow();
  });
});

describe("M365 in talosConfig", () => {
  it("includes M365 section with defaults", () => {
    const config = parseTalosConfig({});
    expect(config.m365).toBeDefined();
    expect(config.m365.enabled).toBe(false);
    expect(config.m365.url).toBe("https://m365.cloud.microsoft/chat/");
  });

  it("merges M365 config with other settings", () => {
    const config = parseTalosConfig({
      m365: { enabled: true, docsDir: "/custom/docs" },
    });
    expect(config.m365.enabled).toBe(true);
    expect(config.m365.docsDir).toBe("/custom/docs");
    expect(config.m365.url).toBe("https://m365.cloud.microsoft/chat/"); // default preserved
    // Other sections still have defaults
    expect(config.runner.defaultBrowser).toBe("chromium");
  });
});
