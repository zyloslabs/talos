/**
 * Tests for DeviceEmulationManager (#489)
 */

import { describe, it, expect } from "vitest";
import { DeviceEmulationManager } from "./mobile-emulation.js";

describe("DeviceEmulationManager", () => {
  const manager = new DeviceEmulationManager();

  describe("getDevice", () => {
    it("returns device profile by name", () => {
      const device = manager.getDevice("iPhone 12");

      expect(device).toBeDefined();
      expect(device!.name).toBe("iPhone 12");
      expect(device!.viewport.width).toBe(390);
      expect(device!.viewport.height).toBe(844);
      expect(device!.isMobile).toBe(true);
      expect(device!.hasTouch).toBe(true);
    });

    it("returns undefined for unknown device", () => {
      expect(manager.getDevice("Nonexistent Phone")).toBeUndefined();
    });

    it("returns desktop device", () => {
      const device = manager.getDevice("Desktop Chrome");

      expect(device).toBeDefined();
      expect(device!.isMobile).toBe(false);
      expect(device!.hasTouch).toBe(false);
    });
  });

  describe("listDevices", () => {
    it("returns all device names", () => {
      const devices = manager.listDevices();

      expect(devices.length).toBeGreaterThan(5);
      expect(devices).toContain("iPhone 12");
      expect(devices).toContain("Pixel 5");
      expect(devices).toContain("Desktop Chrome");
    });
  });

  describe("listDeviceProfiles", () => {
    it("returns all device profile objects", () => {
      const profiles = manager.listDeviceProfiles();

      expect(profiles.length).toBeGreaterThan(5);
      expect(profiles[0]).toHaveProperty("name");
      expect(profiles[0]).toHaveProperty("viewport");
      expect(profiles[0]).toHaveProperty("isMobile");
    });
  });

  describe("resolveDevices", () => {
    it("resolves specific device names", () => {
      const devices = manager.resolveDevices({
        devices: ["iPhone 12", "Pixel 5"],
        generatePerDevice: true,
      });

      expect(devices).toHaveLength(2);
      expect(devices[0].name).toBe("iPhone 12");
      expect(devices[1].name).toBe("Pixel 5");
    });

    it("resolves 'mobile' to all mobile devices", () => {
      const devices = manager.resolveDevices({
        devices: ["mobile"],
        generatePerDevice: true,
      });

      expect(devices.length).toBeGreaterThan(2);
      expect(devices.every((d) => d.isMobile)).toBe(true);
    });

    it("resolves 'desktop' to all desktop devices", () => {
      const devices = manager.resolveDevices({
        devices: ["desktop"],
        generatePerDevice: true,
      });

      expect(devices.length).toBeGreaterThanOrEqual(1);
      expect(devices.every((d) => !d.isMobile)).toBe(true);
    });

    it("deduplicates devices", () => {
      const devices = manager.resolveDevices({
        devices: ["iPhone 12", "iPhone 12"],
        generatePerDevice: true,
      });

      expect(devices).toHaveLength(1);
    });

    it("ignores unknown devices silently", () => {
      const devices = manager.resolveDevices({
        devices: ["iPhone 12", "Unknown Phone"],
        generatePerDevice: true,
      });

      expect(devices).toHaveLength(1);
      expect(devices[0].name).toBe("iPhone 12");
    });

    it("handles mix of categories and specific names", () => {
      const devices = manager.resolveDevices({
        devices: ["desktop", "iPhone 12"],
        generatePerDevice: true,
      });

      expect(devices.length).toBeGreaterThanOrEqual(2);
      expect(devices.some((d) => d.name === "iPhone 12")).toBe(true);
      expect(devices.some((d) => !d.isMobile)).toBe(true);
    });
  });

  describe("generateDeviceTestCode", () => {
    it("generates test code with device emulation config", () => {
      const device = manager.getDevice("iPhone 12")!;
      const code = manager.generateDeviceTestCode(device, "test('loads', () => {});");

      expect(code).toContain("test.use({");
      expect(code).toContain("viewport: { width: 390, height: 844 }");
      expect(code).toContain("deviceScaleFactor: 3");
      expect(code).toContain("isMobile: true");
      expect(code).toContain("hasTouch: true");
      expect(code).toContain("userAgent:");
      expect(code).toContain("test.describe('iPhone 12 tests'");
    });
  });

  describe("generatePlaywrightConfigProjects", () => {
    it("generates projects config for multiple devices", () => {
      const devices = [
        manager.getDevice("iPhone 12")!,
        manager.getDevice("Desktop Chrome")!,
      ];

      const config = manager.generatePlaywrightConfigProjects(devices);

      expect(config).toContain("projects: [");
      expect(config).toContain("name: 'iPhone 12'");
      expect(config).toContain("name: 'Desktop Chrome'");
      expect(config).toContain("isMobile: true");
      expect(config).toContain("isMobile: false");
    });
  });
});
