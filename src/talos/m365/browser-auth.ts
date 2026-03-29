/**
 * BrowserAuth — Playwright persistent context auth with MFA support.
 * Adapted from copilot365-int for Talos M365 integration.
 */

import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { resolve } from "node:path";
import { access } from "node:fs/promises";
import { AuthError } from "./types.js";

const DEFAULT_COPILOT_URL = "https://m365.cloud.microsoft/chat/";
const LOGIN_URL_PATTERNS = ["login.microsoftonline.com", "login.microsoft.com", "login.live.com"];
const DEFAULT_MFA_TIMEOUT_MS = 5 * 60 * 1000;

export interface BrowserAuthOptions {
  userDataDir?: string;
  copilotUrl?: string;
  mfaTimeoutMs?: number;
  proxy?: string;
}

export class BrowserAuth {
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private readonly userDataDir: string;
  private readonly copilotUrl: string;
  private readonly mfaTimeoutMs: number;
  private readonly proxy: string | undefined;

  constructor(options: BrowserAuthOptions = {}) {
    this.userDataDir = resolve(options.userDataDir ?? "./.browser-data");
    this.copilotUrl = options.copilotUrl ?? process.env.COPILOT365_URL ?? DEFAULT_COPILOT_URL;
    this.mfaTimeoutMs = options.mfaTimeoutMs ?? DEFAULT_MFA_TIMEOUT_MS;
    this.proxy = options.proxy ?? process.env.COPILOT365_PROXY ?? process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY;
  }

  getUserDataDir(): string {
    return this.userDataDir;
  }

  private proxyConfig() {
    return this.proxy ? { proxy: { server: this.proxy } } : {};
  }

  async initialize(): Promise<Page> {
    const hasExistingSession = await this.hasUserDataDir();

    if (hasExistingSession) {
      this.context = await chromium.launchPersistentContext(this.userDataDir, {
        headless: true,
        ...this.proxyConfig(),
      });
      this.page = await this.context.newPage();

      if (await this.isSessionValid()) {
        return this.page;
      }

      await this.close();
    }

    return this.launchHeadfulAuth();
  }

  async isSessionValid(): Promise<boolean> {
    if (!this.page) return false;

    try {
      await this.page.goto(this.copilotUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
      const currentUrl = this.page.url();
      return !this.isLoginUrl(currentUrl);
    } catch {
      return false;
    }
  }

  isLoginUrl(url: string): boolean {
    return LOGIN_URL_PATTERNS.some((pattern) => url.includes(pattern));
  }

  private async launchHeadfulAuth(): Promise<Page> {
    this.context = await chromium.launchPersistentContext(this.userDataDir, {
      headless: false,
      args: ["--disable-blink-features=AutomationControlled"],
      ...this.proxyConfig(),
    });
    this.page = await this.context.newPage();
    await this.page.goto(this.copilotUrl, { waitUntil: "domcontentloaded" });

    try {
      await this.page.waitForURL(
        (url: URL) => !this.isLoginUrl(url.toString()) && url.toString().includes(new URL(this.copilotUrl).hostname),
        { timeout: this.mfaTimeoutMs }
      );
    } catch {
      await this.close();
      throw new AuthError(
        `MFA authentication timed out after ${this.mfaTimeoutMs / 1000}s. ` +
          "Please try again and complete the MFA prompt in the browser window."
      );
    }

    await this.close();

    this.context = await chromium.launchPersistentContext(this.userDataDir, {
      headless: true,
      ...this.proxyConfig(),
    });
    this.page = await this.context.newPage();
    await this.page.goto(this.copilotUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });

    if (await this.isSessionValid()) {
      return this.page;
    }

    throw new AuthError("Failed to establish session after MFA. Session cookies may not have persisted.");
  }

  getPage(): Page | null {
    return this.page;
  }

  private async hasUserDataDir(): Promise<boolean> {
    try {
      await access(this.userDataDir);
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
      this.page = null;
    }
  }

  async clearSession(): Promise<void> {
    await this.close();
    const { rm } = await import("node:fs/promises");
    await rm(this.userDataDir, { recursive: true, force: true }).catch(() => {});
  }
}
