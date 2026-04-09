import { describe, it, expect } from "vitest";
import { PerformanceCollector, DEFAULT_THRESHOLDS } from "./performance-collector.js";
import type { RawPerformanceEntry, PerformanceBaseline, PerformanceMetrics } from "./types.js";

describe("PerformanceCollector", () => {
  const collector = new PerformanceCollector();

  // ── captureMetrics ────────────────────────────────────────────────────────

  describe("captureMetrics", () => {
    it("extracts LCP from largest-contentful-paint entries", () => {
      const entries: RawPerformanceEntry[] = [
        { name: "img", entryType: "largest-contentful-paint", startTime: 1200, duration: 0 },
        { name: "div", entryType: "largest-contentful-paint", startTime: 2300, duration: 0 },
      ];
      const metrics = collector.captureMetrics(entries);
      expect(metrics.lcp).toBe(2300); // Last LCP is most accurate
    });

    it("extracts FID from first-input entry", () => {
      const entries: RawPerformanceEntry[] = [
        { name: "click", entryType: "first-input", startTime: 500, duration: 16 },
      ];
      const metrics = collector.captureMetrics(entries);
      expect(metrics.fid).toBe(16);
    });

    it("extracts INP as max event duration", () => {
      const entries: RawPerformanceEntry[] = [
        { name: "click", entryType: "event", startTime: 100, duration: 50 },
        { name: "keydown", entryType: "event", startTime: 200, duration: 180 },
        { name: "click", entryType: "event", startTime: 300, duration: 120 },
      ];
      const metrics = collector.captureMetrics(entries);
      expect(metrics.inp).toBe(180);
    });

    it("extracts CLS as sum of layout shifts without recent input", () => {
      const entries: RawPerformanceEntry[] = [
        { name: "", entryType: "layout-shift", startTime: 100, duration: 0, value: 0.05, hadRecentInput: false },
        { name: "", entryType: "layout-shift", startTime: 200, duration: 0, value: 0.03, hadRecentInput: false },
        { name: "", entryType: "layout-shift", startTime: 300, duration: 0, value: 0.1, hadRecentInput: true }, // ignored
      ];
      const metrics = collector.captureMetrics(entries);
      expect(metrics.cls).toBe(0.08);
    });

    it("extracts TTFB, DOM Content Loaded, and Page Load from navigation entry", () => {
      const entries: RawPerformanceEntry[] = [
        {
          name: "https://example.com",
          entryType: "navigation",
          startTime: 0,
          duration: 1500,
          responseStart: 350,
          domContentLoadedEventEnd: 800,
          loadEventEnd: 1200,
        },
      ];
      const metrics = collector.captureMetrics(entries);
      expect(metrics.ttfb).toBe(350);
      expect(metrics.domContentLoaded).toBe(800);
      expect(metrics.pageLoad).toBe(1200);
    });

    it("extracts TBT from longtask entries", () => {
      const entries: RawPerformanceEntry[] = [
        { name: "self", entryType: "longtask", startTime: 100, duration: 120 }, // 70ms
        { name: "self", entryType: "longtask", startTime: 300, duration: 200 }, // 150ms
        { name: "self", entryType: "longtask", startTime: 600, duration: 30 },  // 0ms (not long)
      ];
      const metrics = collector.captureMetrics(entries);
      expect(metrics.tbt).toBe(220); // 70 + 150
    });

    it("returns null for missing metrics", () => {
      const metrics = collector.captureMetrics([]);
      expect(metrics.lcp).toBeNull();
      expect(metrics.fid).toBeNull();
      expect(metrics.inp).toBeNull();
      expect(metrics.cls).toBeNull();
      expect(metrics.ttfb).toBeNull();
      expect(metrics.domContentLoaded).toBeNull();
      expect(metrics.pageLoad).toBeNull();
      expect(metrics.tbt).toBeNull();
    });

    it("handles mixed entry types", () => {
      const entries: RawPerformanceEntry[] = [
        { name: "img", entryType: "largest-contentful-paint", startTime: 1500, duration: 0 },
        { name: "click", entryType: "first-input", startTime: 800, duration: 24 },
        { name: "", entryType: "layout-shift", startTime: 100, duration: 0, value: 0.02, hadRecentInput: false },
        { name: "self", entryType: "longtask", startTime: 400, duration: 80 },
        {
          name: "https://example.com",
          entryType: "navigation",
          startTime: 0,
          duration: 2000,
          responseStart: 200,
          domContentLoadedEventEnd: 500,
          loadEventEnd: 1000,
        },
      ];
      const metrics = collector.captureMetrics(entries);
      expect(metrics.lcp).toBe(1500);
      expect(metrics.fid).toBe(24);
      expect(metrics.cls).toBe(0.02);
      expect(metrics.tbt).toBe(30);
      expect(metrics.ttfb).toBe(200);
      expect(metrics.domContentLoaded).toBe(500);
      expect(metrics.pageLoad).toBe(1000);
    });
  });

  // ── getMetricStatus ───────────────────────────────────────────────────────

  describe("getMetricStatus", () => {
    it("returns good for LCP under 2500ms", () => {
      expect(collector.getMetricStatus("lcp", 2000)).toBe("good");
    });

    it("returns needs-improvement for LCP between 2500-4000ms", () => {
      expect(collector.getMetricStatus("lcp", 3000)).toBe("needs-improvement");
    });

    it("returns poor for LCP over 4000ms", () => {
      expect(collector.getMetricStatus("lcp", 5000)).toBe("poor");
    });

    it("returns good for CLS under 0.1", () => {
      expect(collector.getMetricStatus("cls", 0.05)).toBe("good");
    });

    it("returns poor for CLS over 0.25", () => {
      expect(collector.getMetricStatus("cls", 0.5)).toBe("poor");
    });

    it("returns good for INP under 200ms", () => {
      expect(collector.getMetricStatus("inp", 100)).toBe("good");
    });

    it("returns poor for INP over 500ms", () => {
      expect(collector.getMetricStatus("inp", 600)).toBe("poor");
    });

    it("returns good for TTFB under 800ms", () => {
      expect(collector.getMetricStatus("ttfb", 400)).toBe("good");
    });
  });

  // ── compareWithBaseline ───────────────────────────────────────────────────

  describe("compareWithBaseline", () => {
    const baselineMetrics: PerformanceMetrics = {
      lcp: 2000,
      fid: 50,
      inp: 150,
      cls: 0.05,
      ttfb: 400,
      domContentLoaded: 600,
      pageLoad: 1000,
      tbt: 100,
    };

    const baseline: PerformanceBaseline = {
      url: "https://example.com",
      metrics: baselineMetrics,
      capturedAt: "2024-01-01T00:00:00Z",
    };

    it("detects no regressions when metrics are similar", () => {
      const current: PerformanceMetrics = {
        lcp: 2100,   // 5% increase from 2000
        fid: 55,     // 10% increase from 50
        inp: 160,    // ~7% increase from 150
        cls: 0.054,  // 8% increase from 0.05
        ttfb: 420,   // 5% increase from 400
        domContentLoaded: 630, // 5% increase from 600
        pageLoad: 1050,        // 5% increase from 1000
        tbt: 105,    // 5% increase from 100
      };
      const result = collector.compareWithBaseline(current, baseline);
      expect(result.hasRegressions).toBe(false);
      expect(result.regressionCount).toBe(0);
    });

    it("detects regressions when metrics degrade significantly", () => {
      const current: PerformanceMetrics = {
        lcp: 4500, // 125% increase
        fid: 200,  // 300% increase
        inp: 400,  // 167% increase
        cls: 0.3,  // 500% increase
        ttfb: 1500, // 275% increase
        domContentLoaded: 2000,
        pageLoad: 4000,
        tbt: 500,
      };
      const result = collector.compareWithBaseline(current, baseline);
      expect(result.hasRegressions).toBe(true);
      expect(result.regressionCount).toBeGreaterThan(0);
    });

    it("calculates percentage change correctly", () => {
      const current: PerformanceMetrics = {
        lcp: 3000, // 50% increase from 2000
        fid: null,
        inp: null,
        cls: null,
        ttfb: null,
        domContentLoaded: null,
        pageLoad: null,
        tbt: null,
      };
      const result = collector.compareWithBaseline(current, baseline);
      const lcpComp = result.metrics.find((m) => m.name === "LCP");
      expect(lcpComp).toBeDefined();
      expect(lcpComp!.percentageChange).toBe(50);
    });

    it("handles null current values", () => {
      const current: PerformanceMetrics = {
        lcp: null,
        fid: null,
        inp: null,
        cls: null,
        ttfb: null,
        domContentLoaded: null,
        pageLoad: null,
        tbt: null,
      };
      const result = collector.compareWithBaseline(current, baseline);
      expect(result.hasRegressions).toBe(false);
      for (const m of result.metrics) {
        expect(m.percentageChange).toBeNull();
      }
    });

    it("calculates score based on key Web Vitals", () => {
      // All good
      const goodCurrent: PerformanceMetrics = {
        lcp: 1500,
        fid: 30,
        inp: 100,
        cls: 0.03,
        ttfb: 300,
        domContentLoaded: 400,
        pageLoad: 800,
        tbt: 50,
      };
      const goodResult = collector.compareWithBaseline(goodCurrent, baseline);
      expect(goodResult.score).toBe(100);

      // All poor
      const poorCurrent: PerformanceMetrics = {
        lcp: 5000,
        fid: 400,
        inp: 600,
        cls: 0.5,
        ttfb: 2000,
        domContentLoaded: 3000,
        pageLoad: 5000,
        tbt: 800,
      };
      const poorResult = collector.compareWithBaseline(poorCurrent, baseline);
      expect(poorResult.score).toBeLessThanOrEqual(10);
    });

    it("returns correct structure", () => {
      const current: PerformanceMetrics = {
        lcp: 2000,
        fid: null,
        inp: null,
        cls: null,
        ttfb: null,
        domContentLoaded: null,
        pageLoad: null,
        tbt: null,
      };
      const result = collector.compareWithBaseline(current, baseline);
      expect(typeof result.hasRegressions).toBe("boolean");
      expect(typeof result.regressionCount).toBe("number");
      expect(typeof result.score).toBe("number");
      expect(Array.isArray(result.metrics)).toBe(true);
      for (const m of result.metrics) {
        expect(m.name).toBeTruthy();
        expect(typeof m.regressed).toBe("boolean");
        expect(["good", "needs-improvement", "poor"]).toContain(m.status);
      }
    });
  });

  // ── Custom thresholds ─────────────────────────────────────────────────────

  describe("custom thresholds", () => {
    it("allows overriding thresholds", () => {
      const strict = new PerformanceCollector({
        lcp: [1000, 2000], // Stricter than defaults
      });
      expect(strict.getMetricStatus("lcp", 1500)).toBe("needs-improvement");
      // Default would be "good" at 1500
      expect(collector.getMetricStatus("lcp", 1500)).toBe("good");
    });
  });

  // ── DEFAULT_THRESHOLDS ────────────────────────────────────────────────────

  describe("DEFAULT_THRESHOLDS", () => {
    it("matches Google Core Web Vitals standards", () => {
      expect(DEFAULT_THRESHOLDS.lcp).toEqual([2500, 4000]);
      expect(DEFAULT_THRESHOLDS.inp).toEqual([200, 500]);
      expect(DEFAULT_THRESHOLDS.cls).toEqual([0.1, 0.25]);
      expect(DEFAULT_THRESHOLDS.ttfb).toEqual([800, 1800]);
    });
  });

  // ── getWebVitalsScript ────────────────────────────────────────────────────

  describe("getWebVitalsScript", () => {
    it("returns a non-empty JavaScript string", () => {
      const script = collector.getWebVitalsScript();
      expect(typeof script).toBe("string");
      expect(script.length).toBeGreaterThan(100);
    });

    it("contains PerformanceObserver setup", () => {
      const script = collector.getWebVitalsScript();
      expect(script).toContain("PerformanceObserver");
      expect(script).toContain("largest-contentful-paint");
      expect(script).toContain("layout-shift");
      expect(script).toContain("longtask");
      expect(script).toContain("first-input");
    });

    it("sets window.__TALOS_PERF_ENTRIES__", () => {
      const script = collector.getWebVitalsScript();
      expect(script).toContain("__TALOS_PERF_ENTRIES__");
    });
  });
});
