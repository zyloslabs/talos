/**
 * Performance Testing Types
 *
 * Types for capturing and comparing Core Web Vitals and performance metrics.
 */

// ── Metric Status ─────────────────────────────────────────────────────────────

export type MetricStatus = "good" | "needs-improvement" | "poor";

// ── Performance Metrics ───────────────────────────────────────────────────────

export type PerformanceMetrics = {
  /** Largest Contentful Paint (ms) */
  lcp: number | null;
  /** First Input Delay (ms) — legacy metric */
  fid: number | null;
  /** Interaction to Next Paint (ms) — INP replaces FID */
  inp: number | null;
  /** Cumulative Layout Shift (unitless) */
  cls: number | null;
  /** Time to First Byte (ms) */
  ttfb: number | null;
  /** DOM Content Loaded (ms) */
  domContentLoaded: number | null;
  /** Page Load (ms) */
  pageLoad: number | null;
  /** Total Blocking Time (ms) */
  tbt: number | null;
};

// ── Thresholds ────────────────────────────────────────────────────────────────

export type PerformanceThresholds = {
  /** LCP thresholds [good, poor] in ms. Default [2500, 4000] */
  lcp: [number, number];
  /** INP thresholds [good, poor] in ms. Default [200, 500] */
  inp: [number, number];
  /** CLS thresholds [good, poor]. Default [0.1, 0.25] */
  cls: [number, number];
  /** TTFB thresholds [good, poor] in ms. Default [800, 1800] */
  ttfb: [number, number];
  /** FID thresholds [good, poor] in ms. Default [100, 300] */
  fid: [number, number];
  /** TBT thresholds [good, poor] in ms. Default [200, 600] */
  tbt: [number, number];
};

// ── Metric Comparison ─────────────────────────────────────────────────────────

export type MetricComparison = {
  /** Metric name */
  name: string;
  /** Current value */
  current: number | null;
  /** Baseline value */
  baseline: number | null;
  /** Status based on absolute thresholds */
  status: MetricStatus;
  /** Whether this metric regressed from baseline */
  regressed: boolean;
  /** Percentage change from baseline (positive = worse for timing metrics) */
  percentageChange: number | null;
};

// ── Baseline ──────────────────────────────────────────────────────────────────

export type PerformanceBaseline = {
  /** URL of the measured page */
  url: string;
  /** Captured metrics */
  metrics: PerformanceMetrics;
  /** Timestamp of capture */
  capturedAt: string;
};

// ── Comparison Result ─────────────────────────────────────────────────────────

export type PerformanceComparisonResult = {
  /** Per-metric comparison details */
  metrics: MetricComparison[];
  /** Overall whether any metric regressed */
  hasRegressions: boolean;
  /** Count of regressed metrics */
  regressionCount: number;
  /** Overall score (0-100) based on Web Vitals status */
  score: number;
};

// ── Raw Performance Entry ─────────────────────────────────────────────────────

export type RawPerformanceEntry = {
  name: string;
  entryType: string;
  startTime: number;
  duration: number;
  /** Additional entry-specific fields */
  [key: string]: unknown;
};
