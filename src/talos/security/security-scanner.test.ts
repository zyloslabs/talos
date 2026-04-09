import { describe, it, expect } from "vitest";
import { SecurityScanner } from "./security-scanner.js";
import type { SecurityScanInput } from "./types.js";

function makeInput(overrides: Partial<SecurityScanInput> = {}): SecurityScanInput {
  return {
    url: "https://example.com",
    headers: {},
    body: "<html><head></head><body>Hello</body></html>",
    statusCode: 200,
    ...overrides,
  };
}

describe("SecurityScanner", () => {
  const scanner = new SecurityScanner();

  // ── Header checks ─────────────────────────────────────────────────────────

  describe("header checks", () => {
    it("reports all missing security headers on an empty header set", () => {
      const result = scanner.scan(makeInput());
      const ruleIds = result.findings.map((f) => f.ruleId);
      expect(ruleIds).toContain("missing-csp");
      expect(ruleIds).toContain("missing-hsts");
      expect(ruleIds).toContain("missing-x-frame-options");
      expect(ruleIds).toContain("missing-x-content-type-options");
      expect(ruleIds).toContain("missing-referrer-policy");
    });

    it("does not report headers that are present", () => {
      const result = scanner.scan(
        makeInput({
          headers: {
            "Content-Security-Policy": "default-src 'self'",
            "Strict-Transport-Security": "max-age=31536000",
            "X-Frame-Options": "DENY",
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "strict-origin-when-cross-origin",
          },
        })
      );
      const headerRuleIds = result.findings
        .filter((f) => f.ruleId.startsWith("missing-"))
        .map((f) => f.ruleId);
      expect(headerRuleIds).toHaveLength(0);
    });

    it("handles case-insensitive headers", () => {
      const result = scanner.scan(
        makeInput({
          headers: {
            "content-security-policy": "default-src 'self'",
            "STRICT-TRANSPORT-SECURITY": "max-age=31536000",
            "x-frame-options": "DENY",
            "x-content-type-options": "nosniff",
            "REFERRER-POLICY": "no-referrer",
          },
        })
      );
      const headerRuleIds = result.findings
        .filter((f) => f.ruleId.startsWith("missing-"))
        .map((f) => f.ruleId);
      expect(headerRuleIds).toHaveLength(0);
    });
  });

  // ── Mixed content ─────────────────────────────────────────────────────────

  describe("mixed content checks", () => {
    it("detects HTTP resources on HTTPS pages", () => {
      const result = scanner.scan(
        makeInput({
          url: "https://example.com",
          body: `<img src="http://evil.com/tracker.gif"><script src="http://cdn.example.com/app.js"></script>`,
        })
      );
      const mixed = result.findings.find((f) => f.ruleId === "mixed-content");
      expect(mixed).toBeDefined();
      expect(mixed!.severity).toBe("high");
    });

    it("does not flag mixed content on HTTP pages", () => {
      const result = scanner.scan(
        makeInput({
          url: "http://example.com",
          body: `<img src="http://cdn.example.com/logo.png">`,
        })
      );
      const mixed = result.findings.find((f) => f.ruleId === "mixed-content");
      expect(mixed).toBeUndefined();
    });

    it("does not flag HTTPS resources on HTTPS pages", () => {
      const result = scanner.scan(
        makeInput({
          url: "https://example.com",
          body: `<img src="https://cdn.example.com/logo.png">`,
        })
      );
      const mixed = result.findings.find((f) => f.ruleId === "mixed-content");
      expect(mixed).toBeUndefined();
    });
  });

  // ── Exposed secrets ───────────────────────────────────────────────────────

  describe("exposed secrets", () => {
    it("detects AWS access keys", () => {
      const result = scanner.scan(
        makeInput({
          body: `<script>const key = "AKIAIOSFODNN7EXAMPLE";</script>`,
        })
      );
      const finding = result.findings.find((f) => f.ruleId === "exposed-aws-key");
      expect(finding).toBeDefined();
      expect(finding!.severity).toBe("critical");
      expect(finding!.evidence).toContain("***REDACTED***");
    });

    it("detects GitHub tokens", () => {
      const result = scanner.scan(
        makeInput({
          body: `var token = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef12345678";`,
        })
      );
      const finding = result.findings.find((f) => f.ruleId === "exposed-github-token");
      expect(finding).toBeDefined();
      expect(finding!.severity).toBe("critical");
    });

    it("detects generic API keys", () => {
      const result = scanner.scan(
        makeInput({
          body: `const config = { api_key: "sk_live_ABCDEFGHIJKLMNOPabcde" };`,
        })
      );
      const finding = result.findings.find((f) => f.ruleId === "exposed-generic-api-key");
      expect(finding).toBeDefined();
    });

    it("detects JWT tokens", () => {
      const result = scanner.scan(
        makeInput({
          body: `localStorage.setItem("token", "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoiYWRtaW4ifQ.dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk");`,
        })
      );
      const finding = result.findings.find((f) => f.ruleId === "exposed-jwt");
      expect(finding).toBeDefined();
    });

    it("detects private keys", () => {
      const result = scanner.scan(
        makeInput({
          body: `-----BEGIN RSA PRIVATE KEY-----\nMIIBogIBAAJ...`,
        })
      );
      const finding = result.findings.find((f) => f.ruleId === "exposed-private-key");
      expect(finding).toBeDefined();
      expect(finding!.severity).toBe("critical");
    });

    it("detects password values", () => {
      const result = scanner.scan(
        makeInput({
          body: `<script>const password = "SuperSecret123!";</script>`,
        })
      );
      const finding = result.findings.find((f) => f.ruleId === "exposed-password-field-value");
      expect(finding).toBeDefined();
    });

    it("does not flag clean HTML", () => {
      const result = scanner.scan(
        makeInput({
          body: `<html><body><h1>Welcome</h1><p>No secrets here.</p></body></html>`,
        })
      );
      const secretFindings = result.findings.filter((f) => f.ruleId.startsWith("exposed-"));
      expect(secretFindings).toHaveLength(0);
    });
  });

  // ── Misconfiguration checks ───────────────────────────────────────────────

  describe("misconfiguration checks", () => {
    it("detects server version exposure", () => {
      const result = scanner.scan(
        makeInput({
          headers: { Server: "Apache/2.4.51 (Ubuntu)" },
        })
      );
      const finding = result.findings.find((f) => f.ruleId === "server-version-exposed");
      expect(finding).toBeDefined();
      expect(finding!.severity).toBe("low");
    });

    it("does not flag generic server header", () => {
      const result = scanner.scan(
        makeInput({
          headers: { Server: "nginx" },
        })
      );
      const finding = result.findings.find((f) => f.ruleId === "server-version-exposed");
      expect(finding).toBeUndefined();
    });

    it("detects X-Powered-By header", () => {
      const result = scanner.scan(
        makeInput({
          headers: { "X-Powered-By": "Express" },
        })
      );
      const finding = result.findings.find((f) => f.ruleId === "x-powered-by-exposed");
      expect(finding).toBeDefined();
    });

    it("detects CORS wildcard", () => {
      const result = scanner.scan(
        makeInput({
          headers: { "Access-Control-Allow-Origin": "*" },
        })
      );
      const finding = result.findings.find((f) => f.ruleId === "cors-wildcard");
      expect(finding).toBeDefined();
      expect(finding!.severity).toBe("medium");
    });

    it("does not flag restricted CORS origin", () => {
      const result = scanner.scan(
        makeInput({
          headers: { "Access-Control-Allow-Origin": "https://app.example.com" },
        })
      );
      const finding = result.findings.find((f) => f.ruleId === "cors-wildcard");
      expect(finding).toBeUndefined();
    });

    it("detects directory listing", () => {
      const result = scanner.scan(
        makeInput({
          body: `<html><head><title>Index of /uploads/</title></head><body><h1>Index of /uploads/</h1></body></html>`,
        })
      );
      const finding = result.findings.find((f) => f.ruleId === "directory-listing");
      expect(finding).toBeDefined();
      expect(finding!.severity).toBe("medium");
    });
  });

  // ── Result structure ──────────────────────────────────────────────────────

  describe("result structure", () => {
    it("returns correct structure with all fields", () => {
      const result = scanner.scan(makeInput());
      expect(result.url).toBe("https://example.com");
      expect(result.scannedAt).toBeTruthy();
      expect(typeof result.totalFindings).toBe("number");
      expect(result.findingsBySeverity).toHaveProperty("critical");
      expect(result.findingsBySeverity).toHaveProperty("high");
      expect(result.findingsBySeverity).toHaveProperty("medium");
      expect(result.findingsBySeverity).toHaveProperty("low");
      expect(result.findingsBySeverity).toHaveProperty("info");
      expect(typeof result.riskScore).toBe("number");
      expect(result.riskScore).toBeGreaterThanOrEqual(0);
      expect(result.riskScore).toBeLessThanOrEqual(100);
    });

    it("risk score is 0 when all headers present and no issues", () => {
      const result = scanner.scan(
        makeInput({
          url: "http://example.com", // HTTP to avoid mixed-content scope
          headers: {
            "Content-Security-Policy": "default-src 'self'",
            "Strict-Transport-Security": "max-age=31536000",
            "X-Frame-Options": "DENY",
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "no-referrer",
          },
          body: "<html><body>Clean page</body></html>",
        })
      );
      expect(result.totalFindings).toBe(0);
      expect(result.riskScore).toBe(0);
    });

    it("risk score is capped at 100", () => {
      // Inject many critical secrets to push score above 100
      const body = Array.from({ length: 10 }, (_, i) =>
        `-----BEGIN PRIVATE KEY-----\nkey${i}\nAKIA${"A".repeat(16)}\nghp_${"A".repeat(40)}\n`
      ).join("\n");
      const result = scanner.scan(makeInput({ body }));
      expect(result.riskScore).toBeLessThanOrEqual(100);
    });

    it("totalFindings matches findings array length", () => {
      const result = scanner.scan(makeInput());
      expect(result.totalFindings).toBe(result.findings.length);
    });

    it("all findings have required fields", () => {
      const result = scanner.scan(makeInput());
      for (const f of result.findings) {
        expect(f.ruleId).toBeTruthy();
        expect(f.title).toBeTruthy();
        expect(f.description).toBeTruthy();
        expect(f.severity).toBeTruthy();
        expect(f.owaspCategory).toBeTruthy();
        expect(f.remediation).toBeTruthy();
      }
    });
  });
});
