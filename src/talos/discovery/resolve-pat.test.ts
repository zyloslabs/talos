import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resolveGitHubPat } from "./resolve-pat.js";

describe("resolveGitHubPat", () => {
  const saved: Record<string, string | undefined> = {};
  const keys = [
    "GHE_PERSONAL_ACCESS_TOKEN",
    "GITHUB_PERSONAL_ACCESS_TOKEN",
    "GITHUB_TOKEN",
    "COPILOT_GITHUB_TOKEN",
  ];

  beforeEach(() => {
    for (const k of keys) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of keys) {
      if (saved[k] !== undefined) {
        process.env[k] = saved[k];
      } else {
        delete process.env[k];
      }
    }
  });

  it("returns GHE_PERSONAL_ACCESS_TOKEN first for GHE hosts", () => {
    process.env.GHE_PERSONAL_ACCESS_TOKEN = "ghe-token";
    process.env.GITHUB_PERSONAL_ACCESS_TOKEN = "gh-token";
    expect(resolveGitHubPat({ isGhe: true })).toBe("ghe-token");
  });

  it("falls back to GITHUB_PERSONAL_ACCESS_TOKEN for GHE when GHE key missing", () => {
    process.env.GITHUB_PERSONAL_ACCESS_TOKEN = "gh-token";
    expect(resolveGitHubPat({ isGhe: true })).toBe("gh-token");
  });

  it("returns GITHUB_PERSONAL_ACCESS_TOKEN first for github.com hosts", () => {
    process.env.GITHUB_PERSONAL_ACCESS_TOKEN = "gh-token";
    process.env.GITHUB_TOKEN = "generic-token";
    expect(resolveGitHubPat({ isGhe: false })).toBe("gh-token");
  });

  it("falls back to GITHUB_TOKEN for github.com", () => {
    process.env.GITHUB_TOKEN = "generic-token";
    expect(resolveGitHubPat({ isGhe: false })).toBe("generic-token");
  });

  it("uses envLookup when process.env has no value", () => {
    const lookup = vi.fn((key: string) =>
      key === "GITHUB_PERSONAL_ACCESS_TOKEN" ? "from-env-file" : undefined,
    );
    expect(resolveGitHubPat({ isGhe: false, envLookup: lookup })).toBe("from-env-file");
  });

  it("prefers process.env over envLookup", () => {
    process.env.GITHUB_PERSONAL_ACCESS_TOKEN = "from-process";
    const lookup = vi.fn(() => "from-env-file");
    expect(resolveGitHubPat({ isGhe: false, envLookup: lookup })).toBe("from-process");
  });

  it("returns empty string when no PAT is found", () => {
    expect(resolveGitHubPat({ isGhe: false })).toBe("");
  });

  it("does not check GHE_PERSONAL_ACCESS_TOKEN for github.com hosts", () => {
    process.env.GHE_PERSONAL_ACCESS_TOKEN = "ghe-only";
    expect(resolveGitHubPat({ isGhe: false })).toBe("");
  });
});
