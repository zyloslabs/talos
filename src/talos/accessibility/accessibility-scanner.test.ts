import { describe, it, expect } from "vitest";
import { AccessibilityScanner } from "./accessibility-scanner.js";

function wrapHtml(body: string, htmlAttrs = 'lang="en"'): string {
  return `<!DOCTYPE html><html ${htmlAttrs}><head><title>Test</title></head><body>${body}</body></html>`;
}

describe("AccessibilityScanner", () => {
  const scanner = new AccessibilityScanner();

  // ── img-alt ───────────────────────────────────────────────────────────────

  describe("img-alt", () => {
    it("reports images missing alt text", () => {
      const html = wrapHtml('<img src="photo.jpg"><img src="logo.png">');
      const result = scanner.scan(html, "https://example.com");
      const violation = result.violations.find((v) => v.ruleId === "img-alt");
      expect(violation).toBeDefined();
      expect(violation!.elements).toHaveLength(2);
      expect(violation!.impact).toBe("critical");
    });

    it("passes when all images have alt", () => {
      const html = wrapHtml('<img src="photo.jpg" alt="A photo"><img src="logo.png" alt="">');
      const result = scanner.scan(html, "https://example.com");
      const violation = result.violations.find((v) => v.ruleId === "img-alt");
      expect(violation).toBeUndefined();
    });

    it("handles mixed case attributes", () => {
      const html = wrapHtml('<img src="test.png" ALT="Test Alt">');
      const result = scanner.scan(html, "https://example.com");
      const violation = result.violations.find((v) => v.ruleId === "img-alt");
      expect(violation).toBeUndefined();
    });
  });

  // ── form-label ────────────────────────────────────────────────────────────

  describe("form-label", () => {
    it("reports inputs without labels", () => {
      const html = wrapHtml('<form><input type="text" name="email"></form>');
      const result = scanner.scan(html, "https://example.com");
      const violation = result.violations.find((v) => v.ruleId === "form-label");
      expect(violation).toBeDefined();
      expect(violation!.elements.length).toBeGreaterThan(0);
    });

    it("passes when input has aria-label", () => {
      const html = wrapHtml('<input type="text" aria-label="Email address">');
      const result = scanner.scan(html, "https://example.com");
      const violation = result.violations.find((v) => v.ruleId === "form-label");
      expect(violation).toBeUndefined();
    });

    it("passes when input has matching label for", () => {
      const html = wrapHtml(
        '<label for="email">Email</label><input type="text" id="email">'
      );
      const result = scanner.scan(html, "https://example.com");
      const violation = result.violations.find((v) => v.ruleId === "form-label");
      expect(violation).toBeUndefined();
    });

    it("skips hidden and submit inputs", () => {
      const html = wrapHtml(
        '<input type="hidden" name="csrf"><input type="submit" value="Go"><input type="button" value="Click">'
      );
      const result = scanner.scan(html, "https://example.com");
      const violation = result.violations.find((v) => v.ruleId === "form-label");
      expect(violation).toBeUndefined();
    });

    it("reports select without label", () => {
      const html = wrapHtml("<select><option>A</option></select>");
      const result = scanner.scan(html, "https://example.com");
      const violation = result.violations.find((v) => v.ruleId === "form-label");
      expect(violation).toBeDefined();
    });

    it("passes when input has title attribute", () => {
      const html = wrapHtml('<input type="text" title="Search">');
      const result = scanner.scan(html, "https://example.com");
      const violation = result.violations.find((v) => v.ruleId === "form-label");
      expect(violation).toBeUndefined();
    });
  });

  // ── html-lang ─────────────────────────────────────────────────────────────

  describe("html-lang", () => {
    it("reports missing lang on html element", () => {
      const html = "<!DOCTYPE html><html><head></head><body>Test</body></html>";
      const result = scanner.scan(html, "https://example.com");
      const violation = result.violations.find((v) => v.ruleId === "html-lang");
      expect(violation).toBeDefined();
      expect(violation!.impact).toBe("serious");
    });

    it("passes when lang is set", () => {
      const html = wrapHtml("<p>Hello</p>");
      const result = scanner.scan(html, "https://example.com");
      const violation = result.violations.find((v) => v.ruleId === "html-lang");
      expect(violation).toBeUndefined();
    });
  });

  // ── heading-order ─────────────────────────────────────────────────────────

  describe("heading-order", () => {
    it("reports skipped heading levels", () => {
      const html = wrapHtml("<h1>Title</h1><h3>Subtitle</h3>");
      const result = scanner.scan(html, "https://example.com");
      const violation = result.violations.find((v) => v.ruleId === "heading-order");
      expect(violation).toBeDefined();
      expect(violation!.elements[0]).toContain("h1");
    });

    it("passes with correct heading order", () => {
      const html = wrapHtml("<h1>Title</h1><h2>Section</h2><h3>Sub</h3>");
      const result = scanner.scan(html, "https://example.com");
      const violation = result.violations.find((v) => v.ruleId === "heading-order");
      expect(violation).toBeUndefined();
    });

    it("passes with single heading", () => {
      const html = wrapHtml("<h1>Title</h1>");
      const result = scanner.scan(html, "https://example.com");
      const violation = result.violations.find((v) => v.ruleId === "heading-order");
      expect(violation).toBeUndefined();
    });
  });

  // ── button-name ───────────────────────────────────────────────────────────

  describe("button-name", () => {
    it("reports buttons without text or aria-label", () => {
      const html = wrapHtml("<button></button>");
      const result = scanner.scan(html, "https://example.com");
      const violation = result.violations.find((v) => v.ruleId === "button-name");
      expect(violation).toBeDefined();
    });

    it("passes when button has text content", () => {
      const html = wrapHtml("<button>Submit</button>");
      const result = scanner.scan(html, "https://example.com");
      const violation = result.violations.find((v) => v.ruleId === "button-name");
      expect(violation).toBeUndefined();
    });

    it("passes when button has aria-label", () => {
      const html = wrapHtml('<button aria-label="Close"><svg/></button>');
      const result = scanner.scan(html, "https://example.com");
      const violation = result.violations.find((v) => v.ruleId === "button-name");
      expect(violation).toBeUndefined();
    });

    it("passes when button has icon child with text trimmed", () => {
      const html = wrapHtml("<button>  Click Me  </button>");
      const result = scanner.scan(html, "https://example.com");
      const violation = result.violations.find((v) => v.ruleId === "button-name");
      expect(violation).toBeUndefined();
    });

    it("strips nested/malformed tags iteratively in button content", () => {
      // Content like `<b<script>>alert</script>></b>` can survive a single regex pass
      const html = wrapHtml("<button><sp<span>an>visible</sp</span>an></button>");
      const result = scanner.scan(html, "https://example.com");
      // After iterative stripping "visible" text remains → no violation
      const violation = result.violations.find((v) => v.ruleId === "button-name");
      expect(violation).toBeUndefined();
    });
  });

  // ── tabindex-positive ─────────────────────────────────────────────────────

  describe("tabindex-positive", () => {
    it("reports positive tabindex values", () => {
      const html = wrapHtml('<div tabindex="5">Focus me</div>');
      const result = scanner.scan(html, "https://example.com");
      const violation = result.violations.find((v) => v.ruleId === "tabindex-positive");
      expect(violation).toBeDefined();
    });

    it("passes with tabindex 0 or -1", () => {
      const html = wrapHtml(
        '<div tabindex="0">OK</div><div tabindex="-1">Also OK</div>'
      );
      const result = scanner.scan(html, "https://example.com");
      const violation = result.violations.find((v) => v.ruleId === "tabindex-positive");
      expect(violation).toBeUndefined();
    });
  });

  // ── color-contrast-meta ───────────────────────────────────────────────────

  describe("color-contrast-meta", () => {
    it("reports suspected low contrast inline styles", () => {
      const html = wrapHtml('<p style="color: #ccc;">Light text</p>');
      const result = scanner.scan(html, "https://example.com");
      const violation = result.violations.find((v) => v.ruleId === "color-contrast-meta");
      expect(violation).toBeDefined();
    });

    it("only runs at AA level or higher", () => {
      const html = wrapHtml('<p style="color: #ccc;">Light text</p>');
      const result = scanner.scan(html, "https://example.com", "A");
      const violation = result.violations.find((v) => v.ruleId === "color-contrast-meta");
      expect(violation).toBeUndefined();
    });
  });

  // ── WCAG Level filtering ──────────────────────────────────────────────────

  describe("WCAG level filtering", () => {
    it("level A only runs A-level checks", () => {
      const html = wrapHtml('<p style="color: #ccc;">Light text</p>');
      const resultA = scanner.scan(html, "https://example.com", "A");
      const resultAA = scanner.scan(html, "https://example.com", "AA");
      // AA should have more criteria checked than A
      expect(resultAA.criteriaChecked).toBeGreaterThanOrEqual(resultA.criteriaChecked);
    });

    it("level AAA runs all checks", () => {
      const html = wrapHtml("<p>Test</p>");
      const resultAAA = scanner.scan(html, "https://example.com", "AAA");
      expect(resultAAA.criteriaChecked).toBeGreaterThan(0);
    });
  });

  // ── Score calculation ─────────────────────────────────────────────────────

  describe("score calculation", () => {
    it("returns 100 for fully accessible page", () => {
      const html = wrapHtml(
        '<h1>Title</h1><h2>Sub</h2><img src="x.png" alt="Photo"><label for="name">Name</label><input id="name" type="text"><button>Go</button>'
      );
      const result = scanner.scan(html, "https://example.com");
      expect(result.score).toBe(100);
    });

    it("returns score between 0 and 100 for pages with violations", () => {
      const html = "<!DOCTYPE html><html><body><img src='x.png'><input type='text'><button></button><h1>T</h1><h3>S</h3></body></html>";
      const result = scanner.scan(html, "https://example.com");
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThan(100);
    });

    it("tracks criteriaChecked and criteriaPassed correctly", () => {
      const html = wrapHtml("<p>Simple</p>");
      const result = scanner.scan(html, "https://example.com");
      expect(result.criteriaChecked).toBeGreaterThan(0);
      expect(result.criteriaPassed + result.totalViolations).toBe(result.criteriaChecked);
    });
  });

  // ── Result structure ──────────────────────────────────────────────────────

  describe("result structure", () => {
    it("has all required fields", () => {
      const html = wrapHtml("<p>Test</p>");
      const result = scanner.scan(html, "https://example.com");
      expect(result.url).toBe("https://example.com");
      expect(result.scannedAt).toBeTruthy();
      expect(result.targetLevel).toBe("AA");
      expect(typeof result.totalViolations).toBe("number");
      expect(result.violationsByImpact).toBeDefined();
      expect(Array.isArray(result.violations)).toBe(true);
      expect(typeof result.score).toBe("number");
    });

    it("violations have required fields", () => {
      const html = "<!DOCTYPE html><html><body><img src='x.png'></body></html>";
      const result = scanner.scan(html, "https://example.com");
      for (const v of result.violations) {
        expect(v.ruleId).toBeTruthy();
        expect(v.description).toBeTruthy();
        expect(v.impact).toBeTruthy();
        expect(v.wcagCriterion).toBeDefined();
        expect(v.wcagCriterion.id).toBeTruthy();
        expect(v.wcagCriterion.level).toBeTruthy();
        expect(v.remediation).toBeTruthy();
        expect(Array.isArray(v.elements)).toBe(true);
      }
    });
  });
});
