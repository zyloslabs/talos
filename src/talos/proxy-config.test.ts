/**
 * Proxy Config Tests (#319)
 */

import { describe, it, expect, afterEach } from "vitest";
import { proxyConfigSchema, parseTalosConfig } from "./config.js";

describe("proxyConfigSchema", () => {
  it("returns defaults when parsing empty object", () => {
    const result = proxyConfigSchema.parse({});
    expect(result.enabled).toBe(false);
    expect(result.httpProxy).toBeUndefined();
    expect(result.httpsProxy).toBeUndefined();
    expect(result.noProxy).toBeUndefined();
  });

  it("accepts full proxy config", () => {
    const result = proxyConfigSchema.parse({
      enabled: true,
      httpProxy: "http://proxy.corp.com:8080",
      httpsProxy: "http://proxy.corp.com:8443",
      noProxy: "localhost,127.0.0.1,.corp.com",
    });
    expect(result.enabled).toBe(true);
    expect(result.httpProxy).toBe("http://proxy.corp.com:8080");
    expect(result.httpsProxy).toBe("http://proxy.corp.com:8443");
    expect(result.noProxy).toBe("localhost,127.0.0.1,.corp.com");
  });

  it("defaults to disabled when only URLs provided", () => {
    const result = proxyConfigSchema.parse({
      httpProxy: "http://proxy:3128",
    });
    expect(result.enabled).toBe(false);
    expect(result.httpProxy).toBe("http://proxy:3128");
  });
});

describe("proxy in talosConfig", () => {
  it("includes proxy section with defaults", () => {
    const config = parseTalosConfig({});
    expect(config.proxy).toBeDefined();
    expect(config.proxy.enabled).toBe(false);
  });

  it("merges proxy config with other settings", () => {
    const config = parseTalosConfig({
      proxy: { enabled: true, httpProxy: "http://proxy:8080" },
    });
    expect(config.proxy.enabled).toBe(true);
    expect(config.proxy.httpProxy).toBe("http://proxy:8080");
    // Other sections still have defaults
    expect(config.runner.defaultBrowser).toBe("chromium");
  });
});

describe("proxy env var application", () => {
  const origEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it("sets HTTP_PROXY when proxy enabled", () => {
    const config = parseTalosConfig({
      proxy: { enabled: true, httpProxy: "http://proxy:8080", httpsProxy: "http://proxy:8443", noProxy: "localhost" },
    });

    // Simulate the env var application logic from src/index.ts
    if (config.proxy.enabled) {
      if (config.proxy.httpProxy) process.env.HTTP_PROXY = config.proxy.httpProxy;
      if (config.proxy.httpsProxy) process.env.HTTPS_PROXY = config.proxy.httpsProxy;
      if (config.proxy.noProxy) process.env.NO_PROXY = config.proxy.noProxy;
    }

    expect(process.env.HTTP_PROXY).toBe("http://proxy:8080");
    expect(process.env.HTTPS_PROXY).toBe("http://proxy:8443");
    expect(process.env.NO_PROXY).toBe("localhost");
  });

  it("does not set env vars when proxy disabled", () => {
    delete process.env.HTTP_PROXY;
    delete process.env.HTTPS_PROXY;
    delete process.env.NO_PROXY;

    const config = parseTalosConfig({
      proxy: { enabled: false, httpProxy: "http://proxy:8080" },
    });

    if (config.proxy.enabled) {
      if (config.proxy.httpProxy) process.env.HTTP_PROXY = config.proxy.httpProxy;
    }

    expect(process.env.HTTP_PROXY).toBeUndefined();
  });
});
