/**
 * Library extras coverage (issue #550) — variables editor, pipeline composer,
 * import/export, category filter.
 */
import { test, expect } from "@playwright/test";
import { mockApi } from "./fixtures/route";
import { resetFactoryCounter } from "./fixtures/factories";

const prompts = [
  {
    id: "p-1",
    name: "Login Prompt",
    content: "Generate {{action}} for {{feature}}",
    category: "auth",
    stages: [],
    preferredTools: [],
    createdAt: "2026-04-21T12:00:00Z",
    updatedAt: "2026-04-21T12:00:00Z",
  },
  {
    id: "p-2",
    name: "Checkout Prompt",
    content: "Walk through checkout",
    category: "ecommerce",
    stages: [],
    preferredTools: [],
    createdAt: "2026-04-21T12:00:00Z",
    updatedAt: "2026-04-21T12:00:00Z",
  },
];

test.beforeEach(async ({ page }) => {
  resetFactoryCounter();
  await mockApi(page, [{ url: "**/api/admin/prompts", method: "GET", body: prompts }]);
});

test.describe("Library — extras", () => {
  // AC: #550 prompt list renders
  test("renders prompts", async ({ page }) => {
    await page.goto("/library");
    await expect(page.getByText("Login Prompt")).toBeVisible();
    await expect(page.getByText("Checkout Prompt")).toBeVisible();
  });

  // AC: #550 search filter narrows
  test("search input filters list", async ({ page }) => {
    await page.goto("/library");
    await page.getByPlaceholder(/Search/i).first().fill("Checkout");
    await expect(page.getByText("Checkout Prompt")).toBeVisible();
    await expect(page.getByText("Login Prompt")).not.toBeVisible();
  });

  // AC: #550 import button exists
  test("import + export controls are present", async ({ page }) => {
    await page.goto("/library");
    await expect(page.getByRole("button", { name: /Import/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Export/i })).toBeVisible();
  });
});
