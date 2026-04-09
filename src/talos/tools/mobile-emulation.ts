/**
 * Mobile Device Emulation (#489)
 *
 * Device emulation support for the test runner and generator.
 * Uses Playwright's built-in device descriptors.
 */

import type { DeviceProfile, DeviceEmulationConfig } from "../types.js";

// ── Built-in Device Descriptors ───────────────────────────────────────────────

const DEVICE_DESCRIPTORS: Record<string, DeviceProfile> = {
  "iPhone 12": {
    name: "iPhone 12",
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 14_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Mobile/15E148 Safari/604.1",
  },
  "iPhone 13": {
    name: "iPhone 13",
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
  },
  "iPhone 14": {
    name: "iPhone 14",
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
  },
  "iPhone SE": {
    name: "iPhone SE",
    viewport: { width: 375, height: 667 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 14_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Mobile/15E148 Safari/604.1",
  },
  "iPad Pro 11": {
    name: "iPad Pro 11",
    viewport: { width: 834, height: 1194 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPad; CPU OS 14_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Mobile/15E148 Safari/604.1",
  },
  "Pixel 5": {
    name: "Pixel 5",
    viewport: { width: 393, height: 851 },
    deviceScaleFactor: 2.75,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Mobile Safari/537.36",
  },
  "Pixel 7": {
    name: "Pixel 7",
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.5845.92 Mobile Safari/537.36",
  },
  "Samsung Galaxy S21": {
    name: "Samsung Galaxy S21",
    viewport: { width: 360, height: 800 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (Linux; Android 11; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.210 Mobile Safari/537.36",
  },
  "Desktop Chrome": {
    name: "Desktop Chrome",
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  },
  "Desktop Firefox": {
    name: "Desktop Firefox",
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0",
  },
};

// ── Device Emulation Manager ──────────────────────────────────────────────────

export class DeviceEmulationManager {
  /**
   * Get a device profile by name.
   */
  getDevice(name: string): DeviceProfile | undefined {
    return DEVICE_DESCRIPTORS[name];
  }

  /**
   * List all available device names.
   */
  listDevices(): string[] {
    return Object.keys(DEVICE_DESCRIPTORS);
  }

  /**
   * List all available device profiles.
   */
  listDeviceProfiles(): DeviceProfile[] {
    return Object.values(DEVICE_DESCRIPTORS);
  }

  /**
   * Resolve device names (supports "mobile", "desktop", or specific names).
   */
  resolveDevices(config: DeviceEmulationConfig): DeviceProfile[] {
    const profiles: DeviceProfile[] = [];

    for (const deviceName of config.devices) {
      if (deviceName === "mobile") {
        profiles.push(
          ...Object.values(DEVICE_DESCRIPTORS).filter((d) => d.isMobile)
        );
      } else if (deviceName === "desktop") {
        profiles.push(
          ...Object.values(DEVICE_DESCRIPTORS).filter((d) => !d.isMobile)
        );
      } else {
        const device = DEVICE_DESCRIPTORS[deviceName];
        if (device) {
          profiles.push(device);
        }
      }
    }

    // Deduplicate by name
    const seen = new Set<string>();
    return profiles.filter((d) => {
      if (seen.has(d.name)) return false;
      seen.add(d.name);
      return true;
    });
  }

  /**
   * Generate Playwright device emulation use block as test code.
   */
  generateDeviceTestCode(device: DeviceProfile, testBody: string): string {
    return [
      `import { test, expect } from '@playwright/test';`,
      ``,
      `test.use({`,
      `  viewport: { width: ${device.viewport.width}, height: ${device.viewport.height} },`,
      `  deviceScaleFactor: ${device.deviceScaleFactor},`,
      `  isMobile: ${device.isMobile},`,
      `  hasTouch: ${device.hasTouch},`,
      `  userAgent: '${escapeString(device.userAgent)}',`,
      `});`,
      ``,
      `test.describe('${device.name} tests', () => {`,
      `  ${testBody}`,
      `});`,
    ].join("\n");
  }

  /**
   * Generate Playwright config snippet for device projects.
   */
  generatePlaywrightConfigProjects(devices: DeviceProfile[]): string {
    const projects = devices.map((d) => [
      `    {`,
      `      name: '${d.name}',`,
      `      use: {`,
      `        viewport: { width: ${d.viewport.width}, height: ${d.viewport.height} },`,
      `        deviceScaleFactor: ${d.deviceScaleFactor},`,
      `        isMobile: ${d.isMobile},`,
      `        hasTouch: ${d.hasTouch},`,
      `        userAgent: '${escapeString(d.userAgent)}',`,
      `      },`,
      `    },`,
    ].join("\n"));

    return `projects: [\n${projects.join("\n")}\n  ]`;
  }
}

function escapeString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
