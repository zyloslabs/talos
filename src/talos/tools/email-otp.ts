/**
 * Email/OTP Verification Tools (#487)
 *
 * Tools for handling email verification in tests:
 * - Create disposable email addresses
 * - Poll for verification codes
 * - Generate TOTP from secret
 */

import { createHmac } from "node:crypto";
import type { TempEmailAccount, OtpResult, TotpConfig } from "../types.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type EmailProviderOptions = {
  /** API endpoint for temporary email service */
  apiUrl?: string;
  /** API key for email service */
  apiKey?: string;
  /** Poll interval for waiting on OTP emails (ms) */
  pollIntervalMs?: number;
  /** Maximum wait time for OTP emails (ms) */
  maxWaitMs?: number;
};

export type EmailMessage = {
  id: string;
  from: string;
  subject: string;
  body: string;
  receivedAt: Date;
};

// ── TOTP Generator ────────────────────────────────────────────────────────────

export class TotpGenerator {
  /**
   * Generate a TOTP code from a secret and optional config.
   */
  generate(config: TotpConfig): string {
    const digits = config.digits ?? 6;
    const period = config.period ?? 30;
    const algorithm = config.algorithm ?? "SHA1";

    const time = Math.floor(Date.now() / 1000);
    const counter = Math.floor(time / period);

    return this.generateHOTP(config.secret, counter, digits, algorithm);
  }

  /**
   * Generate HOTP (HMAC-based One-Time Password).
   */
  private generateHOTP(
    secret: string,
    counter: number,
    digits: number,
    algorithm: string
  ): string {
    // Decode base32 secret
    const key = this.base32Decode(secret);

    // Counter as 8-byte buffer (big-endian)
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
    counterBuffer.writeUInt32BE(counter & 0xffffffff, 4);

    // HMAC
    const hmacAlg = algorithm === "SHA256" ? "sha256" : algorithm === "SHA512" ? "sha512" : "sha1";
    const hmac = createHmac(hmacAlg, key);
    hmac.update(counterBuffer);
    const hash = hmac.digest();

    // Dynamic truncation
    const offset = hash[hash.length - 1] & 0x0f;
    const code =
      ((hash[offset] & 0x7f) << 24) |
      ((hash[offset + 1] & 0xff) << 16) |
      ((hash[offset + 2] & 0xff) << 8) |
      (hash[offset + 3] & 0xff);

    return (code % Math.pow(10, digits)).toString().padStart(digits, "0");
  }

  /**
   * Decode a base32-encoded string to Buffer.
   */
  private base32Decode(encoded: string): Buffer {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    const cleaned = encoded.toUpperCase().replace(/[^A-Z2-7]/g, "");

    let bits = "";
    for (const char of cleaned) {
      const val = alphabet.indexOf(char);
      if (val === -1) continue;
      bits += val.toString(2).padStart(5, "0");
    }

    const bytes: number[] = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
      bytes.push(parseInt(bits.substring(i, i + 8), 2));
    }

    return Buffer.from(bytes);
  }
}

// ── Email Provider ────────────────────────────────────────────────────────────

export class EmailProvider {
  private pollIntervalMs: number;
  private maxWaitMs: number;

  constructor(options?: EmailProviderOptions) {
    // apiUrl/apiKey reserved for integration with a real temp mail service
    this.pollIntervalMs = options?.pollIntervalMs ?? 2000;
    this.maxWaitMs = options?.maxWaitMs ?? 60000;
  }

  /**
   * Create a temporary email account.
   */
  async createTempEmail(): Promise<TempEmailAccount> {
    // Generate a random email address (portable implementation)
    const randomPart = crypto.randomUUID().split("-")[0];
    const address = `talos-test-${randomPart}@tempmail.test`;

    return {
      address,
      id: crypto.randomUUID(),
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 3600000), // 1 hour
    };
  }

  /**
   * Wait for an OTP code to arrive in the email inbox.
   */
  async waitForOtp(
    emailId: string,
    options?: { pollIntervalMs?: number; maxWaitMs?: number }
  ): Promise<OtpResult> {
    const pollInterval = options?.pollIntervalMs ?? this.pollIntervalMs;
    const maxWait = options?.maxWaitMs ?? this.maxWaitMs;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      const messages = await this.getMessages(emailId);

      for (const message of messages) {
        const code = this.extractOtpFromMessage(message);
        if (code) {
          return {
            code,
            source: "email",
            receivedAt: message.receivedAt,
          };
        }
      }

      // Wait before polling again
      await this.sleep(pollInterval);
    }

    throw new Error(`OTP not received within ${maxWait}ms for email ${emailId}`);
  }

  /**
   * Extract OTP code from an email message.
   */
  extractOtpFromMessage(message: EmailMessage): string | null {
    // Common OTP patterns
    const patterns = [
      /\b(\d{6})\b/, // 6-digit code
      /\b(\d{4})\b/, // 4-digit code
      /verification code[:\s]*(\d{4,8})/i,
      /one.?time.?(?:password|code|pin)[:\s]*(\d{4,8})/i,
      /OTP[:\s]*(\d{4,8})/i,
      /code[:\s]*(\d{4,8})/i,
    ];

    const text = `${message.subject} ${message.body}`;

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1]) return match[1];
    }

    return null;
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private async getMessages(_emailId: string): Promise<EmailMessage[]> {
    // In a real implementation, this would call the temp email API
    // For now, return empty (tests mock this)
    return [];
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
