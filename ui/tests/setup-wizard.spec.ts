/**
 * E2E tests for the Setup Wizard.
 *
 * PR #425 — Setup Wizard Bug Fixes (Epic #412):
 *   #413 – Skip button consistent outline styling on ALL steps
 *   #414 – Multi-file upload race condition: Continue stays disabled mid-flight
 *   #415 – Upload Docs smart Continue button label
 *   #416 – Generate Tests step "Go to Test Library" CTA
 *   #417 – Register App form validation
 *   #419 – Discovery Socket.IO state transitions
 *
 * PR #433 — Pipeline Integration (Epic #426):
 *   #431 – Discovery indexes into RAG vector store (discovery flow still works)
 */

import { test, expect, type Page } from "@playwright/test";
import { SetupWizardPage } from "./pages/setup-wizard.page";

// ── Constants ─────────────────────────────────────────────────────────────────

const APP_ID = "wizard-e2e-app";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Mock the base Applications API for all tests. */
async function mockAppsApi(page: Page) {
  await page.route("**/api/talos/applications", (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: APP_ID,
          name: "E2E Test App",
          status: "active",
          repositoryUrl: "https://github.com/test/repo",
          baseUrl: "https://test.example.com",
        }),
      });
    }
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    }
    return route.continue();
  });
}

/** Mock all step-specific APIs so navigation to any step doesn't break. */
async function mockAllStepApis(page: Page) {
  // Data Sources
  await page.route(`**/api/talos/applications/${APP_ID}/data-sources`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) })
  );

  // Atlassian config (404 = not yet configured)
  await page.route(`**/api/talos/applications/${APP_ID}/atlassian`, (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Not found" }) })
  );

  // M365 status
  await page.route("**/api/talos/m365/status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "disabled", message: "M365 not configured" }),
    })
  );

  // Vault roles
  await page.route("**/api/talos/vault-roles**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) })
  );

  // Criteria (all queries)
  await page.route(`**/api/talos/criteria/${APP_ID}**`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ criteria: [] }) })
  );

  // Traceability
  await page.route(`**/api/talos/criteria/traceability/${APP_ID}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        totalRequirements: 5,
        coveredRequirements: 3,
        totalCriteria: 3,
        implementedCriteria: 2,
        coveragePercentage: 60,
        unmappedRequirements: [],
        untestedCriteria: [],
      }),
    })
  );

  // Discover (default — override per-test for discovery tests)
  await page.route(`**/api/talos/applications/${APP_ID}/discover`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ jobId: "default-job-id" }),
    })
  );
}

/**
 * Install a selective WebSocket mock that intercepts only Socket.IO connections
 * (URLs containing /socket.io/) and replays the EIO4 handshake immediately.
 * Non-Socket.IO connections (e.g. Next.js HMR) pass through to the real browser
 * WebSocket so the dev-server overlay and hot-reload keep working.
 *
 * Tests call window.__emitSocketEvent(event, data) via page.evaluate() to
 * simulate server-side Socket.IO events.
 */
async function setupSocketMock(page: Page) {
  await page.addInitScript(`
    (function () {
      var OriginalWS = window.WebSocket;
      var listeners = { open: [], message: [], close: [], error: [] };
      var _onopen = null, _onmessage = null, _onclose = null, _onerror = null;

      function fire(type, evt) {
        var direct = { open: _onopen, message: _onmessage, close: _onclose, error: _onerror }[type];
        if (direct) direct.call(null, evt);
        (listeners[type] || []).forEach(function(h) {
          typeof h === 'function' ? h(evt) : h.handleEvent(evt);
        });
      }

      var mockWS = {
        readyState: 1, url: '', protocol: '', bufferedAmount: 0, binaryType: 'arraybuffer',
        get onopen() { return _onopen; }, set onopen(h) { _onopen = h; },
        get onmessage() { return _onmessage; }, set onmessage(h) { _onmessage = h; },
        get onclose() { return _onclose; }, set onclose(h) { _onclose = h; },
        get onerror() { return _onerror; }, set onerror(h) { _onerror = h; },
        addEventListener: function(t, h) { (listeners[t] = listeners[t] || []).push(h); },
        removeEventListener: function(t, h) {
          listeners[t] = (listeners[t] || []).filter(function(x) { return x !== h; });
        },
        send: function() {},
        close: function() { mockWS.readyState = 3; },
        _receiveEvent: function(event, data) {
          var msg = new MessageEvent('message', { data: '42' + JSON.stringify([event, data]) });
          fire('message', msg);
        }
      };

      function MockWS(url) {
        // Pass non-Socket.IO connections (e.g. Next.js HMR) to the real WebSocket
        if (!url || !url.includes('/socket.io/')) {
          return new OriginalWS(url);
        }
        mockWS.readyState = 1;
        mockWS.url = url;
        window.__mockWS = mockWS;

        // Simulate EIO4 handshake after 'connection'
        setTimeout(function() { fire('open', new Event('open')); }, 10);
        setTimeout(function() {
          fire('message', new MessageEvent('message', {
            data: '0{"sid":"e2e","upgrades":[],"pingInterval":25000,"pingTimeout":5000,"maxPayload":1000000}'
          }));
          fire('message', new MessageEvent('message', { data: '40{"sid":"e2e"}' }));
        }, 20);

        return mockWS;
      }
      MockWS.CONNECTING = 0; MockWS.OPEN = 1; MockWS.CLOSING = 2; MockWS.CLOSED = 3;
      MockWS.prototype = {};

      window.WebSocket = MockWS;
      window.__emitSocketEvent = function(event, data) {
        if (window.__mockWS) window.__mockWS._receiveEvent(event, data);
      };
    })();
  `);
}

/** Emit a Socket.IO event from Node.js test code into the browser. */
async function emitSocketEvent(page: Page, event: string, data: unknown) {
  await page.evaluate(
    ({ ev, payload }) => {
      (window as Window & { __emitSocketEvent?: (e: string, d: unknown) => void }).__emitSocketEvent?.(ev, payload);
    },
    { ev: event, payload: data }
  );
}

// ── #417: Register App Validation ─────────────────────────────────────────────

test.describe("Register App Validation (#417)", () => {
  let wizard: SetupWizardPage;

  test.beforeEach(async ({ page }) => {
    wizard = new SetupWizardPage(page);
    await mockAppsApi(page);
    await wizard.goto();
  });

  // AC: "Create Application" button is disabled until name, repositoryUrl, AND baseUrl are all non-empty

  test("should disable Create Application when all fields are empty", async () => {
    await expect(wizard.createAppButton).toBeDisabled();
  });

  test("should disable Create Application with name only", async () => {
    await wizard.nameInput.fill("My App");
    await expect(wizard.createAppButton).toBeDisabled();
  });

  test("should disable Create Application with name and repositoryUrl but no baseUrl", async () => {
    await wizard.nameInput.fill("My App");
    await wizard.repoUrlInput.fill("https://github.com/test/repo");
    await expect(wizard.createAppButton).toBeDisabled();
  });

  test("should enable Create Application when all three required fields are filled", async () => {
    await wizard.nameInput.fill("My App");
    await wizard.repoUrlInput.fill("https://github.com/test/repo");
    await wizard.baseUrlInput.fill("https://staging.example.com");
    await expect(wizard.createAppButton).toBeEnabled();
  });

  // AC: repositoryUrl shows inline error if it doesn't start with http:// or https://

  test("should show inline error for repositoryUrl missing https scheme", async ({ page }) => {
    await wizard.repoUrlInput.fill("github.com/test/repo");
    await expect(page.getByText("Must start with http:// or https://")).toBeVisible();
  });

  // AC: baseUrl shows inline error if it doesn't start with http:// or https://

  test("should show inline error for baseUrl missing https scheme", async ({ page }) => {
    await wizard.baseUrlInput.fill("staging.example.com");
    await expect(page.getByText("Must start with http:// or https://")).toBeVisible();
  });

  // AC: API errors (400) are shown inline below the button, not swallowed silently

  test("should display inline API error when server returns 400", async ({ page }) => {
    // Override with a 400 response
    await page.route("**/api/talos/applications", (route) => {
      if (route.request().method() === "POST") {
        return route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: "Application name already exists" }),
        });
      }
      return route.continue();
    });

    await wizard.nameInput.fill("Duplicate App");
    await wizard.repoUrlInput.fill("https://github.com/test/repo");
    await wizard.baseUrlInput.fill("https://staging.example.com");
    await wizard.createAppButton.click();

    // fetchApi throws "API error: {status} {statusText}" — verify the error
    // banner appears inline (error is shown, not swallowed silently)
    await expect(page.getByText(/API error: 400/)).toBeVisible();
  });
});

// ── #413: Skip Button Consistent Styling ──────────────────────────────────────

test.describe("Skip Button Consistent Styling (#413)", () => {
  const SKIPPABLE_STEPS = [
    { stepName: "Data Sources", progressLabel: /Data Sources/ },
    { stepName: "Atlassian", progressLabel: /Atlassian/ },
    { stepName: "Upload Docs", progressLabel: /Upload Docs/ },
    { stepName: "Vault Roles", progressLabel: /Vault Roles/ },
    { stepName: "Discovery", progressLabel: /Discovery/ },
    { stepName: "Generate Criteria", progressLabel: /Generate Criteria/ },
    { stepName: "Review Criteria", progressLabel: /Review Criteria/ },
  ] as const;

  for (const { stepName, progressLabel } of SKIPPABLE_STEPS) {
    test(`Skip button on "${stepName}" step should use outline (not destructive) styling`, async ({ page }) => {
      const wizard = new SetupWizardPage(page);
      await mockAppsApi(page);
      await mockAllStepApis(page);
      await wizard.goto();

      // Register the app to unlock progress-bar navigation
      await wizard.registerApp();

      // Jump to the target step via the progress bar
      await wizard.goToStep(progressLabel);

      // The global nav Skip button should be visible and NOT use destructive styling
      const skipBtn = wizard.skipNavButton;
      await expect(skipBtn).toBeVisible();
      await expect(skipBtn).not.toHaveClass(/bg-destructive/);
      // Outline buttons carry a `border` utility class
      await expect(skipBtn).toHaveClass(/border/);
    });
  }
});

// ── #415: Upload Docs Smart Continue Button ───────────────────────────────────

test.describe("Upload Docs Smart Continue Button (#415)", () => {
  /** Navigate to the Upload Docs step, mocking all needed APIs first. */
  async function goToUploadDocsStep(page: Page): Promise<SetupWizardPage> {
    const wizard = new SetupWizardPage(page);
    await mockAppsApi(page);
    await mockAllStepApis(page);
    await wizard.goto();
    await wizard.registerApp();
    await wizard.goToStep(/Upload Docs/);
    await expect(page.getByRole("heading", { name: "Upload Docs" })).toBeVisible();
    return wizard;
  }

  // AC: "Skip This Step →" label when 0 files uploaded

  test('should show "Skip This Step →" when no files have been uploaded', async ({ page }) => {
    const wizard = await goToUploadDocsStep(page);
    await expect(wizard.uploadContinueButton).toBeVisible();
    await expect(wizard.uploadContinueButton).toHaveText(/Skip This Step/);
  });

  // AC: "Continue (N file(s) uploaded)" when N files done

  test('should show "Continue (N file(s) uploaded)" after files finish ingesting', async ({ page }) => {
    await page.route(`**/api/talos/applications/${APP_ID}/ingest`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ chunksCreated: 7, chunksSkipped: 0, totalTokens: 200, docId: "doc-1" }),
      })
    );
    const wizard = await goToUploadDocsStep(page);

    await wizard.fileInput.setInputFiles([
      { name: "requirements.md", mimeType: "text/markdown", buffer: Buffer.from("# Requirements") },
    ]);

    // Wait for the file status to show "done" (chunks badge appears)
    await expect(page.getByText(/7 chunks/)).toBeVisible();

    // Continue button should now reflect the count
    await expect(wizard.uploadContinueButton).toHaveText(/Continue \(1 file/);
  });

  // AC: Disabled with spinner while files are ingesting

  test("should show disabled Uploading… state while files are ingesting", async ({ page }) => {
    // Hold the ingest response to keep the file in "ingesting" state
    let resolveIngest: (() => void) | null = null;
    const ingestHold = new Promise<void>((resolve) => {
      resolveIngest = resolve;
    });

    await page.route(`**/api/talos/applications/${APP_ID}/ingest`, async (route) => {
      await ingestHold;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ chunksCreated: 3, chunksSkipped: 0, totalTokens: 100, docId: "doc-1" }),
      });
    });

    const wizard = await goToUploadDocsStep(page);

    await wizard.fileInput.setInputFiles([
      { name: "spec.md", mimeType: "text/markdown", buffer: Buffer.from("# Spec") },
    ]);

    // While the ingest request is in-flight, the button shows "Uploading…" and is disabled
    await expect(wizard.uploadContinueButton).toHaveText(/Uploading/);
    await expect(wizard.uploadContinueButton).toBeDisabled();

    // Unblock the request so Playwright can clean up cleanly
    resolveIngest!();
  });
});

// ── #414: Multi-file Upload Race Condition ────────────────────────────────────

test.describe("Multi-file Upload Race Condition (#414)", () => {
  // AC: Continue/Skip button stays disabled while ANY file is still ingesting

  test("should keep Continue disabled when one file is done but another is still ingesting", async ({ page }) => {
    const wizard = new SetupWizardPage(page);
    await mockAppsApi(page);
    await mockAllStepApis(page);
    await wizard.goto();
    await wizard.registerApp();
    await wizard.goToStep(/Upload Docs/);
    await expect(page.getByRole("heading", { name: "Upload Docs" })).toBeVisible();

    // file1.md resolves immediately; file2.md is held indefinitely
    let resolveFile2: (() => void) | null = null;
    const file2Hold = new Promise<void>((resolve) => {
      resolveFile2 = resolve;
    });

    await page.route(`**/api/talos/applications/${APP_ID}/ingest`, async (route) => {
      const body = route.request().postDataJSON() as { fileName?: string };
      if (body.fileName === "file2.md") {
        await file2Hold;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ chunksCreated: 4, chunksSkipped: 0, totalTokens: 150, docId: "doc-x" }),
      });
    });

    // Upload both files simultaneously
    await wizard.fileInput.setInputFiles([
      { name: "file1.md", mimeType: "text/markdown", buffer: Buffer.from("# File 1") },
      { name: "file2.md", mimeType: "text/markdown", buffer: Buffer.from("# File 2") },
    ]);

    // Wait for file1 to complete (chunk badge appears in the file list)
    await expect(page.getByText(/4 chunks/)).toBeVisible();

    // Continue button must still be disabled because file2 is still in-flight
    await expect(wizard.uploadContinueButton).toBeDisabled();

    // Clean up: release file2 so the page request resolves before test teardown
    resolveFile2!();
  });
});

// ── #419: Discovery Socket.IO State Transitions ───────────────────────────────

test.describe("Discovery Socket.IO State Transitions (#419)", () => {
  const JOB_ID = "discovery-job-e2e-001";

  async function goToDiscoveryStep(page: Page): Promise<SetupWizardPage> {
    const wizard = new SetupWizardPage(page);
    await setupSocketMock(page);
    await mockAppsApi(page);
    await mockAllStepApis(page);

    // Override discover to return a known jobId
    await page.route(`**/api/talos/applications/${APP_ID}/discover`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ jobId: JOB_ID }),
      })
    );

    await wizard.goto();
    await wizard.registerApp();
    await wizard.goToStep(/Discovery/);
    await expect(page.getByRole("heading", { name: "Discovery" })).toBeVisible();

    // Wait for the socket mock to complete its EIO4 handshake (~30ms timers)
    await page.waitForTimeout(50);

    return wizard;
  }

  // AC: After clicking "Start Discovery", the UI shows "Discovery in progress..."
  // (based on HTTP 200 + jobId received), not "Discovery complete"

  test('should show "Discovery in progress…" after Start Discovery click and API 200', async ({ page }) => {
    const wizard = await goToDiscoveryStep(page);

    await wizard.startDiscoveryButton.click();

    await expect(page.getByText(/Discovery in progress/)).toBeVisible();
    await expect(page.getByText(/Discovery complete/)).not.toBeVisible();
  });

  // AC: "Discovery complete" only appears after discovery:complete Socket.IO event

  test("should show Discovery complete only after discovery:complete socket event", async ({ page }) => {
    const wizard = await goToDiscoveryStep(page);
    await wizard.startDiscoveryButton.click();

    // Verify still in-progress before the event
    await expect(page.getByText(/Discovery in progress/)).toBeVisible();

    // Emit the completion event
    await emitSocketEvent(page, "discovery:complete", {
      jobId: JOB_ID,
      filesDiscovered: 42,
      chunksCreated: 287,
    });

    await expect(page.getByText(/Discovery complete/)).toBeVisible();
    await expect(page.getByText(/42 files indexed/)).toBeVisible();
  });

  // AC: Real progress message (files/chunks count) is shown when discovery:progress fires

  test("should show real progress message when discovery:progress socket event fires", async ({ page }) => {
    const wizard = await goToDiscoveryStep(page);
    await wizard.startDiscoveryButton.click();

    await emitSocketEvent(page, "discovery:progress", {
      jobId: JOB_ID,
      phase: "Scanning",
      progress: 42,
      message: "Scanning 128 files…",
    });

    await expect(page.getByText(/Scanning 128 files/)).toBeVisible();
  });

  // AC: Error shown and reset to idle when discovery:error fires

  test("should show error and reset to idle when discovery:error socket event fires", async ({ page }) => {
    const wizard = await goToDiscoveryStep(page);
    await wizard.startDiscoveryButton.click();

    await emitSocketEvent(page, "discovery:error", {
      jobId: JOB_ID,
      error: "Repository clone failed: authentication required",
    });

    await expect(page.getByText(/Repository clone failed: authentication required/)).toBeVisible();
    // Should reset to idle, showing Start Discovery button again
    await expect(wizard.startDiscoveryButton).toBeVisible();
  });

  // AC: 5-minute timeout: if no completion event, shows timeout error

  test("should show timeout error when discovery:complete is not received within 5 minutes", async ({ page }) => {
    const wizard = await goToDiscoveryStep(page);

    // Install fake clock right before clicking Start Discovery so the
    // 5-minute setTimeout (set up in useEffect after jobId is received)
    // uses the fake clock and can be advanced instantly.
    await page.clock.install();

    await wizard.startDiscoveryButton.click();
    await expect(page.getByText(/Discovery in progress/)).toBeVisible();

    // Advance the fake clock past the 5-minute discovery timeout
    await page.clock.fastForward(5 * 60 * 1000 + 1_000);

    await expect(page.getByText(/Discovery timed out/)).toBeVisible();
  });
});

// ── #416: Generate Tests Step Finish CTA ──────────────────────────────────────

test.describe("Generate Tests Step Finish CTA (#416)", () => {
  async function goToGenerateTestsStep(page: Page): Promise<SetupWizardPage> {
    const wizard = new SetupWizardPage(page);
    await mockAppsApi(page);
    await mockAllStepApis(page);

    // Provide one approved criterion so the Generate button is enabled
    await page.route(`**/api/talos/criteria/${APP_ID}**`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          criteria: [
            {
              id: "crit-01",
              applicationId: APP_ID,
              title: "User can log in",
              description: "Login flow works end to end",
              scenarios: [{ given: "user on login page", when: "enters valid creds", then: "is logged in" }],
              preconditions: [],
              dataRequirements: [],
              nfrTags: [],
              status: "approved",
              confidence: 0.92,
              tags: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
        }),
      })
    );

    await wizard.goto();
    await wizard.registerApp();
    await wizard.goToStep(/Generate Tests/);
    await expect(page.getByRole("heading", { name: "Generate Tests" })).toBeVisible();
    return wizard;
  }

  // AC: "Skip & Go to Test Library →" link is always visible on the Generate Tests step

  test('should always show "Skip & Go to Test Library →" before generation starts', async ({ page }) => {
    const wizard = await goToGenerateTestsStep(page);
    await expect(wizard.skipToTestLibraryLink).toBeVisible();
  });

  // AC: "Go to Test Library" button appears after successful test generation

  test('should show "Go to Test Library" button after tests are generated', async ({ page }) => {
    // Mock the generate test API
    await page.route("**/api/talos/tests/generate", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "test-gen-01",
          code: "test('should log in', async ({ page }) => { /* ... */ });",
          name: "User can log in",
          confidence: 0.89,
        }),
      })
    );

    const wizard = await goToGenerateTestsStep(page);
    await wizard.generateAllTestsButton.click();

    // After generation completes, the "Go to Test Library" button should appear
    await expect(wizard.goToTestLibraryButton).toBeVisible();
    // The "Skip & Go to Test Library" link should no longer be shown
    await expect(wizard.skipToTestLibraryLink).not.toBeVisible();
  });

  // AC: Clicking "Go to Test Library" navigates to /talos/{appId}

  test("should navigate to /talos/{appId} when Go to Test Library is clicked", async ({ page }) => {
    await page.route("**/api/talos/tests/generate", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "test-gen-02", code: "// test", name: "Test", confidence: 0.9 }),
      })
    );

    // Mock the destination page so navigation succeeds
    await page.route(`**/talos/${APP_ID}`, (route) => route.continue());

    const wizard = await goToGenerateTestsStep(page);
    await wizard.generateAllTestsButton.click();

    await expect(wizard.goToTestLibraryButton).toBeVisible();
    await wizard.goToTestLibraryButton.click();

    await expect(page).toHaveURL(new RegExp(`/talos/${APP_ID}`));
  });
});

// ── #431: Discovery → RAG Indexing Flow ───────────────────────────────────────
//
// After #431, the discover endpoint now indexes chunks into the RAG vector store
// after the crawl completes. The existing #419 tests already verify the Socket.IO
// state machine (start → progress → complete → error → timeout). These additional
// tests confirm the discovery flow is intact after the RAG indexing integration.

test.describe("Discovery RAG Indexing Flow (#431)", () => {
  const JOB_ID = "discovery-rag-e2e-001";

  async function goToDiscovery(page: Page): Promise<SetupWizardPage> {
    const wizard = new SetupWizardPage(page);
    await setupSocketMock(page);
    await mockAppsApi(page);
    await mockAllStepApis(page);

    await page.route(`**/api/talos/applications/${APP_ID}/discover`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ jobId: JOB_ID }),
      })
    );

    await wizard.goto();
    await wizard.registerApp();
    await wizard.goToStep(/Discovery/);
    await expect(page.getByRole("heading", { name: "Discovery" })).toBeVisible();

    // Wait for the socket mock EIO4 handshake
    await page.waitForTimeout(50);

    return wizard;
  }

  // AC #431: After DiscoveryEngine.startDiscovery() completes, chunks are indexed
  // The UI still receives discovery:complete with filesDiscovered + chunksCreated
  test("should complete full discovery flow including chunk count in results", async ({ page }) => {
    const wizard = await goToDiscovery(page);

    await test.step("Start discovery", async () => {
      await wizard.startDiscoveryButton.click();
      await expect(page.getByText(/Discovery in progress/)).toBeVisible();
    });

    await test.step("Emit progress event", async () => {
      await emitSocketEvent(page, "discovery:progress", {
        jobId: JOB_ID,
        phase: "Indexing",
        progress: 75,
        message: "Indexing 89 chunks into vector store…",
      });
      await expect(page.getByText(/Indexing 89 chunks/)).toBeVisible();
    });

    await test.step("Emit completion event with chunk count", async () => {
      await emitSocketEvent(page, "discovery:complete", {
        jobId: JOB_ID,
        filesDiscovered: 23,
        chunksCreated: 189,
      });
      await expect(page.getByText(/Discovery complete/)).toBeVisible();
      await expect(page.getByText(/23 files indexed/)).toBeVisible();
    });
  });

  // AC #431: If RAG indexing fails, discovery data is still saved (non-fatal)
  // The backend emits discovery:complete even if RAG indexing partially failed,
  // because SQLite data is preserved. Verify the error/warning path.
  test("should handle discovery:error gracefully and allow retry", async ({ page }) => {
    const wizard = await goToDiscovery(page);

    await test.step("Start discovery and receive error", async () => {
      await wizard.startDiscoveryButton.click();
      await expect(page.getByText(/Discovery in progress/)).toBeVisible();

      await emitSocketEvent(page, "discovery:error", {
        jobId: JOB_ID,
        error: "RAG indexing failed: embedding service unavailable",
      });
    });

    await test.step("Verify error is shown and Start Discovery reappears", async () => {
      await expect(page.getByText(/RAG indexing failed/)).toBeVisible();
      await expect(wizard.startDiscoveryButton).toBeVisible();
    });
  });
});
