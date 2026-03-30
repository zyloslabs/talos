import { describe, it, expect, beforeEach } from "vitest";
import { validateExternalUrl, isValidJiraProjectKey, isPrivateIp, RateLimiter } from "./security.js";

// ── validateExternalUrl ─────────────────────────────────────────────────────

describe("validateExternalUrl", () => {
  it("accepts a valid HTTPS URL", () => {
    const url = validateExternalUrl("https://mycompany.atlassian.net/rest/api/2");
    expect(url.protocol).toBe("https:");
    expect(url.hostname).toBe("mycompany.atlassian.net");
  });

  it("rejects HTTP URLs by default", () => {
    expect(() => validateExternalUrl("http://example.com")).toThrow("Only HTTPS URLs are allowed");
  });

  it("allows HTTP to localhost when allowLocalhostHttp is set", () => {
    const url = validateExternalUrl("http://localhost:8080/api", { allowLocalhostHttp: true });
    expect(url.hostname).toBe("localhost");
  });

  it("rejects HTTP to non-localhost even when allowLocalhostHttp is set", () => {
    expect(() =>
      validateExternalUrl("http://example.com", { allowLocalhostHttp: true })
    ).toThrow("Only HTTPS URLs are allowed");
  });

  it("rejects ftp:// and other non-HTTP schemes", () => {
    expect(() => validateExternalUrl("ftp://files.example.com")).toThrow("Only HTTPS URLs are allowed");
  });

  it("rejects invalid URL strings", () => {
    expect(() => validateExternalUrl("not a url")).toThrow("Invalid URL format");
  });

  it("rejects URLs with embedded credentials", () => {
    expect(() => validateExternalUrl("https://user:pass@host.com")).toThrow("credentials");
  });

  it("rejects loopback 127.x.x.x addresses", () => {
    expect(() => validateExternalUrl("https://127.0.0.1")).toThrow("private/internal");
    expect(() => validateExternalUrl("https://127.255.255.255")).toThrow("private/internal");
  });

  it("rejects 10.x.x.x private range", () => {
    expect(() => validateExternalUrl("https://10.0.0.1")).toThrow("private/internal");
    expect(() => validateExternalUrl("https://10.255.255.255")).toThrow("private/internal");
  });

  it("rejects 172.16.x.x – 172.31.x.x private range", () => {
    expect(() => validateExternalUrl("https://172.16.0.1")).toThrow("private/internal");
    expect(() => validateExternalUrl("https://172.31.255.255")).toThrow("private/internal");
  });

  it("allows 172.32.x.x (outside private range)", () => {
    const url = validateExternalUrl("https://172.32.0.1");
    expect(url.hostname).toBe("172.32.0.1");
  });

  it("rejects 192.168.x.x private range", () => {
    expect(() => validateExternalUrl("https://192.168.0.1")).toThrow("private/internal");
  });

  it("rejects 169.254.x.x link-local range", () => {
    expect(() => validateExternalUrl("https://169.254.1.1")).toThrow("private/internal");
  });

  it("rejects AWS metadata endpoint IP", () => {
    expect(() => validateExternalUrl("https://169.254.169.254")).toThrow("private/internal");
  });

  it("accepts public IPs", () => {
    const url = validateExternalUrl("https://8.8.8.8");
    expect(url.hostname).toBe("8.8.8.8");
  });
});

// ── isPrivateIp ─────────────────────────────────────────────────────────────

describe("isPrivateIp", () => {
  it("detects IPv6 loopback ::1", () => {
    expect(isPrivateIp("::1")).toBe(true);
    expect(isPrivateIp("[::1]")).toBe(true);
  });

  it("returns false for non-IP hostnames", () => {
    expect(isPrivateIp("mycompany.atlassian.net")).toBe(false);
  });

  it("detects 0.0.0.0/8 as private", () => {
    expect(isPrivateIp("0.0.0.1")).toBe(true);
  });
});

// ── isValidJiraProjectKey ───────────────────────────────────────────────────

describe("isValidJiraProjectKey", () => {
  it("accepts valid project keys", () => {
    expect(isValidJiraProjectKey("PROJ")).toBe(true);
    expect(isValidJiraProjectKey("MY_APP")).toBe(true);
    expect(isValidJiraProjectKey("AB")).toBe(true);
    expect(isValidJiraProjectKey("TEST123")).toBe(true);
  });

  it("rejects keys starting with a digit", () => {
    expect(isValidJiraProjectKey("1PROJ")).toBe(false);
  });

  it("rejects lowercase keys", () => {
    expect(isValidJiraProjectKey("proj")).toBe(false);
    expect(isValidJiraProjectKey("Proj")).toBe(false);
  });

  it("rejects single-character keys", () => {
    expect(isValidJiraProjectKey("A")).toBe(false);
  });

  it("rejects keys with JQL injection payloads", () => {
    expect(isValidJiraProjectKey('" OR summary ~ "secrets')).toBe(false);
    expect(isValidJiraProjectKey("PROJ; DROP TABLE")).toBe(false);
    expect(isValidJiraProjectKey("PROJ%22")).toBe(false);
  });

  it("rejects keys with special characters", () => {
    expect(isValidJiraProjectKey("MY-PROJ")).toBe(false);
    expect(isValidJiraProjectKey("MY.PROJ")).toBe(false);
    expect(isValidJiraProjectKey("MY PROJ")).toBe(false);
  });
});

// ── RateLimiter ─────────────────────────────────────────────────────────────

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter(60_000);
  });

  it("allows the first call", () => {
    const result = limiter.check("app-1");
    expect(result.limited).toBe(false);
  });

  it("blocks a second call within the cooldown window", () => {
    limiter.check("app-1"); // first call — allowed
    const result = limiter.check("app-1"); // immediate second call — blocked
    expect(result.limited).toBe(true);
    if (result.limited) {
      expect(result.retryAfterMs).toBeGreaterThan(0);
      expect(result.retryAfterMs).toBeLessThanOrEqual(60_000);
    }
  });

  it("tracks keys independently", () => {
    limiter.check("app-1");
    const result = limiter.check("app-2");
    expect(result.limited).toBe(false);
  });

  it("allows after cooldown has elapsed (short cooldown test)", () => {
    const shortLimiter = new RateLimiter(10); // 10ms cooldown
    shortLimiter.check("key");
    // Use a spin-wait to ensure we pass the cooldown
    const start = Date.now();
    while (Date.now() - start < 15) {
      /* spin */
    }
    const result = shortLimiter.check("key");
    expect(result.limited).toBe(false);
  });

  it("reset clears tracking for a key", () => {
    limiter.check("app-1");
    limiter.reset("app-1");
    const result = limiter.check("app-1");
    expect(result.limited).toBe(false);
  });
});
