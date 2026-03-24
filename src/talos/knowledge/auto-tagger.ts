/**
 * Auto-Tagger
 *
 * NLP heuristic-based auto-tagging for knowledge base documents.
 * Detects personas, NFR keywords, environments, and functional areas.
 */

import type { DocMetadata } from "./document-ingester.js";

// ── Controlled Vocabulary ─────────────────────────────────────────────────────

export const DOC_TYPES = ["prd", "user_story", "api_spec", "functional_spec"] as const;

export const PERSONAS = ["admin", "standard", "guest", "service", "user"] as const;

export const NFR_TAGS = ["performance", "security", "accessibility", "reliability", "usability"] as const;

export const ENVIRONMENTS = ["local", "staging", "production", "ci"] as const;

/** All controlled vocabulary tags combined */
const CONTROLLED_VOCABULARY = new Set<string>([
  ...DOC_TYPES,
  ...PERSONAS,
  ...NFR_TAGS,
  ...ENVIRONMENTS,
]);

// ── Keyword Patterns ──────────────────────────────────────────────────────────

const PERSONA_PATTERNS: Array<{ pattern: RegExp; tag: string }> = [
  { pattern: /\b(?:as an? admin|admin user|administrator)\b/i, tag: "admin" },
  { pattern: /\b(?:as a standard|standard user|regular user)\b/i, tag: "standard" },
  { pattern: /\b(?:as a guest|guest user|guest access|unauthenticated user)\b/i, tag: "guest" },
  { pattern: /\b(?:service account|service user|api client|machine-to-machine)\b/i, tag: "service" },
  { pattern: /\b(?:as a user|end user|logged-in user|authenticated user)\b/i, tag: "user" },
];

const NFR_PATTERNS: Array<{ pattern: RegExp; tag: string }> = [
  { pattern: /\b(?:performance|load time|latency|throughput|response time|p99|p95)\b/i, tag: "performance" },
  { pattern: /\b(?:secur(?:e|ity)|auth(?:entication|orization)|encrypt|OWASP|CSRF|XSS|injection|credential)\b/i, tag: "security" },
  { pattern: /\b(?:accessib(?:le|ility)|WCAG|ARIA|screen reader|keyboard navigation|a11y)\b/i, tag: "accessibility" },
  { pattern: /\b(?:reliab(?:le|ility)|uptime|SLA|fault.?toleran|redundan|failover|disaster recovery)\b/i, tag: "reliability" },
  { pattern: /\b(?:usab(?:le|ility)|user experience|UX|intuitive|ease of use)\b/i, tag: "usability" },
];

const ENVIRONMENT_PATTERNS: Array<{ pattern: RegExp; tag: string }> = [
  { pattern: /\b(?:local(?:host|ly)?|dev(?:elopment)?\s*environment)\b/i, tag: "local" },
  { pattern: /\b(?:staging|stage|pre-?prod(?:uction)?)\b/i, tag: "staging" },
  { pattern: /\b(?:production|prod\b|live environment)\b/i, tag: "production" },
  { pattern: /\b(?:CI|CD|CI\/CD|continuous integration|pipeline|github actions)\b/i, tag: "ci" },
];

const FUNCTIONAL_AREA_PATTERNS: Array<{ pattern: RegExp; tag: string }> = [
  { pattern: /\b(?:auth(?:entication)?|login|sign[- ]?in|sign[- ]?up|register|SSO|OAuth|JWT)\b/i, tag: "auth" },
  { pattern: /\b(?:checkout|cart|payment|billing|invoice|subscription)\b/i, tag: "checkout" },
  { pattern: /\b(?:dashboard|overview|analytics|metrics|reporting)\b/i, tag: "dashboard" },
  { pattern: /\b(?:profile|account settings|user settings|preferences)\b/i, tag: "profile" },
  { pattern: /\b(?:search|filter|sort|pagination|query)\b/i, tag: "search" },
  { pattern: /\b(?:notification|alert|email|message|push)\b/i, tag: "notifications" },
  { pattern: /\b(?:navigation|menu|sidebar|header|footer|breadcrumb)\b/i, tag: "navigation" },
  { pattern: /\b(?:upload|download|file|import|export)\b/i, tag: "files" },
  { pattern: /\b(?:API|endpoint|REST|GraphQL|webhook)\b/i, tag: "api" },
];

// ── AutoTagger Class ──────────────────────────────────────────────────────────

export class AutoTagger {
  /**
   * Auto-tag content using NLP heuristics.
   * Returns a deduplicated array of tags.
   */
  autoTag(content: string, metadata: DocMetadata): string[] {
    const tags = new Set<string>();

    // Add docType from metadata
    if (metadata.docType) {
      tags.add(metadata.docType);
    }

    // Add explicit tags from metadata
    if (metadata.tags) {
      for (const t of metadata.tags) {
        tags.add(t);
      }
    }

    // Detect personas
    for (const { pattern, tag } of PERSONA_PATTERNS) {
      if (pattern.test(content)) {
        tags.add(tag);
      }
    }

    // Detect NFR keywords
    for (const { pattern, tag } of NFR_PATTERNS) {
      if (pattern.test(content)) {
        tags.add(tag);
      }
    }

    // Detect environments
    for (const { pattern, tag } of ENVIRONMENT_PATTERNS) {
      if (pattern.test(content)) {
        tags.add(tag);
      }
    }

    // Detect functional areas
    for (const { pattern, tag } of FUNCTIONAL_AREA_PATTERNS) {
      if (pattern.test(content)) {
        tags.add(tag);
      }
    }

    return [...tags];
  }

  /**
   * Validate tags against the controlled vocabulary.
   */
  validateTags(tags: string[]): { valid: string[]; invalid: string[] } {
    const valid: string[] = [];
    const invalid: string[] = [];

    for (const tag of tags) {
      if (CONTROLLED_VOCABULARY.has(tag)) {
        valid.push(tag);
      } else {
        invalid.push(tag);
      }
    }

    return { valid, invalid };
  }
}
