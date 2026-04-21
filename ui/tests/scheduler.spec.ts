/**
 * E2E coverage for Scheduler at `/scheduler` (issue #546).
 */
import { test, expect } from "@playwright/test";
import { mockApi } from "./fixtures/route";
import { resetFactoryCounter } from "./fixtures/factories";
import { SchedulerPage } from "./pages/scheduler.page";

const jobs = [
  {
    id: "job-1",
    name: "Nightly Smoke",
    cronExpression: "0 2 * * *",
    enabled: true,
    prompt: "Run all smoke tests",
    nextRunAt: new Date(Date.now() + 60_000).toISOString(),
    lastRunAt: new Date(Date.now() - 60_000).toISOString(),
  },
  {
    id: "job-2",
    name: "Hourly Health",
    cronExpression: "0 * * * *",
    enabled: false,
    prompt: "Health probe",
    nextRunAt: null,
    lastRunAt: null,
  },
];

test.beforeEach(async ({ page }) => {
  resetFactoryCounter();
  await mockApi(page, [
    { url: "**/api/admin/scheduler/jobs", method: "GET", body: jobs },
    { url: "**/api/admin/scheduler/jobs", method: "GET", body: jobs },
  ]);
});

test.describe("Scheduler", () => {
  // AC: #546 list renders schedules
  test("renders job list", async ({ page }) => {
    const sched = new SchedulerPage(page);
    await sched.goto();
    await expect(sched.heading).toBeVisible();
    await expect(page.getByRole("heading", { name: "Nightly Smoke" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Hourly Health" })).toBeVisible();
  });

  // AC: #546 cron expression visible per row
  test("each row shows cron expression and prompt", async ({ page }) => {
    const sched = new SchedulerPage(page);
    await sched.goto();
    await expect(page.getByText("0 2 * * *")).toBeVisible();
    await expect(page.getByText("Run all smoke tests")).toBeVisible();
  });

  // AC: #546 new job button opens dialog
  test("new job button opens dialog", async ({ page }) => {
    const sched = new SchedulerPage(page);
    await sched.goto();
    await sched.newJobButton.click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

});
