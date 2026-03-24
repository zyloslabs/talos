/**
 * Tests for AutoTagger (#283)
 * Covers: autoTag persona detection, NFR detection, environment detection,
 *         functional area detection, validateTags, controlled vocabulary
 */

import { describe, it, expect } from "vitest";
import { AutoTagger, DOC_TYPES, PERSONAS, NFR_TAGS, ENVIRONMENTS } from "./auto-tagger.js";
import type { DocMetadata } from "./document-ingester.js";

const tagger = new AutoTagger();

const baseMeta: DocMetadata = { fileName: "req.md", docType: "prd" };

describe("AutoTagger", () => {
  // ── Controlled Vocabulary Constants ─────────────────────────────────────────

  describe("controlled vocabulary", () => {
    it("DOC_TYPES has expected values", () => {
      expect(DOC_TYPES).toEqual(["prd", "user_story", "api_spec", "functional_spec"]);
    });

    it("PERSONAS has expected values", () => {
      expect(PERSONAS).toEqual(["admin", "standard", "guest", "service", "user"]);
    });

    it("NFR_TAGS has expected values", () => {
      expect(NFR_TAGS).toEqual(["performance", "security", "accessibility", "reliability", "usability"]);
    });

    it("ENVIRONMENTS has expected values", () => {
      expect(ENVIRONMENTS).toEqual(["local", "staging", "production", "ci"]);
    });
  });

  // ── autoTag ─────────────────────────────────────────────────────────────────

  describe("autoTag", () => {
    it("includes docType from metadata", () => {
      const tags = tagger.autoTag("Some content", baseMeta);
      expect(tags).toContain("prd");
    });

    it("includes explicit metadata tags", () => {
      const meta: DocMetadata = { ...baseMeta, tags: ["custom-tag", "another"] };
      const tags = tagger.autoTag("Some content", meta);
      expect(tags).toContain("custom-tag");
      expect(tags).toContain("another");
    });

    // Persona detection
    it("detects admin persona", () => {
      const tags = tagger.autoTag("As an admin, I want to manage users", baseMeta);
      expect(tags).toContain("admin");
    });

    it("detects standard user persona", () => {
      const tags = tagger.autoTag("The standard user can view reports", baseMeta);
      expect(tags).toContain("standard");
    });

    it("detects guest persona", () => {
      const tags = tagger.autoTag("Guest access should be read-only", baseMeta);
      expect(tags).toContain("guest");
    });

    it("detects service persona", () => {
      const tags = tagger.autoTag("Service account used for machine-to-machine calls", baseMeta);
      expect(tags).toContain("service");
    });

    it("detects end user persona", () => {
      const tags = tagger.autoTag("As a user, I want to see my dashboard", baseMeta);
      expect(tags).toContain("user");
    });

    // NFR detection
    it("detects performance NFR", () => {
      const tags = tagger.autoTag("Response time must be under 200ms p99", baseMeta);
      expect(tags).toContain("performance");
    });

    it("detects security NFR", () => {
      const tags = tagger.autoTag("All endpoints require authentication", baseMeta);
      expect(tags).toContain("security");
    });

    it("detects accessibility NFR", () => {
      const tags = tagger.autoTag("Must comply with WCAG 2.1 AA", baseMeta);
      expect(tags).toContain("accessibility");
    });

    it("detects reliability NFR", () => {
      const tags = tagger.autoTag("System uptime SLA of 99.95%", baseMeta);
      expect(tags).toContain("reliability");
    });

    it("detects usability NFR", () => {
      const tags = tagger.autoTag("The UX should be intuitive for new users", baseMeta);
      expect(tags).toContain("usability");
    });

    // Environment detection
    it("detects local environment", () => {
      const tags = tagger.autoTag("Run locally on development environment", baseMeta);
      expect(tags).toContain("local");
    });

    it("detects staging environment", () => {
      const tags = tagger.autoTag("Deploy to staging for QA", baseMeta);
      expect(tags).toContain("staging");
    });

    it("detects production environment", () => {
      const tags = tagger.autoTag("This runs in production", baseMeta);
      expect(tags).toContain("production");
    });

    it("detects CI environment", () => {
      const tags = tagger.autoTag("Run tests in CI/CD pipeline", baseMeta);
      expect(tags).toContain("ci");
    });

    // Functional area detection
    it("detects auth functional area", () => {
      const tags = tagger.autoTag("Users must login with OAuth", baseMeta);
      expect(tags).toContain("auth");
    });

    it("detects checkout functional area", () => {
      const tags = tagger.autoTag("Add items to cart and proceed to checkout", baseMeta);
      expect(tags).toContain("checkout");
    });

    it("detects dashboard functional area", () => {
      const tags = tagger.autoTag("The dashboard shows analytics and metrics", baseMeta);
      expect(tags).toContain("dashboard");
    });

    it("detects navigation functional area", () => {
      const tags = tagger.autoTag("The sidebar menu expands on hover", baseMeta);
      expect(tags).toContain("navigation");
    });

    it("detects api functional area", () => {
      const tags = tagger.autoTag("The REST endpoint returns JSON", baseMeta);
      expect(tags).toContain("api");
    });

    // Multi-tag detection
    it("detects multiple tags from a single document", () => {
      const content = `
        As an admin, I want to configure security settings.
        The dashboard must load within 200ms response time.
        Deploy to staging for testing.
      `;
      const tags = tagger.autoTag(content, baseMeta);
      expect(tags).toContain("admin");
      expect(tags).toContain("security");
      expect(tags).toContain("performance");
      expect(tags).toContain("dashboard");
      expect(tags).toContain("staging");
    });

    it("deduplicates tags", () => {
      const meta: DocMetadata = { ...baseMeta, tags: ["admin"] };
      const tags = tagger.autoTag("As an admin, configure the admin panel", meta);
      const adminCount = tags.filter((t) => t === "admin").length;
      expect(adminCount).toBe(1);
    });

    it("returns only docType for content with no detectable patterns", () => {
      const tags = tagger.autoTag("Lorem ipsum dolor sit amet consectetur", baseMeta);
      expect(tags).toEqual(["prd"]);
    });
  });

  // ── validateTags ────────────────────────────────────────────────────────────

  describe("validateTags", () => {
    it("classifies controlled vocabulary tags as valid", () => {
      const result = tagger.validateTags(["admin", "performance", "staging", "prd"]);
      expect(result.valid).toEqual(["admin", "performance", "staging", "prd"]);
      expect(result.invalid).toEqual([]);
    });

    it("classifies unknown tags as invalid", () => {
      const result = tagger.validateTags(["auth", "checkout", "random-tag"]);
      expect(result.invalid).toContain("auth");
      expect(result.invalid).toContain("checkout");
      expect(result.invalid).toContain("random-tag");
    });

    it("handles mixed valid and invalid tags", () => {
      const result = tagger.validateTags(["admin", "custom", "security", "foo"]);
      expect(result.valid).toEqual(["admin", "security"]);
      expect(result.invalid).toEqual(["custom", "foo"]);
    });

    it("handles empty tags array", () => {
      const result = tagger.validateTags([]);
      expect(result.valid).toEqual([]);
      expect(result.invalid).toEqual([]);
    });
  });
});
