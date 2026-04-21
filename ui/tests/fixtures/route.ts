/**
 * Type-checked `page.route` wrapper (epic #537 / sub-issue #541).
 *
 * `mockApi(page, routes)` registers a list of route handlers in one call.
 * Each entry binds a URL pattern + HTTP method to a JSON response or a custom
 * handler. Patterns use Playwright glob syntax (e.g. `**\/api/talos/tests`).
 */
import type { Page, Route } from "@playwright/test";

export type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiRouteSpec<TResponse = unknown> {
  url: string | RegExp;
  /** HTTP method, defaults to GET. Use "*" to match any method. */
  method?: ApiMethod | "*";
  /** Status code, defaults to 200. */
  status?: number;
  /** JSON body, omit for empty body. */
  body?: TResponse;
  /** Custom handler — wins over body when both are set. */
  handler?: (route: Route) => Promise<void> | void;
  /** Optional Content-Type, defaults to application/json. */
  contentType?: string;
  /** Extra headers. */
  headers?: Record<string, string>;
}

export async function mockApi(page: Page, specs: ApiRouteSpec[]): Promise<void> {
  for (const spec of specs) {
    await page.route(spec.url, async (route) => {
      const method = spec.method ?? "GET";
      // When the request method does not match the spec, fall back so a later
      // route handler can match. NOTE: if no other handler matches, the
      // request is forwarded to the live network — when running against a
      // real server this can leak GET/PUT/PATCH calls. Tests that pin a
      // single method should also register a catch-all (e.g. `method: "*"`)
      // for the same URL pattern, or rely on the in-memory test transport.
      if (method !== "*" && route.request().method() !== method) {
        return route.fallback();
      }
      if (spec.handler) {
        await spec.handler(route);
        return;
      }
      await route.fulfill({
        status: spec.status ?? 200,
        contentType: spec.contentType ?? "application/json",
        headers: spec.headers,
        body: spec.body === undefined ? "" : JSON.stringify(spec.body),
      });
    });
  }
}

/**
 * Convenience: returns a `page.route` handler that responds with the given
 * JSON body and status. Use directly with `page.route` when the URL needs
 * per-test customization.
 */
export function jsonResponse<T>(body: T, status = 200) {
  return (route: Route) =>
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
}
