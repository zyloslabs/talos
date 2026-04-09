/**
 * PerformanceCollector — Parse and compare Core Web Vitals metrics.
 *
 * Processes raw Performance API entries into structured metrics
 * and compares against baselines using Google's Core Web Vitals thresholds.
 */

import type {
  PerformanceMetrics,
  PerformanceThresholds,
  PerformanceBaseline,
  PerformanceComparisonResult,
  MetricComparison,
  MetricStatus,
  RawPerformanceEntry,
} from "./types.js";

export const DEFAULT_THRESHOLDS: PerformanceThresholds = {
  lcp: [2500, 4000],
  inp: [200, 500],
  cls: [0.1, 0.25],
  ttfb: [800, 1800],
  fid: [100, 300],
  tbt: [200, 600],
};

export class PerformanceCollector {
  private thresholds: PerformanceThresholds;

  constructor(thresholds?: Partial<PerformanceThresholds>) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }

  /**
   * Process raw Performance API entries into structured metrics.
   */
  captureMetrics(rawEntries: RawPerformanceEntry[]): PerformanceMetrics {
    const metrics: PerformanceMetrics = {
      lcp: null,
      fid: null,
      inp: null,
      cls: null,
      ttfb: null,
      domContentLoaded: null,
      pageLoad: null,
      tbt: null,
    };

    for (const entry of rawEntries) {
      switch (entry.entryType) {
        case "largest-contentful-paint":
          // Take the last LCP entry (most accurate)
          metrics.lcp = entry.startTime;
          break;

        case "first-input":
          metrics.fid = entry.duration;
          break;

        case "event":
          // INP is the max interaction duration
          if (entry.duration !== undefined) {
            const duration = entry.duration as number;
            if (metrics.inp === null || duration > metrics.inp) {
              metrics.inp = duration;
            }
          }
          break;

        case "layout-shift":
          // CLS is sum of layout shift values without recent input
          if (!(entry.hadRecentInput as boolean)) {
            const value = (entry.value as number) ?? 0;
            metrics.cls = (metrics.cls ?? 0) + value;
          }
          break;

        case "navigation": {
          // TTFB = responseStart
          const responseStart = entry.responseStart as number | undefined;
          if (responseStart !== undefined) {
            metrics.ttfb = responseStart;
          }
          // DOM Content Loaded
          const domContentLoadedEventEnd = entry.domContentLoadedEventEnd as
            | number
            | undefined;
          if (domContentLoadedEventEnd !== undefined) {
            metrics.domContentLoaded = domContentLoadedEventEnd;
          }
          // Page Load
          const loadEventEnd = entry.loadEventEnd as number | undefined;
          if (loadEventEnd !== undefined) {
            metrics.pageLoad = loadEventEnd;
          }
          break;
        }

        case "longtask": {
          // TBT = sum of (task_duration - 50ms) for all long tasks
          const blockingTime = Math.max(0, entry.duration - 50);
          metrics.tbt = (metrics.tbt ?? 0) + blockingTime;
          break;
        }
      }
    }

    // Round CLS to 4 decimal places
    if (metrics.cls !== null) {
      metrics.cls = Math.round(metrics.cls * 10000) / 10000;
    }

    return metrics;
  }

  /**
   * Compare current metrics against a baseline.
   */
  compareWithBaseline(
    current: PerformanceMetrics,
    baseline: PerformanceBaseline
  ): PerformanceComparisonResult {
    const comparisons: MetricComparison[] = [
      this.compareMetric("LCP", current.lcp, baseline.metrics.lcp, this.thresholds.lcp, true),
      this.compareMetric("FID", current.fid, baseline.metrics.fid, this.thresholds.fid, true),
      this.compareMetric("INP", current.inp, baseline.metrics.inp, this.thresholds.inp, true),
      this.compareMetric("CLS", current.cls, baseline.metrics.cls, this.thresholds.cls, true),
      this.compareMetric("TTFB", current.ttfb, baseline.metrics.ttfb, this.thresholds.ttfb, true),
      this.compareMetric("TBT", current.tbt, baseline.metrics.tbt, this.thresholds.tbt, true),
      this.compareMetric("DOM Content Loaded", current.domContentLoaded, baseline.metrics.domContentLoaded, null, true),
      this.compareMetric("Page Load", current.pageLoad, baseline.metrics.pageLoad, null, true),
    ];

    const regressions = comparisons.filter((c) => c.regressed);

    // Score: based on key Web Vitals (LCP, INP, CLS)
    const keyMetrics = comparisons.filter((c) =>
      ["LCP", "INP", "CLS"].includes(c.name)
    );
    let score = 100;
    for (const m of keyMetrics) {
      if (m.status === "poor") score -= 30;
      else if (m.status === "needs-improvement") score -= 15;
    }
    score = Math.max(0, Math.min(100, score));

    return {
      metrics: comparisons,
      hasRegressions: regressions.length > 0,
      regressionCount: regressions.length,
      score,
    };
  }

  /**
   * Get the status of a metric value based on thresholds.
   */
  getMetricStatus(
    metricKey: keyof PerformanceThresholds,
    value: number
  ): MetricStatus {
    const [good, poor] = this.thresholds[metricKey];
    if (value <= good) return "good";
    if (value <= poor) return "needs-improvement";
    return "poor";
  }

  /**
   * Return injectable JavaScript to capture Web Vitals in a browser page.
   */
  getWebVitalsScript(): string {
    return `
(function() {
  const entries = [];

  // Observe LCP
  new PerformanceObserver(function(list) {
    for (var e of list.getEntries()) entries.push({
      name: e.name, entryType: e.entryType,
      startTime: e.startTime, duration: e.duration
    });
  }).observe({ type: 'largest-contentful-paint', buffered: true });

  // Observe FID
  new PerformanceObserver(function(list) {
    for (var e of list.getEntries()) entries.push({
      name: e.name, entryType: e.entryType,
      startTime: e.startTime, duration: e.duration
    });
  }).observe({ type: 'first-input', buffered: true });

  // Observe CLS
  new PerformanceObserver(function(list) {
    for (var e of list.getEntries()) entries.push({
      name: e.name, entryType: e.entryType,
      startTime: e.startTime, duration: e.duration,
      value: e.value, hadRecentInput: e.hadRecentInput
    });
  }).observe({ type: 'layout-shift', buffered: true });

  // Observe long tasks (TBT)
  new PerformanceObserver(function(list) {
    for (var e of list.getEntries()) entries.push({
      name: e.name, entryType: e.entryType,
      startTime: e.startTime, duration: e.duration
    });
  }).observe({ type: 'longtask', buffered: true });

  // Observe INP (event timing)
  new PerformanceObserver(function(list) {
    for (var e of list.getEntries()) entries.push({
      name: e.name, entryType: e.entryType,
      startTime: e.startTime, duration: e.duration
    });
  }).observe({ type: 'event', buffered: true, durationThreshold: 16 });

  // Navigation timing
  var navEntries = performance.getEntriesByType('navigation');
  for (var i = 0; i < navEntries.length; i++) {
    var n = navEntries[i];
    entries.push({
      name: n.name, entryType: n.entryType,
      startTime: n.startTime, duration: n.duration,
      responseStart: n.responseStart,
      domContentLoadedEventEnd: n.domContentLoadedEventEnd,
      loadEventEnd: n.loadEventEnd
    });
  }

  window.__TALOS_PERF_ENTRIES__ = entries;
  return entries;
})();
`.trim();
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private compareMetric(
    name: string,
    current: number | null,
    baseline: number | null,
    thresholdPair: [number, number] | null,
    higherIsWorse: boolean
  ): MetricComparison {
    let status: MetricStatus = "good";
    if (current !== null && thresholdPair) {
      const [good, poor] = thresholdPair;
      if (current <= good) status = "good";
      else if (current <= poor) status = "needs-improvement";
      else status = "poor";
    }

    let regressed = false;
    let percentageChange: number | null = null;
    if (current !== null && baseline !== null && baseline !== 0) {
      percentageChange =
        Math.round(((current - baseline) / Math.abs(baseline)) * 10000) / 100;
      // Regression = metric got worse by more than 10%
      if (higherIsWorse) {
        regressed = percentageChange > 10;
      } else {
        regressed = percentageChange < -10;
      }
    }

    return {
      name,
      current,
      baseline,
      status,
      regressed,
      percentageChange,
    };
  }
}
