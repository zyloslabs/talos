/**
 * Accessibility Testing Types
 *
 * Types for HTML-based accessibility scanning following WCAG guidelines.
 */

// ── WCAG Levels ───────────────────────────────────────────────────────────────

export type WcagLevel = "A" | "AA" | "AAA";

// ── WCAG Criterion ────────────────────────────────────────────────────────────

export type WcagCriterion = {
  /** WCAG criterion number (e.g. "1.1.1") */
  id: string;
  /** Human-readable name */
  name: string;
  /** Conformance level */
  level: WcagLevel;
  /** WCAG version where this criterion was introduced */
  version: "2.0" | "2.1" | "2.2";
};

// ── Violation ─────────────────────────────────────────────────────────────────

export type AccessibilityViolation = {
  /** Unique rule identifier */
  ruleId: string;
  /** Human-readable description */
  description: string;
  /** Impact level */
  impact: "critical" | "serious" | "moderate" | "minor";
  /** Related WCAG criterion */
  wcagCriterion: WcagCriterion;
  /** HTML elements that violate (summary strings, not full DOM) */
  elements: string[];
  /** Remediation guidance */
  remediation: string;
};

// ── Scan Result ───────────────────────────────────────────────────────────────

export type AccessibilityResult = {
  /** URL of the scanned page */
  url: string;
  /** Timestamp of the scan */
  scannedAt: string;
  /** Target conformance level */
  targetLevel: WcagLevel;
  /** Total violations found */
  totalViolations: number;
  /** Violations by impact */
  violationsByImpact: Record<string, number>;
  /** All violations */
  violations: AccessibilityViolation[];
  /** Number of criteria checked */
  criteriaChecked: number;
  /** Number of criteria passing */
  criteriaPassed: number;
  /** Accessibility score (0-100) */
  score: number;
};
