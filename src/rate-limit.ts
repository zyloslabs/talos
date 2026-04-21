/**
 * Global IP Rate Limiter (#533 / PR #534 review)
 *
 * Factory that returns an express-rate-limit middleware configured to the
 * Talos spec:
 *
 *  - Env vars: TALOS_RATE_LIMIT_WINDOW_MS (default 60_000) and
 *    TALOS_RATE_LIMIT_MAX (default 100).
 *  - 429 body shape: { error: "rate_limited", retryAfterSeconds: <n> }
 *  - `Retry-After` header is set in seconds alongside draft-7 RateLimit-* headers.
 *  - /health and /health/* are skipped so probes are never throttled.
 *
 * The module is intentionally pure so it is unit-testable without booting
 * the full Talos backend (which `src/index.ts` excludes from coverage).
 */

import rateLimit, { type Options, type RateLimitRequestHandler } from "express-rate-limit";
import type { Request, Response } from "express";

export type TalosRateLimitOptions = {
  /** Window in milliseconds. Defaults to env TALOS_RATE_LIMIT_WINDOW_MS or 60_000. */
  windowMs?: number;
  /** Max requests per IP per window. Defaults to env TALOS_RATE_LIMIT_MAX or 100. */
  max?: number;
  /**
   * Optional override for the skip function. Default skips GET /health and
   * anything under /health/ so liveness/readiness probes are never throttled.
   */
  skip?: Options["skip"];
};

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX = 100;

/** Parse a positive integer env var, falling back to `fallback` on any failure. */
export function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") return fallback;
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

/** Resolve the effective rate-limit config from options + process.env. */
export function resolveRateLimitConfig(
  options: TalosRateLimitOptions = {},
  env: NodeJS.ProcessEnv = process.env,
): { windowMs: number; max: number } {
  const windowMs =
    options.windowMs ?? parsePositiveInt(env.TALOS_RATE_LIMIT_WINDOW_MS, DEFAULT_WINDOW_MS);
  const max = options.max ?? parsePositiveInt(env.TALOS_RATE_LIMIT_MAX, DEFAULT_MAX);
  return { windowMs, max };
}

/** Default skip function: exempt /health and /health/* from the limit. */
export function defaultSkip(req: Request): boolean {
  return req.path === "/health" || req.path.startsWith("/health/");
}

/**
 * Build the 429 handler that returns the spec-compliant body and header.
 * Exported for unit testing.
 */
export function createRateLimitHandler(windowMs: number) {
  return (_req: Request, res: Response): void => {
    // express-rate-limit sets res.getHeader('RateLimit-Reset') (seconds until
    // reset for draft-7). Fall back to the full window if unavailable.
    const resetHeader = res.getHeader("RateLimit-Reset");
    const parsed = typeof resetHeader === "string" ? parseInt(resetHeader, 10) : NaN;
    const retryAfterSeconds = Number.isFinite(parsed) && parsed > 0
      ? parsed
      : Math.ceil(windowMs / 1000);
    res.setHeader("Retry-After", String(retryAfterSeconds));
    res.status(429).json({ error: "rate_limited", retryAfterSeconds });
  };
}

/**
 * Build the global rate-limit middleware. Reads env vars if not overridden
 * so the same factory can be used in prod and in unit tests.
 */
export function createTalosRateLimiter(options: TalosRateLimitOptions = {}): RateLimitRequestHandler {
  const { windowMs, max } = resolveRateLimitConfig(options);
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: options.skip ?? defaultSkip,
    handler: createRateLimitHandler(windowMs),
  });
}
