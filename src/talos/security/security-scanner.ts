/**
 * SecurityScanner — Passive security checks on HTTP responses.
 *
 * Checks response headers, HTML content for common security issues.
 * No browser or subprocess required — pure string/header analysis.
 */

import type {
  SecurityFinding,
  SecurityScanInput,
  SecurityScanResult,
  SecuritySeverity,
} from "./types.js";

export class SecurityScanner {
  /**
   * Run all passive security checks against a page response.
   */
  scan(input: SecurityScanInput): SecurityScanResult {
    const findings: SecurityFinding[] = [
      ...this.checkHeaders(input),
      ...this.checkMixedContent(input),
      ...this.checkExposedSecrets(input),
      ...this.checkMisconfigurations(input),
    ];

    const findingsBySeverity = this.countBySeverity(findings);
    const riskScore = this.calculateRiskScore(findings);

    return {
      url: input.url,
      scannedAt: new Date().toISOString(),
      totalFindings: findings.length,
      findingsBySeverity,
      findings,
      riskScore,
    };
  }

  // ── Header Checks ─────────────────────────────────────────────────────────

  private checkHeaders(input: SecurityScanInput): SecurityFinding[] {
    const findings: SecurityFinding[] = [];
    const h = this.normalizeHeaders(input.headers);

    if (!h["content-security-policy"]) {
      findings.push({
        ruleId: "missing-csp",
        title: "Missing Content-Security-Policy header",
        description:
          "The Content-Security-Policy header is not set. This leaves the application vulnerable to XSS and data injection attacks.",
        severity: "high",
        owaspCategory: "A05:2021-Security Misconfiguration",
        remediation:
          "Add a Content-Security-Policy header with a restrictive policy (e.g. default-src 'self').",
      });
    }

    if (!h["strict-transport-security"]) {
      findings.push({
        ruleId: "missing-hsts",
        title: "Missing Strict-Transport-Security header",
        description:
          "The HSTS header is not set. Browsers may allow HTTP connections, exposing users to downgrade attacks.",
        severity: "high",
        owaspCategory: "A02:2021-Cryptographic Failures",
        remediation:
          "Add Strict-Transport-Security: max-age=31536000; includeSubDomains; preload.",
      });
    }

    if (!h["x-frame-options"]) {
      findings.push({
        ruleId: "missing-x-frame-options",
        title: "Missing X-Frame-Options header",
        description:
          "The X-Frame-Options header is not set. The page can be embedded in iframes, enabling clickjacking attacks.",
        severity: "medium",
        owaspCategory: "A05:2021-Security Misconfiguration",
        remediation: "Add X-Frame-Options: DENY or SAMEORIGIN.",
      });
    }

    if (!h["x-content-type-options"]) {
      findings.push({
        ruleId: "missing-x-content-type-options",
        title: "Missing X-Content-Type-Options header",
        description:
          "The X-Content-Type-Options header is not set. Browsers may MIME-sniff responses, leading to XSS.",
        severity: "medium",
        owaspCategory: "A05:2021-Security Misconfiguration",
        remediation: "Add X-Content-Type-Options: nosniff.",
      });
    }

    if (!h["referrer-policy"]) {
      findings.push({
        ruleId: "missing-referrer-policy",
        title: "Missing Referrer-Policy header",
        description:
          "The Referrer-Policy header is not set. Sensitive URL parameters may leak via the Referer header.",
        severity: "low",
        owaspCategory: "A05:2021-Security Misconfiguration",
        remediation:
          "Add Referrer-Policy: strict-origin-when-cross-origin or no-referrer.",
      });
    }

    return findings;
  }

  // ── Mixed Content Checks ──────────────────────────────────────────────────

  private checkMixedContent(input: SecurityScanInput): SecurityFinding[] {
    const findings: SecurityFinding[] = [];

    // Only relevant for HTTPS pages
    if (!input.url.startsWith("https://")) return findings;

    // Match src, href, action attributes loading HTTP resources
    const httpResourcePattern =
      /(?:src|href|action)\s*=\s*["']http:\/\/[^"']+["']/gi;
    const matches = input.body.match(httpResourcePattern);
    if (matches && matches.length > 0) {
      findings.push({
        ruleId: "mixed-content",
        title: "Mixed content detected",
        description: `HTTPS page loads ${matches.length} resource(s) over insecure HTTP.`,
        severity: "high",
        owaspCategory: "A02:2021-Cryptographic Failures",
        evidence: matches.slice(0, 3).join(", "),
        remediation:
          "Ensure all resources are loaded over HTTPS. Use protocol-relative URLs or update to HTTPS.",
      });
    }

    return findings;
  }

  // ── Exposed Secrets ───────────────────────────────────────────────────────

  private checkExposedSecrets(input: SecurityScanInput): SecurityFinding[] {
    const findings: SecurityFinding[] = [];

    const secretPatterns: Array<{
      ruleId: string;
      title: string;
      pattern: RegExp;
      severity: SecuritySeverity;
    }> = [
      {
        ruleId: "exposed-aws-key",
        title: "Exposed AWS Access Key",
        pattern: /AKIA[0-9A-Z]{16}/g,
        severity: "critical",
      },
      {
        ruleId: "exposed-github-token",
        title: "Exposed GitHub Token",
        pattern: /gh[pousr]_[A-Za-z0-9_]{36,255}/g,
        severity: "critical",
      },
      {
        ruleId: "exposed-generic-api-key",
        title: "Potential API key in HTML/JS",
        pattern:
          /(?:api[_-]?key|apikey|api[_-]?secret)\s*[:=]\s*["']([A-Za-z0-9_\-]{20,})["']/gi,
        severity: "high",
      },
      {
        ruleId: "exposed-password-field-value",
        title: "Password value in HTML source",
        pattern:
          /(?:password|passwd|pwd)\s*[:=]\s*["']([^"']{4,})["']/gi,
        severity: "high",
      },
      {
        ruleId: "exposed-jwt",
        title: "JWT token in HTML/JS",
        pattern: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
        severity: "high",
      },
      {
        ruleId: "exposed-private-key",
        title: "Private key material in page",
        pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g,
        severity: "critical",
      },
    ];

    for (const sp of secretPatterns) {
      const matches = input.body.match(sp.pattern);
      if (matches && matches.length > 0) {
        // Redact matched content for safety
        const redacted = matches
          .slice(0, 3)
          .map((m) => m.slice(0, 8) + "***REDACTED***");
        findings.push({
          ruleId: sp.ruleId,
          title: sp.title,
          description: `Found ${matches.length} potential secret(s) in the page source.`,
          severity: sp.severity,
          owaspCategory: "A02:2021-Cryptographic Failures",
          evidence: redacted.join(", "),
          remediation:
            "Remove secrets from client-side code. Use environment variables and server-side APIs.",
        });
      }
    }

    return findings;
  }

  // ── Misconfiguration Checks ───────────────────────────────────────────────

  private checkMisconfigurations(input: SecurityScanInput): SecurityFinding[] {
    const findings: SecurityFinding[] = [];
    const h = this.normalizeHeaders(input.headers);

    // Server version exposure
    const serverHeader = h["server"];
    if (serverHeader && /\/\d/.test(serverHeader)) {
      findings.push({
        ruleId: "server-version-exposed",
        title: "Server version exposed in header",
        description: `The Server header reveals version information: "${serverHeader}".`,
        severity: "low",
        owaspCategory: "A05:2021-Security Misconfiguration",
        evidence: serverHeader,
        remediation:
          "Remove or genericize the Server header to avoid revealing implementation details.",
      });
    }

    // X-Powered-By
    if (h["x-powered-by"]) {
      findings.push({
        ruleId: "x-powered-by-exposed",
        title: "X-Powered-By header exposed",
        description: `The X-Powered-By header reveals technology: "${h["x-powered-by"]}".`,
        severity: "low",
        owaspCategory: "A05:2021-Security Misconfiguration",
        evidence: h["x-powered-by"],
        remediation: "Remove the X-Powered-By header.",
      });
    }

    // CORS wildcard
    const corsOrigin = h["access-control-allow-origin"];
    if (corsOrigin === "*") {
      findings.push({
        ruleId: "cors-wildcard",
        title: "CORS wildcard origin",
        description:
          "Access-Control-Allow-Origin is set to '*', allowing any domain to make cross-origin requests.",
        severity: "medium",
        owaspCategory: "A05:2021-Security Misconfiguration",
        remediation:
          "Restrict CORS to specific trusted origins instead of using a wildcard.",
      });
    }

    // Directory listing indicators
    const directoryListingPatterns = [
      /<title>Index of \//i,
      /<h1>Index of \//i,
      /Parent Directory<\/a>/i,
      /<title>Directory listing for/i,
    ];
    for (const pattern of directoryListingPatterns) {
      if (pattern.test(input.body)) {
        findings.push({
          ruleId: "directory-listing",
          title: "Directory listing enabled",
          description:
            "The server appears to have directory listing enabled, exposing file structure.",
          severity: "medium",
          owaspCategory: "A01:2021-Broken Access Control",
          remediation:
            "Disable directory listing in the web server configuration.",
        });
        break;
      }
    }

    return findings;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private normalizeHeaders(
    headers: Record<string, string>
  ): Record<string, string> {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      normalized[key.toLowerCase()] = value;
    }
    return normalized;
  }

  private countBySeverity(
    findings: SecurityFinding[]
  ): Record<SecuritySeverity, number> {
    const counts: Record<SecuritySeverity, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };
    for (const f of findings) {
      counts[f.severity]++;
    }
    return counts;
  }

  private calculateRiskScore(findings: SecurityFinding[]): number {
    const weights: Record<SecuritySeverity, number> = {
      critical: 25,
      high: 15,
      medium: 8,
      low: 3,
      info: 1,
    };
    let score = 0;
    for (const f of findings) {
      score += weights[f.severity];
    }
    return Math.min(100, score);
  }
}
