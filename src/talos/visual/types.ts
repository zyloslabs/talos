/**
 * Visual Regression Testing Types
 *
 * Types for pixel-based visual comparison of screenshots.
 */

// ── Diff Region ───────────────────────────────────────────────────────────────

export type DiffRegion = {
  /** Top-left X coordinate */
  x: number;
  /** Top-left Y coordinate */
  y: number;
  /** Width of the diff region */
  width: number;
  /** Height of the diff region */
  height: number;
};

// ── Comparison Result ─────────────────────────────────────────────────────────

export type VisualComparisonResult = {
  /** Whether the images match within the threshold */
  matches: boolean;
  /** Percentage of pixels that differ (0-100) */
  diffPercentage: number;
  /** Configured threshold percentage */
  threshold: number;
  /** Total pixels compared */
  totalPixels: number;
  /** Number of pixels that differ */
  diffPixelCount: number;
  /** Bounding boxes of changed areas */
  diffRegions: DiffRegion[];
  /** Image dimensions */
  width: number;
  height: number;
};

// ── Baseline ──────────────────────────────────────────────────────────────────

export type VisualBaseline = {
  /** Application ID */
  appId: string;
  /** Page identifier */
  pageId: string;
  /** File system path to the baseline image */
  filePath: string;
  /** Timestamp when baseline was captured */
  capturedAt: string;
  /** Image width */
  width: number;
  /** Image height */
  height: number;
};
