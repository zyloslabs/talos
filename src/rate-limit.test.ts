/**
 * Tests for the global IP rate limiter factory (PR #534 review).
 *
 * Verifies:
 *  - env vars TALOS_RATE_LIMIT_WINDOW_MS / TALOS_RATE_LIMIT_MAX drive config
 *  - 429 body matches the spec: { error: "rate_limited", retryAfterSeconds }
 *  - `Retry-After` header is set to an integer number of seconds
 *  - /health and /health/* are exempt from throttling
 *  - trust-proxy + X-Forwarded-For keys the limiter on the real client IP
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import {
  createTalosRateLimiter,
  createRateLimitHandler,
  defaultSkip,
  parsePositiveInt,
  resolveRateLimitConfig,
} from "./rate-limit.js";

function startApp(app: express.Express): Promise<{ baseUrl: string; server: Server }> {
  return new Promise((resolve) => {
    const server = createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({ baseUrl: `http://127.0.0.1:${port}`, server });
    });
  });
}

async function stop(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

describe("parsePositiveInt", () => {
  it("returns fallback when undefined or empty", () => {
    expect(parsePositiveInt(undefined, 42)).toBe(42);
    expect(parsePositiveInt("", 42)).toBe(42);
  });

  it("returns fallback when not a positive integer", () => {
    expect(parsePositiveInt("nope", 42)).toBe(42);
    expect(parsePositiveInt("0", 42)).toBe(42);
    expect(parsePositiveInt("-5", 42)).toBe(42);
    expect(parsePositiveInt("NaN", 42)).toBe(42);
  });

  it("parses valid positive integers", () => {
    expect(parsePositiveInt("123", 42)).toBe(123);
    expect(parsePositiveInt("60000", 10)).toBe(60000);
  });
});

describe("resolveRateLimitConfig", () => {
  it("prefers explicit options over env vars", () => {
    const cfg = resolveRateLimitConfig(
      { windowMs: 5000, max: 7 },
      { TALOS_RATE_LIMIT_WINDOW_MS: "60000", TALOS_RATE_LIMIT_MAX: "100" },
    );
    expect(cfg).toEqual({ windowMs: 5000, max: 7 });
  });

  it("reads TALOS_RATE_LIMIT_* env vars when options omitted", () => {
    const cfg = resolveRateLimitConfig(
      {},
      { TALOS_RATE_LIMIT_WINDOW_MS: "30000", TALOS_RATE_LIMIT_MAX: "50" },
    );
    expect(cfg).toEqual({ windowMs: 30000, max: 50 });
  });

  it("falls back to defaults when env vars missing", () => {
    const cfg = resolveRateLimitConfig({}, {});
    expect(cfg).toEqual({ windowMs: 60_000, max: 100 });
  });

  it("ignores legacy unprefixed env vars", () => {
    // Reviewer flagged the old names (RATE_LIMIT_*) — those MUST NOT be read.
    const cfg = resolveRateLimitConfig(
      {},
      { RATE_LIMIT_WINDOW_MS: "1", RATE_LIMIT_MAX: "1" },
    );
    expect(cfg).toEqual({ windowMs: 60_000, max: 100 });
  });
});

describe("defaultSkip", () => {
  it("skips /health and /health/* paths", () => {
    expect(defaultSkip({ path: "/health" } as express.Request)).toBe(true);
    expect(defaultSkip({ path: "/health/ready" } as express.Request)).toBe(true);
    expect(defaultSkip({ path: "/healthz" } as express.Request)).toBe(false);
    expect(defaultSkip({ path: "/api/talos/applications" } as express.Request)).toBe(false);
  });
});

describe("createRateLimitHandler", () => {
  it("writes spec-compliant 429 body and Retry-After header", () => {
    const handler = createRateLimitHandler(60_000);
    const headers = new Map<string, string>();
    const res = {
      getHeader: (name: string) => headers.get(name),
      setHeader: (name: string, value: unknown) => {
        headers.set(name, String(value));
      },
      status: function (code: number) {
        (this as { _status?: number })._status = code;
        return this;
      },
      json: function (body: unknown) {
        (this as { _body?: unknown })._body = body;
      },
    } as unknown as express.Response;

    handler({} as express.Request, res);

    const captured = res as unknown as { _status: number; _body: { error: string; retryAfterSeconds: number } };
    expect(captured._status).toBe(429);
    expect(captured._body).toEqual({ error: "rate_limited", retryAfterSeconds: 60 });
    expect(headers.get("Retry-After")).toBe("60");
  });

  it("prefers RateLimit-Reset header for retryAfterSeconds when set", () => {
    const handler = createRateLimitHandler(60_000);
    const headers = new Map<string, string>([["RateLimit-Reset", "17"]]);
    const res = {
      getHeader: (name: string) => headers.get(name),
      setHeader: (name: string, value: unknown) => {
        headers.set(name, String(value));
      },
      status: function () { return this; },
      json: function (body: unknown) {
        (this as { _body?: unknown })._body = body;
      },
    } as unknown as express.Response;

    handler({} as express.Request, res);

    const captured = res as unknown as { _body: { retryAfterSeconds: number } };
    expect(captured._body.retryAfterSeconds).toBe(17);
    expect(headers.get("Retry-After")).toBe("17");
  });
});

describe("createTalosRateLimiter — integration", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.TALOS_RATE_LIMIT_WINDOW_MS;
    delete process.env.TALOS_RATE_LIMIT_MAX;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns 429 with spec body after exceeding max", async () => {
    const app = express();
    app.use(createTalosRateLimiter({ windowMs: 60_000, max: 2 }));
    app.get("/api/thing", (_req, res) => res.json({ ok: true }));
    app.get("/health", (_req, res) => res.json({ status: "ok" }));

    const { baseUrl, server } = await startApp(app);
    try {
      // First 2 requests succeed
      const r1 = await fetch(`${baseUrl}/api/thing`);
      const r2 = await fetch(`${baseUrl}/api/thing`);
      expect(r1.status).toBe(200);
      expect(r2.status).toBe(200);

      // Third is throttled with spec-compliant body
      const r3 = await fetch(`${baseUrl}/api/thing`);
      expect(r3.status).toBe(429);
      const retryAfter = r3.headers.get("retry-after");
      expect(retryAfter).not.toBeNull();
      expect(Number(retryAfter)).toBeGreaterThan(0);
      const body = (await r3.json()) as { error: string; retryAfterSeconds: number };
      expect(body).toMatchObject({ error: "rate_limited" });
      expect(typeof body.retryAfterSeconds).toBe("number");
      expect(body.retryAfterSeconds).toBeGreaterThan(0);
    } finally {
      await stop(server);
    }
  });

  it("exempts /health and /health/* from throttling", async () => {
    const app = express();
    app.use(createTalosRateLimiter({ windowMs: 60_000, max: 1 }));
    app.get("/health", (_req, res) => res.json({ status: "ok" }));
    app.get("/health/ready", (_req, res) => res.json({ status: "ready" }));
    app.get("/api/thing", (_req, res) => res.json({ ok: true }));

    const { baseUrl, server } = await startApp(app);
    try {
      // Burn the budget with a throttled route first so subsequent
      // throttled calls would 429
      await fetch(`${baseUrl}/api/thing`);
      const blocked = await fetch(`${baseUrl}/api/thing`);
      expect(blocked.status).toBe(429);

      // Health endpoints must keep returning 200 no matter how many hits
      for (let i = 0; i < 10; i += 1) {
        const h = await fetch(`${baseUrl}/health`);
        const hReady = await fetch(`${baseUrl}/health/ready`);
        expect(h.status).toBe(200);
        expect(hReady.status).toBe(200);
      }
    } finally {
      await stop(server);
    }
  });

  it("keys the limiter on X-Forwarded-For when trust proxy is set", async () => {
    const app = express();
    app.set("trust proxy", "loopback"); // trust 127.0.0.1
    app.use(createTalosRateLimiter({ windowMs: 60_000, max: 1 }));
    app.get("/api/thing", (_req, res) => res.json({ ok: true }));

    const { baseUrl, server } = await startApp(app);
    try {
      // Client A burns its budget
      const a1 = await fetch(`${baseUrl}/api/thing`, {
        headers: { "X-Forwarded-For": "10.0.0.1" },
      });
      const a2 = await fetch(`${baseUrl}/api/thing`, {
        headers: { "X-Forwarded-For": "10.0.0.1" },
      });
      expect(a1.status).toBe(200);
      expect(a2.status).toBe(429);

      // Client B, behind the same proxy, is tracked independently
      const b1 = await fetch(`${baseUrl}/api/thing`, {
        headers: { "X-Forwarded-For": "10.0.0.2" },
      });
      expect(b1.status).toBe(200);
    } finally {
      await stop(server);
    }
  });
});
