/**
 * Generation path badge surfacing on the Test Library matrix (issue #552).
 *
 * The badge is rendered by `<GenerationPathBadge>` inside `<TestCard>` in
 * `ui/components/talos/test-matrix.tsx`, driven by `test.metadata.generationPath`
 * and `test.metadata.chunkCount`. We mount `/talos/tests`, mock the tests API
 * with each generation path, and assert the badge text + `data-path` attribute.
 */
import { test, expect } from "@playwright/test";
import { mockApi } from "./fixtures/route";
import { makeApplication, makeTest, resetFactoryCounter } from "./fixtures/factories";

const app = makeApplication({ id: "app-gen-1", name: "Gen App" });

function buildTests() {
  return [
    makeTest({
      id: "t-rag",
      applicationId: app.id,
      name: "RAG-backed",
      type: "playwright",
      metadata: { generationPath: "rag-backed", chunkCount: 5 },
    }),
    makeTest({
      id: "t-raw",
      applicationId: app.id,
      name: "Raw Copilot",
      type: "playwright",
      metadata: { generationPath: "raw-copilot" },
    }),
    makeTest({
      id: "t-skel",
      applicationId: app.id,
      name: "Skeleton",
      type: "playwright",
      metadata: { generationPath: "skeleton" },
    }),
  ];
}

test.beforeEach(async ({ page }) => {
  resetFactoryCounter();
  await mockApi(page, [
    { url: "**/api/talos/applications", method: "GET", body: [app] },
    { url: "**/api/talos/tests", method: "GET", body: buildTests() },
    { url: /\/api\/talos\/tests\?.*/, method: "GET", body: buildTests() },
    { url: "**/api/talos/test-runs**", method: "GET", body: [] },
  ]);
});

test.describe("Generation path badge — Test Library", () => {
  // AC: #552 rag-backed badge text + chunk count
  test("rag-backed badge renders RAG label with chunk count", async ({ page }) => {
    await page.goto("/talos/tests");
    const badges = page.getByTestId("generation-path-badge");
    const rag = badges.filter({ has: page.locator('[data-path="rag-backed"]') }).first();
    const direct = page.locator('[data-testid="generation-path-badge"][data-path="rag-backed"]');
    await expect(direct).toBeVisible();
    await expect(direct).toContainText(/RAG/);
    await expect(direct).toContainText(/5 chunks/);
  });

  // AC: #552 raw-copilot badge
  test("raw-copilot badge renders Raw label", async ({ page }) => {
    await page.goto("/talos/tests");
    const badge = page.locator('[data-testid="generation-path-badge"][data-path="raw-copilot"]');
    await expect(badge).toBeVisible();
    await expect(badge).toContainText(/Raw/);
  });

  // AC: #552 skeleton badge
  test("skeleton badge renders Skeleton label", async ({ page }) => {
    await page.goto("/talos/tests");
    const badge = page.locator('[data-testid="generation-path-badge"][data-path="skeleton"]');
    await expect(badge).toBeVisible();
    await expect(badge).toContainText(/Skeleton/);
  });
});
