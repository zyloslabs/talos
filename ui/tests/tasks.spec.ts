/**
 * E2E coverage for Tasks queue at `/tasks` (issue #543).
 */
import { test, expect } from "@playwright/test";
import { mockApi } from "./fixtures/route";
import { stubSocket } from "./fixtures/socket";
import { resetFactoryCounter } from "./fixtures/factories";
import { TasksPage } from "./pages/tasks.page";

const tasks = [
  { id: "task-1", agentId: "agent-a", prompt: "Run smoke suite", status: "pending", result: null, createdAt: "2026-04-21T12:00:00Z", updatedAt: "2026-04-21T12:00:00Z" },
  { id: "task-2", agentId: "agent-a", prompt: "Run regression suite", status: "running", result: null, createdAt: "2026-04-21T12:01:00Z", updatedAt: "2026-04-21T12:01:00Z" },
  { id: "task-3", agentId: "agent-b", prompt: "Discover application", status: "completed", result: "ok", createdAt: "2026-04-21T12:02:00Z", updatedAt: "2026-04-21T12:02:00Z" },
];

const stats = { pending: 1, running: 1, completed: 1, failed: 0 };

test.beforeEach(async ({ page }) => {
  resetFactoryCounter();
  await stubSocket(page);
  await mockApi(page, [
    { url: "**/api/admin/tasks", method: "GET", body: tasks },
    { url: /\/api\/talos\/tasks\?.*/, method: "GET", body: tasks },
    { url: "**/api/admin/tasks/stats", method: "GET", body: stats },
  ]);
});

test.describe("Tasks queue", () => {
  // AC: #543 stats bar renders pending/running/completed/failed counts
  test("stats bar renders all five counters", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    await tasksPage.goto();
    await expect(tasksPage.heading).toBeVisible();
    // The labels also appear on the tab triggers and task badges, so scope to
    // the first match (the StatsBar StatCard) for each label.
    await expect(page.getByText("Pending").first()).toBeVisible();
    await expect(page.getByText("Running").first()).toBeVisible();
    await expect(page.getByText("Completed").first()).toBeVisible();
    await expect(page.getByText("Failed").first()).toBeVisible();
    await expect(page.getByText("Total").first()).toBeVisible();
  });

  // AC: #543 tab filters narrow the list
  test("clicking Running tab shows only running tasks", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    await tasksPage.goto();
    await expect(page.getByText("Run smoke suite")).toBeVisible();
    await tasksPage.runningTab.click();
    await expect(page.getByText("Run regression suite")).toBeVisible();
    await expect(page.getByText("Run smoke suite")).not.toBeVisible();
  });

  // AC: #543 manual refresh re-fetches the list and reflects status changes.
  // The page does not subscribe to socket task:update events yet — that gap is
  // tracked in #566. Once that ships, replace this test with a real socket
  // assertion (status badge transition triggered by emitSocketEvent).
  test("Refresh button re-fetches and reflects task status changes", async ({ page }) => {
    const tasksPage = new TasksPage(page);
    await tasksPage.goto();

    // Initial state: smoke is pending, regression is running.
    await expect(page.getByText("Run smoke suite")).toBeVisible();
    await tasksPage.runningTab.click();
    await expect(page.getByText("Run regression suite")).toBeVisible();
    await expect(page.getByText("Run smoke suite")).not.toBeVisible();

    // Update the mocked GET to flip task-1 to running.
    const updatedTasks = tasks.map((t) => (t.id === "task-1" ? { ...t, status: "running" } : t));
    await mockApi(page, [
      { url: "**/api/admin/tasks", method: "GET", body: updatedTasks },
      { url: /\/api\/talos\/tasks\?.*/, method: "GET", body: updatedTasks },
      { url: "**/api/admin/tasks/stats", method: "GET", body: { pending: 0, running: 2, completed: 1, failed: 0 } },
    ]);

    await page.getByRole("button", { name: /^Refresh$/ }).click();

    // The Running tab should now show both tasks.
    await expect(page.getByText("Run smoke suite")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Run regression suite")).toBeVisible();
  });

  // AC: #543 socket emission keeps the page responsive (smoke / no-throw test)
  // The real status-transition assertion is gated on #566 (socket subscription).
  test.fixme("emitting task:update transitions the row badge (Pending #566)", async () => {
    // intentionally empty — see #566
  });
});
