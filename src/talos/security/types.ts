/**
 * Security Testing Types
 *
 * Types for passive security scanning of web application responses.
 * Each finding maps to an OWASP Top 10 (2021) category.
 */

// ── OWASP Categories ──────────────────────────────────────────────────────────

export type OwaspCategory =
  | "A01:2021-Broken Access Control"
  | "A02:2021-Cryptographic Failures"
  | "A03:2021-Injection"
  | "A04:2021-Insecure Design"
  | "A05:2021-Security Misconfiguration"
  | "A06:2021-Vulnerable and Outdated Components"
  | "A07:2021-Identification and Authentication Failures"
  | "A08:2021-Software and Data Integrity Failures"
  | "A09:2021-Security Logging and Monitoring Failures"
  | "A10:2021-Server-Side Request Forgery";

// ── Severity ──────────────────────────────────────────────────────────────────

export type SecuritySeverity = "critical" | "high" | "medium" | "low" | "info";

// ── Findings ──────────────────────────────────────────────────────────────────

export type SecurityFinding = {
  /** Unique rule identifier (e.g. "missing-csp", "exposed-secret") */
  ruleId: string;
  /** Human-readable title */
  title: string;
  /** Detailed description of the finding */
  description: string;
  /** Severity level */
  severity: SecuritySeverity;
  /** OWASP Top 10 category */
  owaspCategory: OwaspCategory;
  /** Evidence / matched content (redacted for secrets) */
  evidence?: string;
  /** Remediation guidance */
  remediation: string;
};

// ── Scan Input ────────────────────────────────────────────────────────────────

export type SecurityScanInput = {
  /** The URL of the page being scanned */
  url: string;
  /** HTTP response headers (case-insensitive keys) */
  headers: Record<string, string>;
  /** HTML body content */
  body: string;
  /** HTTP status code */
  statusCode: number;
};

// ── Scan Result ───────────────────────────────────────────────────────────────

export type SecurityScanResult = {
  /** URL that was scanned */
  url: string;
  /** Timestamp of the scan */
  scannedAt: string;
  /** Total number of findings */
  totalFindings: number;
  /** Findings grouped by severity */
  findingsBySeverity: Record<SecuritySeverity, number>;
  /** All findings */
  findings: SecurityFinding[];
  /** Overall risk score (0-100, higher = more risk) */
  riskScore: number;
};
