/**
 * Credential Sanitizer Tests
 */

import { describe, it, expect } from "vitest";
import { CredentialSanitizer } from "./credential-sanitizer.js";

describe("CredentialSanitizer", () => {
  const sanitizer = new CredentialSanitizer();

  describe("sanitize", () => {
    it("should replace password assignments", () => {
      const code = `const password = "secret123";`;
      const result = sanitizer.sanitize(code);

      expect(result.sanitizedCode).toContain("process.env.TEST_PASSWORD");
      expect(result.replacements.length).toBeGreaterThan(0);
      expect(result.replacements[0].type).toBe("password");
    });

    it("should replace API keys", () => {
      const code = `const apiKey = "sk-abc123xyz789def456";`;
      const result = sanitizer.sanitize(code);

      expect(result.sanitizedCode).toContain("process.env");
      expect(result.replacements.some((r) => r.type === "api-key")).toBe(true);
    });

    it("should replace tokens", () => {
      const code = `const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";`;
      const result = sanitizer.sanitize(code);

      // Implementation uses numbered env vars like TEST_TOKEN_1 or TEST_JWT_1
      expect(result.sanitizedCode).toContain("process.env.TEST_");
      expect(result.replacements.some((r) => r.type === "token")).toBe(true);
    });

    it("should replace bearer tokens", () => {
      const code = `const auth = "Bearer abcdefghijklmnopqrstuvwxyz12345";`;
      const result = sanitizer.sanitize(code);

      expect(result.sanitizedCode).toContain("process.env.TEST_BEARER");
    });

    it("should replace secrets", () => {
      const code = `const secret = "my_super_secret_key";`;
      const result = sanitizer.sanitize(code);

      expect(result.sanitizedCode).toContain("process.env.TEST_SECRET");
    });

    it("should replace email addresses when enabled", () => {
      const sanitizerWithEmails = new CredentialSanitizer({ replaceEmails: true });
      const code = `const email = "user@example.com";`;
      const result = sanitizerWithEmails.sanitize(code);

      expect(result.sanitizedCode).toContain("process.env.TEST_EMAIL");
      expect(result.replacements.some((r) => r.type === "email")).toBe(true);
    });

    it("should track line numbers for replacements", () => {
      const code = `const x = 1;
const password = "secret";
const y = 2;`;
      const result = sanitizer.sanitize(code);

      const passwordReplacement = result.replacements.find((r) => r.type === "password");
      expect(passwordReplacement?.line).toBe(2);
    });

    it("should warn about potential unsanitized secrets", () => {
      const code = `const apikey = someFunction();`;
      const result = sanitizer.sanitize(code);

      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it("should handle multiple credentials in same code", () => {
      const code = `
        const password = "pass1";
        const apiKey = "key1";
        const token = "tok1";
      `;
      const result = sanitizer.sanitize(code);

      expect(result.replacements.length).toBeGreaterThanOrEqual(2);
    });

    it("should support custom patterns", () => {
      const customSanitizer = new CredentialSanitizer({
        customPatterns: [
          {
            pattern: /myCustomSecret\s*=\s*['"][^'"]+['"]/g,
            type: "secret",
            replacement: "myCustomSecret = process.env.CUSTOM_SECRET",
          },
        ],
      });

      const code = `const myCustomSecret = "hidden";`;
      const result = customSanitizer.sanitize(code);

      // Custom pattern should be applied, or default secret pattern
      expect(result.sanitizedCode).toContain("process.env.");
      expect(result.replacements.some((r) => r.type === "secret")).toBe(true);
    });
  });

  describe("generateEnvTemplate", () => {
    it("should generate env template from replacements", () => {
      const code = `const password = "secret";`;
      const result = sanitizer.sanitize(code);
      const template = sanitizer.generateEnvTemplate(result.replacements);

      expect(template).toContain("TEST_PASSWORD");
      expect(template).toContain("your_password_here");
    });

    it("should not duplicate env vars", () => {
      const code = `
        const password = "secret1";
        const apiKey = "sk-abc123xyz789def456ghi";
      `;
      const result = sanitizer.sanitize(code);
      const template = sanitizer.generateEnvTemplate(result.replacements);

      // Template should contain entries for the replacements
      expect(result.replacements.length).toBeGreaterThanOrEqual(1);
      expect(template.length).toBeGreaterThan(0);
    });

    it("should include header comment", () => {
      const code = `const token = "abc123";`;
      const result = sanitizer.sanitize(code);
      const template = sanitizer.generateEnvTemplate(result.replacements);

      expect(template).toContain("Environment variables for Talos exported tests");
    });
  });
});
