/**
 * Talos CI GitHub Action
 *
 * Triggers a Talos test run via the REST API, polls for completion,
 * and reports results as GitHub check run annotations.
 */

import * as core from "@actions/core";

// ── Types ─────────────────────────────────────────────────────────────────────

type TalosRunResponse = {
  runId: string;
  status: string;
};

type TalosRunStatus = {
  id: string;
  status: "queued" | "running" | "passed" | "failed" | "cancelled";
  totalTests: number;
  passedTests: number;
  failedTests: number;
  results?: Array<{
    testId: string;
    testName: string;
    status: string;
    durationMs: number;
    errorMessage?: string;
  }>;
};

// ── Main ──────────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  try {
    const talosUrl = core.getInput("talos-url", { required: true });
    const appId = core.getInput("app-id", { required: true });
    const suiteId = core.getInput("suite-id");
    const apiKey = core.getInput("api-key", { required: true });
    const timeout = parseInt(core.getInput("timeout") || "300", 10);
    const failOnRegression = core.getInput("fail-on-regression") !== "false";

    core.info(`Talos CI Runner — targeting ${talosUrl}`);
    core.info(`Application: ${appId}`);
    if (suiteId) core.info(`Suite: ${suiteId}`);

    // ── Trigger test run ────────────────────────────────────────────────

    const triggerUrl = `${talosUrl}/api/talos/applications/${encodeURIComponent(appId)}/run`;
    const triggerBody: Record<string, unknown> = { trigger: "ci" };
    if (suiteId) triggerBody.suiteId = suiteId;

    const triggerResponse = await fetch(triggerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(triggerBody),
    });

    if (!triggerResponse.ok) {
      const errText = await triggerResponse.text();
      throw new Error(`Failed to trigger test run: ${triggerResponse.status} ${errText}`);
    }

    const triggerData = (await triggerResponse.json()) as TalosRunResponse;
    const runId = triggerData.runId;
    core.info(`Test run started: ${runId}`);
    core.setOutput("run-id", runId);

    // ── Poll for completion ─────────────────────────────────────────────

    const pollUrl = `${talosUrl}/api/talos/runs/${encodeURIComponent(runId)}`;
    const startTime = Date.now();
    const timeoutMs = timeout * 1000;
    const pollIntervalMs = 5000;

    let finalStatus: TalosRunStatus | undefined;

    while (Date.now() - startTime < timeoutMs) {
      const pollResponse = await fetch(pollUrl, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (!pollResponse.ok) {
        core.warning(`Poll returned ${pollResponse.status}, retrying...`);
        await sleep(pollIntervalMs);
        continue;
      }

      const statusData = (await pollResponse.json()) as TalosRunStatus;
      core.info(`Run ${runId}: status=${statusData.status}`);

      if (["passed", "failed", "cancelled"].includes(statusData.status)) {
        finalStatus = statusData;
        break;
      }

      await sleep(pollIntervalMs);
    }

    if (!finalStatus) {
      core.setFailed(`Test run timed out after ${timeout}s`);
      core.setOutput("status", "timeout");
      return;
    }

    // ── Report results ──────────────────────────────────────────────────

    core.setOutput("status", finalStatus.status);
    core.setOutput("total-tests", String(finalStatus.totalTests ?? 0));
    core.setOutput("passed-tests", String(finalStatus.passedTests ?? 0));
    core.setOutput("failed-tests", String(finalStatus.failedTests ?? 0));

    core.info(
      `Results: ${finalStatus.passedTests ?? 0} passed, ${finalStatus.failedTests ?? 0} failed out of ${finalStatus.totalTests ?? 0} total`
    );

    // Post annotations for failures
    if (finalStatus.results) {
      for (const result of finalStatus.results) {
        if (result.status === "failed" && result.errorMessage) {
          core.error(
            `Test "${result.testName}" failed: ${result.errorMessage}`,
            { title: `Talos: ${result.testName}` }
          );
        }
      }
    }

    // Determine outcome
    if (finalStatus.status === "failed" && failOnRegression) {
      core.setFailed(
        `Talos tests failed: ${finalStatus.failedTests ?? 0} failures out of ${finalStatus.totalTests ?? 0} tests`
      );
    } else if (finalStatus.status === "cancelled") {
      core.setFailed("Talos test run was cancelled");
    } else {
      core.info("All Talos tests passed!");
    }
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

run();
