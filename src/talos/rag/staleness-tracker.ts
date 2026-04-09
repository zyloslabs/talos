/**
 * Staleness Tracker (#483)
 *
 * Adds TTL-based staleness tracking to RAG chunks.
 * Stale chunks receive a score penalty during retrieval.
 * Chunks past hard expiry can be purged.
 */

import type { VectorSearchResult } from "./vector-store.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type StalenessConfig = {
  /** TTL in milliseconds after which chunks get a retrieval penalty (default: 30 days) */
  ttlMs: number;
  /** Score multiplier for chunks older than TTL (default: 0.8) */
  stalePenalty: number;
  /** Score multiplier for chunks older than 2× TTL (default: 0.5) */
  veryStaleMultiplier: number;
  /** Hard expiry in milliseconds after which unverified chunks can be purged (default: 90 days) */
  hardExpiryMs: number;
};

export type StalenessInfo = {
  isStale: boolean;
  isVeryStale: boolean;
  isExpired: boolean;
  ageMs: number;
  penalty: number;
};

// ── Defaults ──────────────────────────────────────────────────────────────────

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export const DEFAULT_STALENESS_CONFIG: StalenessConfig = {
  ttlMs: THIRTY_DAYS_MS,
  stalePenalty: 0.8,
  veryStaleMultiplier: 0.5,
  hardExpiryMs: NINETY_DAYS_MS,
};

// ── Staleness Tracker ─────────────────────────────────────────────────────────

export class StalenessTracker {
  private config: StalenessConfig;
  private clock: () => number;

  constructor(config: Partial<StalenessConfig> = {}, clock?: () => number) {
    this.config = { ...DEFAULT_STALENESS_CONFIG, ...config };
    this.clock = clock ?? (() => Date.now());
  }

  /**
   * Assess the staleness of a chunk based on its lastVerifiedAt timestamp.
   */
  assessStaleness(lastVerifiedAt: number | undefined): StalenessInfo {
    const now = this.clock();

    if (lastVerifiedAt === undefined) {
      // No timestamp — treat as very stale
      return {
        isStale: true,
        isVeryStale: true,
        isExpired: false,
        ageMs: 0,
        penalty: this.config.veryStaleMultiplier,
      };
    }

    const ageMs = now - lastVerifiedAt;
    const isStale = ageMs > this.config.ttlMs;
    const isVeryStale = ageMs > this.config.ttlMs * 2;
    const isExpired = ageMs > this.config.hardExpiryMs;

    let penalty = 1.0;
    if (isVeryStale) {
      penalty = this.config.veryStaleMultiplier;
    } else if (isStale) {
      penalty = this.config.stalePenalty;
    }

    return { isStale, isVeryStale, isExpired, ageMs, penalty };
  }

  /**
   * Apply staleness penalty to search results.
   * Modifies scores in place and returns results sorted by adjusted score.
   */
  applyPenalties(results: VectorSearchResult[]): VectorSearchResult[] {
    return results
      .map((result) => {
        const staleness = this.assessStaleness(result.lastVerifiedAt);
        return {
          ...result,
          score: result.score * staleness.penalty,
        };
      })
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Filter out expired chunks (past hard expiry without verification).
   */
  filterExpired(results: VectorSearchResult[]): VectorSearchResult[] {
    return results.filter((r) => {
      const staleness = this.assessStaleness(r.lastVerifiedAt);
      return !staleness.isExpired;
    });
  }

  /**
   * Identify chunks that should be purged (past hard expiry).
   */
  getExpiredChunkIds(results: VectorSearchResult[]): string[] {
    return results
      .filter((r) => {
        const staleness = this.assessStaleness(r.lastVerifiedAt);
        return staleness.isExpired;
      })
      .map((r) => r.id);
  }

  /**
   * Get current configuration.
   */
  getConfig(): Readonly<StalenessConfig> {
    return { ...this.config };
  }
}
