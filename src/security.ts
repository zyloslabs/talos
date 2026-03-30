/**
 * Security utilities — URL validation, input sanitization, and rate limiting.
 */

// ── URL Validation (SSRF Protection) ──────────────────────────────────────────

/** Private/internal IPv4 CIDR ranges that must be blocked for SSRF protection. */
const BLOCKED_IPV4_RANGES: Array<{ network: number; mask: number }> = [
  { network: 0x7f000000, mask: 0xff000000 }, // 127.0.0.0/8    (loopback)
  { network: 0x0a000000, mask: 0xff000000 }, // 10.0.0.0/8     (private)
  { network: 0xac100000, mask: 0xfff00000 }, // 172.16.0.0/12  (private)
  { network: 0xc0a80000, mask: 0xffff0000 }, // 192.168.0.0/16 (private)
  { network: 0xa9fe0000, mask: 0xffff0000 }, // 169.254.0.0/16 (link-local)
  { network: 0x00000000, mask: 0xff000000 }, // 0.0.0.0/8      (unspecified)
];

/** Parse a dotted-quad IPv4 address to a 32-bit integer.  Returns NaN for non-IPv4 strings. */
function ipv4ToInt(ip: string): number {
  const parts = ip.split(".");
  if (parts.length !== 4) return NaN;
  let result = 0;
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return NaN;
    result = (result << 8) | n;
  }
  return result >>> 0; // unsigned
}

/** Returns true when the hostname looks like a private/internal IPv4 address. */
export function isPrivateIp(hostname: string): boolean {
  // Strip IPv6 brackets if present
  const bare = hostname.replace(/^\[|\]$/g, "");

  // Block IPv6 loopback
  if (bare === "::1" || bare === "0:0:0:0:0:0:0:1") return true;

  const ip = ipv4ToInt(bare);
  if (Number.isNaN(ip)) return false; // Not a numeric IPv4 — DNS hostname, will be checked separately

  for (const range of BLOCKED_IPV4_RANGES) {
    if ((ip & range.mask) >>> 0 === range.network) return true;
  }
  return false;
}

export interface ValidateUrlOptions {
  /** Allow plain HTTP for localhost in development mode (default: false). */
  allowLocalhostHttp?: boolean;
}

/**
 * Validate a URL intended for server-side fetch to an external service.
 *
 * Rejects:
 *  - Non-HTTPS schemes (HTTP allowed for localhost only when `allowLocalhostHttp` is set)
 *  - Hostnames that resolve to private/internal IP ranges
 *  - URLs with credentials embedded (`user:pass@host`)
 *
 * @returns The parsed URL on success.
 * @throws  Error describing the validation failure.
 */
export function validateExternalUrl(raw: string, opts: ValidateUrlOptions = {}): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid URL format");
  }

  // Block embedded credentials
  if (url.username || url.password) {
    throw new Error("URLs with embedded credentials are not allowed");
  }

  // Protocol check
  const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
  if (url.protocol === "http:") {
    if (!(opts.allowLocalhostHttp && isLocalhost)) {
      throw new Error("Only HTTPS URLs are allowed");
    }
  } else if (url.protocol !== "https:") {
    throw new Error("Only HTTPS URLs are allowed");
  }

  // Private IP range check
  if (isPrivateIp(url.hostname)) {
    throw new Error("URLs pointing to private/internal networks are not allowed");
  }

  return url;
}

// ── JQL Input Validation ──────────────────────────────────────────────────────

/** Jira project keys: start with a letter, followed by letters/digits/underscores, 2-10 chars. */
const JIRA_PROJECT_KEY_RE = /^[A-Z][A-Z0-9_]+$/;

/**
 * Validate that a string looks like a legitimate Jira project key.
 * Prevents JQL injection by rejecting anything that isn't `^[A-Z][A-Z0-9_]+$`.
 */
export function isValidJiraProjectKey(key: string): boolean {
  return JIRA_PROJECT_KEY_RE.test(key);
}

// ── Simple In-Memory Rate Limiter ─────────────────────────────────────────────

/**
 * A simple per-key cooldown rate limiter.
 * Tracks the last invocation timestamp per key and enforces a minimum interval.
 */
export class RateLimiter {
  private readonly lastCall = new Map<string, number>();
  private readonly cooldownMs: number;

  constructor(cooldownMs: number) {
    this.cooldownMs = cooldownMs;
  }

  /**
   * Check whether the given key is currently rate-limited.
   * If NOT limited, records the current time and returns `{ limited: false }`.
   * If limited, returns `{ limited: true, retryAfterMs }`.
   */
  check(key: string): { limited: false } | { limited: true; retryAfterMs: number } {
    const now = Date.now();
    const last = this.lastCall.get(key);
    if (last !== undefined) {
      const elapsed = now - last;
      if (elapsed < this.cooldownMs) {
        return { limited: true, retryAfterMs: this.cooldownMs - elapsed };
      }
    }
    this.lastCall.set(key, now);
    return { limited: false };
  }

  /** Reset tracking for a key (useful in tests). */
  reset(key: string): void {
    this.lastCall.delete(key);
  }
}
