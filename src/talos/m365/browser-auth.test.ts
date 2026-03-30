import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "./types.js";

// Mock @playwright/test — factory cannot reference top-level variables
vi.mock("@playwright/test", () => {
  const mockPage = {
    goto: vi.fn().mockResolvedValue(undefined),
    url: vi.fn().mockReturnValue("https://m365.cloud.microsoft/chat/"),
    waitForURL: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const mockContext = {
    newPage: vi.fn().mockResolvedValue(mockPage),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return {
    chromium: {
      launchPersistentContext: vi.fn().mockResolvedValue(mockContext),
    },
    __mockPage: mockPage,
    __mockContext: mockContext,
  };
});

vi.mock("node:fs/promises", () => ({
  access: vi.fn().mockResolvedValue(undefined),
}));

// Import after mocks
const { BrowserAuth } = await import("./browser-auth.js");
const pw = await import("@playwright/test");
const mockPage = (pw as unknown as { __mockPage: Record<string, ReturnType<typeof vi.fn>> }).__mockPage;
const mockContext = (pw as unknown as { __mockContext: Record<string, ReturnType<typeof vi.fn>> }).__mockContext;

describe("BrowserAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPage.url.mockReturnValue("https://m365.cloud.microsoft/chat/");
  });

  describe("constructor", () => {
    it("uses default values", () => {
      const auth = new BrowserAuth();
      expect(auth.getUserDataDir()).toContain(".talos/browser-data");
    });

    it("accepts custom options", () => {
      const auth = new BrowserAuth({ userDataDir: "/tmp/custom-browser" });
      expect(auth.getUserDataDir()).toContain("custom-browser");
    });
  });

  describe("isLoginUrl", () => {
    it("detects Microsoft login URLs", () => {
      const auth = new BrowserAuth();
      expect(auth.isLoginUrl("https://login.microsoftonline.com/foo")).toBe(true);
      expect(auth.isLoginUrl("https://login.microsoft.com/bar")).toBe(true);
      expect(auth.isLoginUrl("https://login.live.com/baz")).toBe(true);
    });

    it("returns false for non-login URLs", () => {
      const auth = new BrowserAuth();
      expect(auth.isLoginUrl("https://m365.cloud.microsoft/chat/")).toBe(false);
      expect(auth.isLoginUrl("https://example.com")).toBe(false);
    });
  });

  describe("isSessionValid", () => {
    it("returns false when no page exists", async () => {
      const auth = new BrowserAuth();
      expect(await auth.isSessionValid()).toBe(false);
    });
  });

  describe("getPage", () => {
    it("returns null before initialization", () => {
      const auth = new BrowserAuth();
      expect(auth.getPage()).toBeNull();
    });
  });

  describe("initialize", () => {
    it("creates persistent context and validates session", async () => {
      const { chromium } = await import("@playwright/test");
      const auth = new BrowserAuth({ userDataDir: "/tmp/test-browser" });
      const page = await auth.initialize();
      expect(chromium.launchPersistentContext).toHaveBeenCalled();
      expect(page).toBe(mockPage);
    });

    it("falls back to headful auth when session is invalid", async () => {
      // 1st call in initial isSessionValid → login URL → invalid session → close
      // 2nd call in launchHeadfulAuth → re-launch isSessionValid → success
      mockPage.url
        .mockReturnValueOnce("https://login.microsoftonline.com/oauth2")
        .mockReturnValueOnce("https://m365.cloud.microsoft/chat/");

      const auth = new BrowserAuth({ userDataDir: "/tmp/test-browser" });
      const page = await auth.initialize();
      expect(page).toBeDefined();
    });
  });

  describe("close", () => {
    it("closes context gracefully", async () => {
      const auth = new BrowserAuth({ userDataDir: "/tmp/test-browser" });
      await auth.initialize();
      await auth.close();
      expect(mockContext.close).toHaveBeenCalled();
    });

    it("does nothing when no context", async () => {
      const auth = new BrowserAuth();
      await auth.close(); // should not throw
    });
  });

  describe("proxyConfig", () => {
    it("passes proxy when configured", async () => {
      const { chromium } = await import("@playwright/test");
      const auth = new BrowserAuth({ userDataDir: "/tmp/test", proxy: "http://proxy:8080" });
      await auth.initialize();
      expect(chromium.launchPersistentContext).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ proxy: { server: "http://proxy:8080" } })
      );
    });
  });

  describe("AuthError", () => {
    it("is thrown on MFA timeout", async () => {
      // Force login URL detection
      mockPage.url.mockReturnValue("https://login.microsoftonline.com/auth");
      // waitForURL rejects (timeout)
      mockPage.waitForURL.mockRejectedValueOnce(new Error("Timeout exceeded"));

      const auth = new BrowserAuth({ userDataDir: "/tmp/test", mfaTimeoutMs: 100 });
      await expect(auth.initialize()).rejects.toThrow(AuthError);
    });
  });
});
