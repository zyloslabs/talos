/**
 * Environment variable manager for Talos.
 *
 * Reads and writes .env files at ~/.talos/.env with security features:
 * - Masks sensitive values (SECRET, TOKEN, KEY, PASSWORD, PAT)
 * - Rejects dangerous system keys (PATH, HOME, etc.)
 * - Validates key format
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

// ── Constants ─────────────────────────────────────────────────────────────────

const SENSITIVE_PATTERNS = [
  "SECRET",
  "TOKEN",
  "KEY",
  "PASSWORD",
  "PAT",
  "CREDENTIAL",
  "API_KEY",
  "PRIVATE",
];

const DANGEROUS_KEYS = new Set([
  "PATH",
  "HOME",
  "USER",
  "SHELL",
  "LANG",
  "TERM",
  "HOSTNAME",
  "LOGNAME",
  "DISPLAY",
  "LD_LIBRARY_PATH",
  "LD_PRELOAD",
  "DYLD_LIBRARY_PATH",
  "DYLD_INSERT_LIBRARIES",
  "NODE_OPTIONS",
  "NODE_PATH",
]);

const ENV_KEY_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;

// ── Types ─────────────────────────────────────────────────────────────────────

export type EnvEntry = {
  key: string;
  value: string;
  masked: boolean;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function isSensitiveKey(key: string): boolean {
  const upper = key.toUpperCase();
  return SENSITIVE_PATTERNS.some((p) => upper.includes(p));
}

function maskValue(value: string): string {
  if (value.length <= 4) return "****";
  return value.slice(0, 2) + "*".repeat(Math.min(value.length - 4, 20)) + value.slice(-2);
}

// ── EnvManager ────────────────────────────────────────────────────────────────

export class EnvManager {
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  /**
   * Parse .env file contents into key-value pairs.
   * Handles comments, empty lines, quoted values.
   */
  private parse(content: string): Map<string, string> {
    const entries = new Map<string, string>();
    for (const rawLine of content.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eqIdx = line.indexOf("=");
      if (eqIdx === -1) continue;
      const key = line.slice(0, eqIdx).trim();
      let value = line.slice(eqIdx + 1).trim();
      // Strip surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (ENV_KEY_REGEX.test(key)) {
        entries.set(key, value);
      }
    }
    return entries;
  }

  /**
   * Serialize entries back to .env format.
   */
  private serialize(entries: Map<string, string>): string {
    const lines: string[] = [];
    for (const [key, value] of entries) {
      // Quote values containing spaces or special chars
      const needsQuotes = /[\s#"'\\]/.test(value) || value === "";
      lines.push(needsQuotes ? `${key}="${value}"` : `${key}=${value}`);
    }
    return lines.join("\n") + "\n";
  }

  /**
   * Read all env entries. Sensitive values are masked.
   */
  list(): EnvEntry[] {
    if (!existsSync(this.filePath)) return [];
    const content = readFileSync(this.filePath, "utf-8");
    const entries = this.parse(content);
    const result: EnvEntry[] = [];
    for (const [key, value] of entries) {
      const sensitive = isSensitiveKey(key);
      result.push({
        key,
        value: sensitive ? maskValue(value) : value,
        masked: sensitive,
      });
    }
    return result;
  }

  /**
   * Get the raw (unmasked) value for a specific key.
   */
  getRaw(key: string): string | undefined {
    if (!existsSync(this.filePath)) return undefined;
    const content = readFileSync(this.filePath, "utf-8");
    return this.parse(content).get(key);
  }

  /**
   * Set or update a single env variable.
   * Returns the updated entry.
   */
  set(key: string, value: string): EnvEntry {
    if (!ENV_KEY_REGEX.test(key)) {
      throw new EnvValidationError(`Invalid key format: "${key}". Keys must match [A-Za-z_][A-Za-z0-9_]*`);
    }
    if (DANGEROUS_KEYS.has(key.toUpperCase())) {
      throw new EnvValidationError(`Dangerous key rejected: "${key}". System environment variables cannot be modified.`);
    }

    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const content = existsSync(this.filePath) ? readFileSync(this.filePath, "utf-8") : "";
    const entries = this.parse(content);
    entries.set(key, value);
    writeFileSync(this.filePath, this.serialize(entries), { mode: 0o600 });

    const sensitive = isSensitiveKey(key);
    return {
      key,
      value: sensitive ? maskValue(value) : value,
      masked: sensitive,
    };
  }

  /**
   * Delete an env variable.
   */
  delete(key: string): boolean {
    if (!existsSync(this.filePath)) return false;
    const content = readFileSync(this.filePath, "utf-8");
    const entries = this.parse(content);
    if (!entries.has(key)) return false;
    entries.delete(key);
    writeFileSync(this.filePath, this.serialize(entries), { mode: 0o600 });
    return true;
  }

  /**
   * Validate that required env vars are present.
   * Returns list of missing keys.
   */
  validateRequired(requiredKeys: string[]): string[] {
    if (!existsSync(this.filePath)) return requiredKeys;
    const content = readFileSync(this.filePath, "utf-8");
    const entries = this.parse(content);
    return requiredKeys.filter((k) => !entries.has(k) || entries.get(k) === "");
  }
}

// ── Errors ────────────────────────────────────────────────────────────────────

export class EnvValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvValidationError";
  }
}
