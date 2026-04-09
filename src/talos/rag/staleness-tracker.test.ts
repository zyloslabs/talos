/**
 * Tests for StalenessTracker (#483)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { StalenessTracker, DEFAULT_STALENESS_CONFIG } from "./staleness-tracker.js";
import type { VectorSearchResult } from "./vector-store.js";

const NOW = 1_700_000_000_000; // Fixed "now" timestamp
const ONE_DAY = 24 * 60 * 60 * 1000;
const THIRTY_DAYS = 30 * ONE_DAY;
const SIXTY_DAYS = 60 * ONE_DAY;
const NINETY_DAYS = 90 * ONE_DAY;

function makeResult(overrides: Partial<VectorSearchResult> = {}): VectorSearchResult {
  return {
    id: "chunk-1",
    content: "test content",
    filePath: "test.ts",
    startLine: 1,
    endLine: 10,
    type: "code",
    score: 0.9,
    metadata: {},
    ...overrides,
  };
}

describe("StalenessTracker", () => {
  let tracker: StalenessTracker;

  beforeEach(() => {
    tracker = new StalenessTracker({}, () => NOW);
  });

  describe("assessStaleness", () => {
    it("returns no penalty for fresh chunks", () => {
      const result = tracker.assessStaleness(NOW - ONE_DAY);
      expect(result.isStale).toBe(false);
      expect(result.isVeryStale).toBe(false);
      expect(result.isExpired).toBe(false);
      expect(result.penalty).toBe(1.0);
    });

    it("returns stale penalty for chunks older than TTL", () => {
      const result = tracker.assessStaleness(NOW - THIRTY_DAYS - ONE_DAY);
      expect(result.isStale).toBe(true);
      expect(result.isVeryStale).toBe(false);
      expect(result.penalty).toBe(0.8);
    });

    it("returns very stale penalty for chunks older than 2x TTL", () => {
      const result = tracker.assessStaleness(NOW - SIXTY_DAYS - ONE_DAY);
      expect(result.isStale).toBe(true);
      expect(result.isVeryStale).toBe(true);
      expect(result.penalty).toBe(0.5);
    });

    it("marks chunks past hard expiry as expired", () => {
      const result = tracker.assessStaleness(NOW - NINETY_DAYS - ONE_DAY);
      expect(result.isExpired).toBe(true);
    });

    it("treats undefined lastVerifiedAt as very stale", () => {
      const result = tracker.assessStaleness(undefined);
      expect(result.isStale).toBe(true);
      expect(result.isVeryStale).toBe(true);
      expect(result.penalty).toBe(0.5);
    });

    it("calculates correct ageMs", () => {
      const verifiedAt = NOW - 5 * ONE_DAY;
      const result = tracker.assessStaleness(verifiedAt);
      expect(result.ageMs).toBe(5 * ONE_DAY);
    });

    it("does not mark exactly-at-TTL chunks as stale", () => {
      const result = tracker.assessStaleness(NOW - THIRTY_DAYS);
      expect(result.isStale).toBe(false);
      expect(result.penalty).toBe(1.0);
    });
  });

  describe("applyPenalties", () => {
    it("does not penalize fresh results", () => {
      const results = [makeResult({ score: 0.9, lastVerifiedAt: NOW - ONE_DAY })];
      const penalized = tracker.applyPenalties(results);
      expect(penalized[0].score).toBe(0.9);
    });

    it("applies stale penalty to old results", () => {
      const results = [makeResult({ score: 0.9, lastVerifiedAt: NOW - THIRTY_DAYS - ONE_DAY })];
      const penalized = tracker.applyPenalties(results);
      expect(penalized[0].score).toBeCloseTo(0.72); // 0.9 * 0.8
    });

    it("applies very stale penalty to very old results", () => {
      const results = [makeResult({ score: 0.8, lastVerifiedAt: NOW - SIXTY_DAYS - ONE_DAY })];
      const penalized = tracker.applyPenalties(results);
      expect(penalized[0].score).toBeCloseTo(0.4); // 0.8 * 0.5
    });

    it("re-sorts results by adjusted score", () => {
      const results = [
        makeResult({ id: "old-high", score: 0.95, lastVerifiedAt: NOW - SIXTY_DAYS - ONE_DAY }),
        makeResult({ id: "fresh-low", score: 0.6, lastVerifiedAt: NOW - ONE_DAY }),
      ];
      const penalized = tracker.applyPenalties(results);
      expect(penalized[0].id).toBe("fresh-low"); // 0.6 > 0.95 * 0.5 = 0.475
      expect(penalized[1].id).toBe("old-high");
    });
  });

  describe("filterExpired", () => {
    it("keeps non-expired results", () => {
      const results = [makeResult({ lastVerifiedAt: NOW - ONE_DAY })];
      expect(tracker.filterExpired(results)).toHaveLength(1);
    });

    it("removes expired results", () => {
      const results = [makeResult({ lastVerifiedAt: NOW - NINETY_DAYS - ONE_DAY })];
      expect(tracker.filterExpired(results)).toHaveLength(0);
    });

    it("keeps some and removes others", () => {
      const results = [
        makeResult({ id: "fresh", lastVerifiedAt: NOW - ONE_DAY }),
        makeResult({ id: "expired", lastVerifiedAt: NOW - NINETY_DAYS - ONE_DAY }),
      ];
      const filtered = tracker.filterExpired(results);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe("fresh");
    });
  });

  describe("getExpiredChunkIds", () => {
    it("returns IDs of expired chunks", () => {
      const results = [
        makeResult({ id: "fresh", lastVerifiedAt: NOW - ONE_DAY }),
        makeResult({ id: "expired-1", lastVerifiedAt: NOW - NINETY_DAYS - ONE_DAY }),
        makeResult({ id: "expired-2", lastVerifiedAt: NOW - NINETY_DAYS - 2 * ONE_DAY }),
      ];
      const ids = tracker.getExpiredChunkIds(results);
      expect(ids).toEqual(["expired-1", "expired-2"]);
    });

    it("returns empty array when nothing is expired", () => {
      const results = [makeResult({ lastVerifiedAt: NOW - ONE_DAY })];
      expect(tracker.getExpiredChunkIds(results)).toEqual([]);
    });
  });

  describe("custom config", () => {
    it("respects custom TTL", () => {
      const custom = new StalenessTracker({ ttlMs: ONE_DAY }, () => NOW);
      const result = custom.assessStaleness(NOW - 2 * ONE_DAY);
      expect(result.isStale).toBe(true);
      expect(result.penalty).toBe(0.8);
    });

    it("respects custom penalties", () => {
      const custom = new StalenessTracker(
        { stalePenalty: 0.7, veryStaleMultiplier: 0.3 },
        () => NOW
      );
      const stale = custom.assessStaleness(NOW - THIRTY_DAYS - ONE_DAY);
      expect(stale.penalty).toBe(0.7);

      const veryStale = custom.assessStaleness(NOW - SIXTY_DAYS - ONE_DAY);
      expect(veryStale.penalty).toBe(0.3);
    });

    it("respects custom hard expiry", () => {
      const custom = new StalenessTracker({ hardExpiryMs: SIXTY_DAYS }, () => NOW);
      const result = custom.assessStaleness(NOW - SIXTY_DAYS - ONE_DAY);
      expect(result.isExpired).toBe(true);
    });
  });

  describe("getConfig", () => {
    it("returns a copy of the configuration", () => {
      const config = tracker.getConfig();
      expect(config.ttlMs).toBe(DEFAULT_STALENESS_CONFIG.ttlMs);
      expect(config.stalePenalty).toBe(DEFAULT_STALENESS_CONFIG.stalePenalty);
    });
  });
});
