/**
 * EnvManager unit tests.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { EnvManager, EnvValidationError } from "./env-manager.js";

describe("EnvManager", () => {
  let tempDir: string;
  let envPath: string;
  let manager: EnvManager;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "talos-env-test-"));
    envPath = join(tempDir, ".env");
    manager = new EnvManager(envPath);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("list", () => {
    it("returns empty array when .env does not exist", () => {
      expect(manager.list()).toEqual([]);
    });

    it("parses key-value pairs from .env file", () => {
      writeFileSync(envPath, "FOO=bar\nBAZ=qux\n");
      const entries = manager.list();
      expect(entries).toHaveLength(2);
      expect(entries[0]).toEqual({ key: "FOO", value: "bar", masked: false });
      expect(entries[1]).toEqual({ key: "BAZ", value: "qux", masked: false });
    });

    it("masks sensitive values", () => {
      writeFileSync(envPath, 'GITHUB_TOKEN=ghp_1234567890abcdef\nAPI_KEY=sk-abc123\nREGULAR=visible\n');
      const entries = manager.list();
      const tokenEntry = entries.find((e) => e.key === "GITHUB_TOKEN");
      expect(tokenEntry?.masked).toBe(true);
      expect(tokenEntry?.value).not.toBe("ghp_1234567890abcdef");
      expect(tokenEntry?.value).toContain("*");
      const apiKeyEntry = entries.find((e) => e.key === "API_KEY");
      expect(apiKeyEntry?.masked).toBe(true);
      const regularEntry = entries.find((e) => e.key === "REGULAR");
      expect(regularEntry?.masked).toBe(false);
      expect(regularEntry?.value).toBe("visible");
    });

    it("skips comments and empty lines", () => {
      writeFileSync(envPath, "# Comment\n\nFOO=bar\n# Another comment\nBAZ=qux\n");
      expect(manager.list()).toHaveLength(2);
    });

    it("handles quoted values", () => {
      writeFileSync(envPath, 'FOO="hello world"\nBAR=\'single quoted\'\n');
      const entries = manager.list();
      expect(entries[0]?.value).toBe("hello world");
      expect(entries[1]?.value).toBe("single quoted");
    });
  });

  describe("getRaw", () => {
    it("returns undefined when key does not exist", () => {
      expect(manager.getRaw("MISSING")).toBeUndefined();
    });

    it("returns raw unmasked value", () => {
      writeFileSync(envPath, "SECRET_KEY=super-secret-value\n");
      expect(manager.getRaw("SECRET_KEY")).toBe("super-secret-value");
    });
  });

  describe("set", () => {
    it("creates .env file if it does not exist", () => {
      manager.set("NEW_VAR", "value123");
      const content = readFileSync(envPath, "utf-8");
      expect(content).toContain("NEW_VAR=value123");
    });

    it("creates parent directories if needed", () => {
      const nestedPath = join(tempDir, "sub", "dir", ".env");
      const nestedManager = new EnvManager(nestedPath);
      nestedManager.set("NESTED", "works");
      expect(readFileSync(nestedPath, "utf-8")).toContain("NESTED=works");
    });

    it("updates an existing key", () => {
      writeFileSync(envPath, "FOO=old\n");
      manager.set("FOO", "new");
      const content = readFileSync(envPath, "utf-8");
      expect(content).toContain("FOO=new");
      expect(content).not.toContain("FOO=old");
    });

    it("adds a new key preserving existing keys", () => {
      writeFileSync(envPath, "FOO=bar\n");
      manager.set("BAZ", "qux");
      const content = readFileSync(envPath, "utf-8");
      expect(content).toContain("FOO=bar");
      expect(content).toContain("BAZ=qux");
    });

    it("rejects invalid key format", () => {
      expect(() => manager.set("123INVALID", "val")).toThrow(EnvValidationError);
      expect(() => manager.set("KEY WITH SPACES", "val")).toThrow(EnvValidationError);
      expect(() => manager.set("", "val")).toThrow(EnvValidationError);
    });

    it("rejects dangerous system keys", () => {
      expect(() => manager.set("PATH", "/usr/bin")).toThrow(EnvValidationError);
      expect(() => manager.set("HOME", "/tmp")).toThrow(EnvValidationError);
      expect(() => manager.set("LD_PRELOAD", "malicious.so")).toThrow(EnvValidationError);
    });

    it("returns masked entry for sensitive keys", () => {
      const entry = manager.set("MY_SECRET_TOKEN", "sensitive-value-here");
      expect(entry.masked).toBe(true);
      expect(entry.value).toContain("*");
      expect(entry.value).not.toBe("sensitive-value-here");
    });

    it("returns unmasked entry for regular keys", () => {
      const entry = manager.set("REGULAR_VAR", "visible");
      expect(entry.masked).toBe(false);
      expect(entry.value).toBe("visible");
    });

    it("quotes values with spaces", () => {
      manager.set("SPACED", "hello world");
      const content = readFileSync(envPath, "utf-8");
      expect(content).toContain('SPACED="hello world"');
    });
  });

  describe("delete", () => {
    it("returns false when .env does not exist", () => {
      expect(manager.delete("MISSING")).toBe(false);
    });

    it("returns false when key does not exist", () => {
      writeFileSync(envPath, "FOO=bar\n");
      expect(manager.delete("MISSING")).toBe(false);
    });

    it("removes a key and returns true", () => {
      writeFileSync(envPath, "FOO=bar\nBAZ=qux\n");
      expect(manager.delete("FOO")).toBe(true);
      const content = readFileSync(envPath, "utf-8");
      expect(content).not.toContain("FOO");
      expect(content).toContain("BAZ=qux");
    });
  });

  describe("validateRequired", () => {
    it("returns all keys when .env does not exist", () => {
      const missing = manager.validateRequired(["KEY_A", "KEY_B"]);
      expect(missing).toEqual(["KEY_A", "KEY_B"]);
    });

    it("returns missing keys only", () => {
      writeFileSync(envPath, "KEY_A=value\n");
      const missing = manager.validateRequired(["KEY_A", "KEY_B"]);
      expect(missing).toEqual(["KEY_B"]);
    });

    it("considers empty values as missing", () => {
      writeFileSync(envPath, "KEY_A=\n");
      expect(manager.validateRequired(["KEY_A"])).toEqual(["KEY_A"]);
    });

    it("returns empty array when all present", () => {
      writeFileSync(envPath, "KEY_A=a\nKEY_B=b\n");
      expect(manager.validateRequired(["KEY_A", "KEY_B"])).toEqual([]);
    });
  });
});
