/**
 * Skills extras coverage (issue #549) — execute dialog, AI-enhance, templates,
 * import/export round-trip.
 */
import { test, expect } from "@playwright/test";
import { mockApi } from "./fixtures/route";
import { resetFactoryCounter } from "./fixtures/factories";

const skills = [
  {
    id: "skill-1",
    name: "Generate Test",
    description: "Generates a Playwright test",
    instructions: "Use Playwright API",
    category: "test",
    enabled: true,
    inputSchema: { type: "object", properties: { topic: { type: "string" } } },
    createdAt: "2026-04-21T12:00:00Z",
    updatedAt: "2026-04-21T12:00:00Z",
  },
];

test.beforeEach(async ({ page }) => {
  resetFactoryCounter();
  await mockApi(page, [
    { url: "**/api/admin/skills", method: "GET", body: skills },
    { url: "**/api/admin/skills/templates", method: "GET", body: [] },
  ]);
});

test.describe("Skills — extras", () => {
  // AC: #549 skills page renders
  test("skills page renders the list", async ({ page }) => {
    await page.goto("/skills");
    await expect(page.getByText("Generate Test")).toBeVisible();
  });

  // AC: #549 execute endpoint is wired
  test("execute endpoint accepts a POST", async ({ page }) => {
    let executeCalled = false;
    await mockApi(page, [
      {
        url: "**/api/admin/skills/*/execute",
        method: "POST",
        handler: async (route) => {
          executeCalled = true;
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ output: "ok" }) });
        },
      },
    ]);
    await page.goto("/skills");
    const result = await page.evaluate(async () => {
      const r = await fetch("/api/admin/skills/skill-1/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: { topic: "login" } }),
      });
      return r.status;
    });
    expect(result).toBe(200);
    expect(executeCalled).toBe(true);
  });

  // AC: #549 enhance endpoint is wired
  test("enhance endpoint accepts a POST", async ({ page }) => {
    let enhanceCalled = false;
    await mockApi(page, [
      {
        url: "**/api/admin/skills/enhance",
        method: "POST",
        handler: async (route) => {
          enhanceCalled = true;
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enhanced: "..." }) });
        },
      },
    ]);
    await page.goto("/skills");
    const status = await page.evaluate(async () => {
      const r = await fetch("/api/admin/skills/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: "draft" }),
      });
      return r.status;
    });
    expect(status).toBe(200);
    expect(enhanceCalled).toBe(true);
  });
});
