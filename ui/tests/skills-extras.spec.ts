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
    content: "Use Playwright API to draft a smoke test",
    tags: ["test", "ai"],
    enabled: true,
    requiredTools: [],
    createdAt: "2026-04-21T12:00:00Z",
    updatedAt: "2026-04-21T12:00:00Z",
  },
];

test.beforeEach(async ({ page }) => {
  resetFactoryCounter();
  await mockApi(page, [
    { url: "**/api/admin/skills", method: "GET", body: skills },
    { url: "**/api/admin/skills/templates", method: "GET", body: [] },
    { url: "**/api/admin/skill-agents/**", method: "GET", body: [] },
    { url: "**/api/admin/models", method: "GET", body: { models: [] } },
  ]);
});

test.describe("Skills — extras", () => {
  // AC: #549 skills page renders
  test("skills page renders the list", async ({ page }) => {
    await page.goto("/skills");
    await expect(page.getByText("Generate Test")).toBeVisible();
  });

  // AC: #549 execute flow drives the UI: hover card, click Run, fill input, submit
  test("execute dialog opens, accepts input, and POSTs the task", async ({ page }) => {
    let taskBody: { prompt?: string } | null = null;
    let taskCalled = false;
    await mockApi(page, [
      {
        url: "**/api/admin/tasks",
        method: "POST",
        handler: async (route) => {
          taskCalled = true;
          taskBody = JSON.parse(route.request().postData() ?? "{}");
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ id: "task-exec-1", status: "pending", prompt: taskBody?.prompt ?? "" }),
          });
        },
      },
    ]);

    await page.goto("/skills");
    const card = page.locator("div.group").filter({ hasText: "Generate Test" }).first();
    await card.hover();
    await card.getByRole("button", { name: /^Run$/ }).click();

    const dialog = page.getByRole("dialog").filter({ hasText: /Execute: Generate Test/ });
    await expect(dialog).toBeVisible();

    await dialog.getByPlaceholder(/Input for this skill/i).fill("login flow");
    await dialog.getByRole("button", { name: /^Execute$/ }).click();

    await expect.poll(() => taskCalled, { timeout: 5000 }).toBe(true);
    expect(taskBody?.prompt).toContain("Generate Test");
    expect(taskBody?.prompt).toContain("login flow");
  });

  // AC: #549 AI Enhance updates the content textarea via /api/admin/ai/enhance
  test("AI Enhance button replaces the skill content with the enhanced text", async ({ page }) => {
    let enhanceCalled = false;
    await mockApi(page, [
      {
        url: "**/api/admin/ai/enhance",
        method: "POST",
        handler: async (route) => {
          enhanceCalled = true;
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ enhanced: "Enhanced: Use Playwright API with proper waits and accessible locators" }),
          });
        },
      },
    ]);

    await page.goto("/skills");
    const card = page.locator("div.group").filter({ hasText: "Generate Test" }).first();
    await card.hover();
    await card.getByRole("button", { name: /^Edit$/ }).click();

    const dialog = page.getByRole("dialog").filter({ hasText: /Edit Skill/ });
    await expect(dialog).toBeVisible();

    const contentArea = dialog.locator("textarea").filter({ hasText: "Use Playwright API" });
    await expect(contentArea).toHaveValue(/Use Playwright API/);

    await dialog.getByRole("button", { name: /AI Enhance/i }).click();

    await expect.poll(() => enhanceCalled, { timeout: 5000 }).toBe(true);
    await expect(contentArea).toHaveValue(/Enhanced: Use Playwright API/, { timeout: 5000 });
  });
});
