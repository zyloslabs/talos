/**
 * Tests for Email/OTP tools (#487)
 */

import { describe, it, expect } from "vitest";
import { TotpGenerator, EmailProvider, type EmailMessage } from "./email-otp.js";

describe("TotpGenerator", () => {
  const totp = new TotpGenerator();

  describe("generate", () => {
    it("generates a 6-digit code by default", () => {
      const code = totp.generate({
        secret: "JBSWY3DPEHPK3PXP", // Base32 encoded "Hello!"
      });

      expect(code).toMatch(/^\d{6}$/);
    });

    it("generates a code with custom digits", () => {
      const code = totp.generate({
        secret: "JBSWY3DPEHPK3PXP",
        digits: 8,
      });

      expect(code).toMatch(/^\d{8}$/);
    });

    it("generates consistent codes for the same time window", () => {
      const code1 = totp.generate({ secret: "JBSWY3DPEHPK3PXP" });
      const code2 = totp.generate({ secret: "JBSWY3DPEHPK3PXP" });

      // Within the same 30-second window, codes should be identical
      expect(code1).toBe(code2);
    });

    it("supports SHA256 algorithm", () => {
      const code = totp.generate({
        secret: "JBSWY3DPEHPK3PXP",
        algorithm: "SHA256",
      });

      expect(code).toMatch(/^\d{6}$/);
    });

    it("supports SHA512 algorithm", () => {
      const code = totp.generate({
        secret: "JBSWY3DPEHPK3PXP",
        algorithm: "SHA512",
      });

      expect(code).toMatch(/^\d{6}$/);
    });

    it("pads short codes with leading zeros", () => {
      // This is non-deterministic due to time, but the format should always be correct
      const code = totp.generate({
        secret: "JBSWY3DPEHPK3PXP",
        digits: 6,
      });

      expect(code.length).toBe(6);
    });
  });
});

describe("EmailProvider", () => {
  describe("createTempEmail", () => {
    it("creates a temporary email account", async () => {
      const provider = new EmailProvider();
      const account = await provider.createTempEmail();

      expect(account.address).toMatch(/^talos-test-.*@tempmail\.test$/);
      expect(account.id).toBeDefined();
      expect(account.createdAt).toBeInstanceOf(Date);
      expect(account.expiresAt).toBeInstanceOf(Date);
      expect(account.expiresAt.getTime()).toBeGreaterThan(account.createdAt.getTime());
    });

    it("creates unique emails on each call", async () => {
      const provider = new EmailProvider();
      const email1 = await provider.createTempEmail();
      const email2 = await provider.createTempEmail();

      expect(email1.address).not.toBe(email2.address);
    });
  });

  describe("extractOtpFromMessage", () => {
    const provider = new EmailProvider();

    it("extracts 6-digit OTP from body", () => {
      const message: EmailMessage = {
        id: "msg-1",
        from: "noreply@example.com",
        subject: "Verification",
        body: "Your verification code is 123456",
        receivedAt: new Date(),
      };

      const code = provider.extractOtpFromMessage(message);
      expect(code).toBe("123456");
    });

    it("extracts OTP from subject line", () => {
      const message: EmailMessage = {
        id: "msg-1",
        from: "noreply@example.com",
        subject: "Your OTP: 789012",
        body: "Please use this code to verify",
        receivedAt: new Date(),
      };

      const code = provider.extractOtpFromMessage(message);
      expect(code).toBe("789012");
    });

    it("extracts OTP with 'code:' prefix", () => {
      const message: EmailMessage = {
        id: "msg-1",
        from: "noreply@example.com",
        subject: "Login Code",
        body: "Your verification code: 456789",
        receivedAt: new Date(),
      };

      const code = provider.extractOtpFromMessage(message);
      expect(code).toBe("456789");
    });

    it("extracts OTP from 'one-time password' phrasing", () => {
      const message: EmailMessage = {
        id: "msg-1",
        from: "noreply@example.com",
        subject: "Security Alert",
        body: "Your one-time password is 987654 and expires in 5 minutes",
        receivedAt: new Date(),
      };

      const code = provider.extractOtpFromMessage(message);
      expect(code).toBe("987654");
    });

    it("returns null when no OTP found", () => {
      const message: EmailMessage = {
        id: "msg-1",
        from: "noreply@example.com",
        subject: "Welcome",
        body: "Welcome to our platform! No codes here.",
        receivedAt: new Date(),
      };

      const code = provider.extractOtpFromMessage(message);
      expect(code).toBeNull();
    });

    it("extracts 4-digit OTP", () => {
      const message: EmailMessage = {
        id: "msg-1",
        from: "noreply@example.com",
        subject: "Verify",
        body: "Your code: 1234",
        receivedAt: new Date(),
      };

      const code = provider.extractOtpFromMessage(message);
      expect(code).toBe("1234");
    });
  });

  describe("waitForOtp", () => {
    it("throws when OTP not received within timeout", async () => {
      const provider = new EmailProvider({
        pollIntervalMs: 10,
        maxWaitMs: 50,
      });

      await expect(provider.waitForOtp("email-1")).rejects.toThrow("OTP not received");
    });
  });
});
