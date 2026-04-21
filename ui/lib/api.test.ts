import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteVaultRole, getApplications } from "./api";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("fetchApi empty response handling", () => {
  it("resolves (does not throw) for 204 No Content responses", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(null, { status: 204, statusText: "No Content" }),
    ) as unknown as typeof fetch;

    await expect(deleteVaultRole("role-123")).resolves.toBeNull();
  });

  it("resolves for responses with content-length 0", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response("", {
        status: 200,
        headers: { "content-length": "0" },
      }),
    ) as unknown as typeof fetch;

    await expect(deleteVaultRole("role-456")).resolves.toBeNull();
  });

  it("resolves for responses with no content-type header and empty body", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response("", { status: 200 }),
    ) as unknown as typeof fetch;

    await expect(deleteVaultRole("role-789")).resolves.toBeNull();
  });

  it("still parses JSON for normal responses", async () => {
    const payload = [{ id: "app-1" }];
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ) as unknown as typeof fetch;

    await expect(getApplications()).resolves.toEqual(payload);
  });
});
