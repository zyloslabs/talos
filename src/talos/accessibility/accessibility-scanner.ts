/**
 * AccessibilityScanner — HTML-based accessibility rule checks.
 *
 * Implements WCAG 2.0/2.1/2.2 rule checks via string/regex analysis.
 * No browser or jsdom required — pure string parsing.
 */

import type {
  AccessibilityViolation,
  AccessibilityResult,
  WcagLevel,
  WcagCriterion,
} from "./types.js";

type RuleCheck = {
  ruleId: string;
  description: string;
  impact: AccessibilityViolation["impact"];
  wcagCriterion: WcagCriterion;
  remediation: string;
  /** Return matching violating elements (empty = pass) */
  check: (html: string) => string[];
  /** Minimum WCAG level required to run this check */
  minLevel: WcagLevel;
};

const LEVEL_ORDER: Record<WcagLevel, number> = { A: 1, AA: 2, AAA: 3 };

export class AccessibilityScanner {
  private rules: RuleCheck[] = [
    // ── 1.1.1 Non-text Content (Level A) ──────────────────────────────────
    {
      ruleId: "img-alt",
      description: "Images must have alt text",
      impact: "critical",
      wcagCriterion: {
        id: "1.1.1",
        name: "Non-text Content",
        level: "A",
        version: "2.0",
      },
      remediation: "Add an alt attribute to all <img> elements. Use alt=\"\" for decorative images.",
      minLevel: "A",
      check: (html) => {
        const elements: string[] = [];
        const imgPattern = /<img\b([^>]*)>/gi;
        let match;
        while ((match = imgPattern.exec(html)) !== null) {
          const attrs = match[1];
          if (!/\balt\s*=/i.test(attrs)) {
            elements.push(this.truncateElement(match[0]));
          }
        }
        return elements;
      },
    },

    // ── 1.3.1 Info and Relationships (Level A) — form labels ──────────────
    {
      ruleId: "form-label",
      description: "Form inputs must have associated labels",
      impact: "critical",
      wcagCriterion: {
        id: "1.3.1",
        name: "Info and Relationships",
        level: "A",
        version: "2.0",
      },
      remediation:
        "Add a <label> element with a matching 'for' attribute, or use aria-label / aria-labelledby.",
      minLevel: "A",
      check: (html) => {
        const elements: string[] = [];
        // Match text inputs, selects, textareas without aria-label or wrapping label
        const inputPattern =
          /<(?:input|select|textarea)\b([^>]*)>/gi;
        let match;
        while ((match = inputPattern.exec(html)) !== null) {
          const attrs = match[1];
          // Skip hidden/submit/button/reset inputs
          const typeMatch = attrs.match(/\btype\s*=\s*["'](\w+)["']/i);
          const inputType = typeMatch ? typeMatch[1].toLowerCase() : "text";
          if (["hidden", "submit", "button", "reset", "image"].includes(inputType)) {
            continue;
          }
          const hasAriaLabel = /\baria-label\s*=/i.test(attrs);
          const hasAriaLabelledBy = /\baria-labelledby\s*=/i.test(attrs);
          const hasTitle = /\btitle\s*=/i.test(attrs);
          if (!hasAriaLabel && !hasAriaLabelledBy && !hasTitle) {
            // Check if there's a corresponding label with 'for' matching this input's id
            const idMatch = attrs.match(/\bid\s*=\s*["']([^"']+)["']/i);
            if (!idMatch || !new RegExp(`<label[^>]*\\bfor\\s*=\\s*["']${this.escapeRegex(idMatch[1])}["']`, "i").test(html)) {
              elements.push(this.truncateElement(match[0]));
            }
          }
        }
        return elements;
      },
    },

    // ── 3.1.1 Language of Page (Level A) ──────────────────────────────────
    {
      ruleId: "html-lang",
      description: "The html element must have a lang attribute",
      impact: "serious",
      wcagCriterion: {
        id: "3.1.1",
        name: "Language of Page",
        level: "A",
        version: "2.0",
      },
      remediation: 'Add a lang attribute to the <html> element (e.g. <html lang="en">).',
      minLevel: "A",
      check: (html) => {
        const htmlTag = html.match(/<html\b([^>]*)>/i);
        if (!htmlTag) return [];
        if (!/\blang\s*=\s*["'][^"']+["']/i.test(htmlTag[1])) {
          return [this.truncateElement(htmlTag[0])];
        }
        return [];
      },
    },

    // ── 1.3.1 Heading Hierarchy (Level A) ─────────────────────────────────
    {
      ruleId: "heading-order",
      description: "Headings must follow a logical order (no skipping levels)",
      impact: "moderate",
      wcagCriterion: {
        id: "1.3.1",
        name: "Info and Relationships",
        level: "A",
        version: "2.0",
      },
      remediation:
        "Use headings in order (h1 → h2 → h3). Do not skip levels (e.g. h1 directly to h3).",
      minLevel: "A",
      check: (html) => {
        const elements: string[] = [];
        const headingPattern = /<h([1-6])\b[^>]*>/gi;
        let prevLevel = 0;
        let match;
        while ((match = headingPattern.exec(html)) !== null) {
          const level = parseInt(match[1], 10);
          if (prevLevel > 0 && level > prevLevel + 1) {
            elements.push(
              `Skipped from h${prevLevel} to h${level}: ${this.truncateElement(match[0])}`
            );
          }
          prevLevel = level;
        }
        return elements;
      },
    },

    // ── 4.1.2 Name, Role, Value (Level A) — interactive elements ──────────
    {
      ruleId: "button-name",
      description: "Buttons must have discernible text",
      impact: "critical",
      wcagCriterion: {
        id: "4.1.2",
        name: "Name, Role, Value",
        level: "A",
        version: "2.0",
      },
      remediation:
        "Add text content, aria-label, or aria-labelledby to interactive buttons.",
      minLevel: "A",
      check: (html) => {
        const elements: string[] = [];
        // Match <button> tags and check for text content or aria-label
        const buttonPattern = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
        let match;
        while ((match = buttonPattern.exec(html)) !== null) {
          const attrs = match[1];
          const content = match[2].replace(/<[^>]+>/g, "").trim();
          const hasAriaLabel = /\baria-label\s*=/i.test(attrs);
          const hasAriaLabelledBy = /\baria-labelledby\s*=/i.test(attrs);
          const hasTitle = /\btitle\s*=/i.test(attrs);
          if (!content && !hasAriaLabel && !hasAriaLabelledBy && !hasTitle) {
            elements.push(this.truncateElement(match[0]));
          }
        }
        return elements;
      },
    },

    // ── 2.1.1 Keyboard (Level A) — tabindex misuse ───────────────────────
    {
      ruleId: "tabindex-positive",
      description:
        "Avoid positive tabindex values that disrupt natural tab order",
      impact: "serious",
      wcagCriterion: {
        id: "2.1.1",
        name: "Keyboard",
        level: "A",
        version: "2.0",
      },
      remediation:
        'Use tabindex="0" for focusable elements or tabindex="-1" for programmatic focus. Avoid positive values.',
      minLevel: "A",
      check: (html) => {
        const elements: string[] = [];
        const tabindexPattern = /tabindex\s*=\s*["'](\d+)["']/gi;
        let match;
        while ((match = tabindexPattern.exec(html)) !== null) {
          const value = parseInt(match[1], 10);
          if (value > 0) {
            // Get surrounding context
            const start = Math.max(0, match.index - 40);
            const end = Math.min(html.length, match.index + match[0].length + 40);
            elements.push(html.slice(start, end).replace(/\n/g, " ").trim());
          }
        }
        return elements;
      },
    },

    // ── 1.4.3 Contrast (Level AA) — meta check ──────────────────────────
    {
      ruleId: "color-contrast-meta",
      description:
        "Inline styles with low-contrast color combinations detected (heuristic check)",
      impact: "serious",
      wcagCriterion: {
        id: "1.4.3",
        name: "Contrast (Minimum)",
        level: "AA",
        version: "2.0",
      },
      remediation:
        "Ensure text has a contrast ratio of at least 4.5:1 against its background. Use a contrast checker tool.",
      minLevel: "AA",
      check: (html) => {
        const elements: string[] = [];
        // Detect very light text on white or near-white backgrounds (heuristic)
        const stylePattern = /style\s*=\s*["']([^"']*)["']/gi;
        let match;
        while ((match = stylePattern.exec(html)) !== null) {
          const style = match[1].toLowerCase();
          // Check for light gray text (known problem pattern)
          if (
            /color\s*:\s*#(?:ccc|ddd|eee|fff|c0c0c0|d3d3d3)/i.test(style) &&
            !/background/i.test(style)
          ) {
            elements.push(`Potential low contrast: ${match[0].slice(0, 80)}`);
          }
        }
        return elements;
      },
    },
  ];

  /**
   * Run accessibility checks against HTML content.
   */
  scan(
    htmlContent: string,
    pageUrl: string,
    targetLevel: WcagLevel = "AA"
  ): AccessibilityResult {
    const targetOrder = LEVEL_ORDER[targetLevel];
    const applicableRules = this.rules.filter(
      (r) => LEVEL_ORDER[r.minLevel] <= targetOrder
    );

    const violations: AccessibilityViolation[] = [];
    let criteriaChecked = 0;
    let criteriaPassed = 0;

    for (const rule of applicableRules) {
      criteriaChecked++;
      const elements = rule.check(htmlContent);
      if (elements.length > 0) {
        violations.push({
          ruleId: rule.ruleId,
          description: rule.description,
          impact: rule.impact,
          wcagCriterion: rule.wcagCriterion,
          elements,
          remediation: rule.remediation,
        });
      } else {
        criteriaPassed++;
      }
    }

    const violationsByImpact: Record<string, number> = {
      critical: 0,
      serious: 0,
      moderate: 0,
      minor: 0,
    };
    for (const v of violations) {
      violationsByImpact[v.impact] = (violationsByImpact[v.impact] ?? 0) + 1;
    }

    const score =
      criteriaChecked > 0
        ? Math.round((criteriaPassed / criteriaChecked) * 100)
        : 100;

    return {
      url: pageUrl,
      scannedAt: new Date().toISOString(),
      targetLevel,
      totalViolations: violations.length,
      violationsByImpact,
      violations,
      criteriaChecked,
      criteriaPassed,
      score,
    };
  }

  private truncateElement(element: string, maxLen = 120): string {
    if (element.length <= maxLen) return element;
    return element.slice(0, maxLen) + "...";
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
