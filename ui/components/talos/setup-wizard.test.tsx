/**
 * Tests for setup-wizard changes from issues #413, #414, #415, #416, #417, #419
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SetupWizard } from "./setup-wizard";

// ── Socket mock ───────────────────────────────────────────────────────────────
const subscribeCallbacks = new Map<string, (data: unknown) => void>();
const mockSubscribe = vi.fn((event: string, handler: (data: unknown) => void) => {
  subscribeCallbacks.set(event, handler);
  return () => subscribeCallbacks.delete(event);
});
const mockUnsubscribe = vi.fn();

vi.mock("@/lib/socket", () => ({
  useSocket: () => ({ isConnected: true, subscribe: mockSubscribe, emit: vi.fn() }),
  useTestRunUpdates: vi.fn(),
  useDiscoveryUpdates: vi.fn(),
}));

// ── Router mock ───────────────────────────────────────────────────────────────
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/talos/setup",
}));

// ── API mock ──────────────────────────────────────────────────────────────────
const mockCreateApplication = vi.fn().mockResolvedValue({ id: "app-new", name: "New App" });
const mockTriggerDiscovery = vi.fn().mockResolvedValue({ jobId: "job-123" });
const mockIngestDocument = vi
  .fn()
  .mockResolvedValue({ chunksCreated: 5, chunksSkipped: 0, totalTokens: 500, docId: "d-1" });
const mockGetApplications = vi
  .fn()
  .mockResolvedValue([
    { id: "app-1", name: "Existing App", repositoryUrl: "https://github.com/test/repo", baseUrl: "https://test.app" },
  ]);

vi.mock("@/lib/api", () => ({
  getApplications: () => mockGetApplications(),
  createApplication: (...args: unknown[]) => mockCreateApplication(...args),
  triggerDiscovery: (...args: unknown[]) => mockTriggerDiscovery(...args),
  ingestDocument: (...args: unknown[]) => mockIngestDocument(...args),
  getVaultRoles: vi.fn().mockResolvedValue([]),
  createVaultRole: vi.fn().mockResolvedValue({ id: "r-1", name: "Admin", roleType: "admin" }),
  getCriteria: vi.fn().mockResolvedValue([
    {
      id: "c-1",
      applicationId: "app-1",
      title: "Login flow",
      description: "Test login",
      scenarios: [{ given: "a user", when: "they log in", then: "they see dashboard" }],
      preconditions: [],
      dataRequirements: [],
      nfrTags: [],
      status: "approved",
      confidence: 0.9,
      tags: [],
      createdAt: "2025-01-01",
      updatedAt: "2025-01-01",
    },
  ]),
  generateCriteria: vi.fn().mockResolvedValue({ criteriaCreated: 3, averageConfidence: 0.85 }),
  updateCriteria: vi.fn().mockResolvedValue({}),
  suggestCriteria: vi.fn().mockResolvedValue({ id: "c-2", title: "Suggested", scenarios: [] }),
  generateTest: vi.fn().mockResolvedValue({ id: "t-1", code: "test code", name: "test", confidence: 0.9 }),
  getTraceabilityReport: vi.fn().mockResolvedValue({
    totalRequirements: 5,
    coveredRequirements: 3,
    totalCriteria: 4,
    implementedCriteria: 2,
    coveragePercentage: 50,
    unmappedRequirements: [],
    untestedCriteria: [],
  }),
  m365Status: vi.fn().mockResolvedValue({ status: "disabled", message: "M365 disabled" }),
  m365Search: vi.fn().mockResolvedValue({ results: [] }),
  m365Fetch: vi.fn().mockResolvedValue({ content: "doc content", savedPath: "" }),
  getDataSources: vi.fn().mockResolvedValue([]),
  createDataSource: vi.fn().mockResolvedValue({ id: "ds-1", label: "DB" }),
  deleteDataSource: vi.fn().mockResolvedValue(undefined),
  testDataSourceConnection: vi.fn().mockResolvedValue({ success: true }),
  getAtlassianConfig: vi.fn().mockResolvedValue(null),
  saveAtlassianConfig: vi.fn().mockResolvedValue({ id: "atl-1" }),
  testAtlassianConnection: vi.fn().mockResolvedValue({ success: true }),
  getMcpServers: vi.fn().mockResolvedValue([]),
  getIntelligenceReport: vi.fn().mockRejectedValue(new Error("Not found")),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────
function renderWizard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SetupWizard />
    </QueryClientProvider>
  );
}

/** Navigate wizard to a specific step by selecting existing app then clicking step nav */
async function navigateToStep(stepIndex: number) {
  renderWizard();
  // Select existing app to set appId and unlock step navigation
  await waitFor(() => expect(screen.getByText("Existing App")).toBeInTheDocument());
  fireEvent.click(screen.getByText("Existing App"));
  // Wait for navigation to step 1 (first incomplete step)
  await waitFor(() => expect(screen.getByText("Configure JDBC database connections")).toBeInTheDocument());
  // Click the numbered step in progress bar to jump to desired step
  const stepButtons = screen.getAllByRole("button").filter((b) => {
    const span = b.querySelector("span.rounded-full");
    return span && parseInt(span.textContent ?? "0") === stepIndex + 1;
  });
  if (stepButtons.length > 0) {
    fireEvent.click(stepButtons[0]);
  }
}

// ── Tests for #417: RegisterAppStep required fields + error handling ──────────
describe("#417 – RegisterAppStep", () => {
  beforeEach(() => {
    mockCreateApplication.mockResolvedValue({ id: "app-new", name: "New App" });
  });

  it("Create Application button is disabled when only name is filled", () => {
    renderWizard();
    const nameInput = screen.getByPlaceholderText("Application name");
    fireEvent.change(nameInput, { target: { value: "My App" } });
    const createBtn = screen.getByRole("button", { name: /Create Application/i });
    expect(createBtn).toBeDisabled();
  });

  it("Create Application button is disabled when repoUrl is missing", async () => {
    renderWizard();
    fireEvent.change(screen.getByPlaceholderText("Application name"), { target: { value: "My App" } });
    fireEvent.change(screen.getByPlaceholderText(/Base URL/), { target: { value: "https://staging.example.com" } });
    const createBtn = screen.getByRole("button", { name: /Create Application/i });
    expect(createBtn).toBeDisabled();
  });

  it("Create Application button is disabled when baseUrl is missing", async () => {
    renderWizard();
    fireEvent.change(screen.getByPlaceholderText("Application name"), { target: { value: "My App" } });
    fireEvent.change(screen.getByPlaceholderText(/Repository URL/), {
      target: { value: "https://github.com/org/repo" },
    });
    const createBtn = screen.getByRole("button", { name: /Create Application/i });
    expect(createBtn).toBeDisabled();
  });

  it("shows inline error for invalid repoUrl format", () => {
    renderWizard();
    const repoInput = screen.getByPlaceholderText(/Repository URL/);
    fireEvent.change(repoInput, { target: { value: "github.com/org/repo" } });
    expect(screen.getByText("Must start with http:// or https://")).toBeInTheDocument();
  });

  it("shows inline error for invalid baseUrl format", () => {
    renderWizard();
    const baseInput = screen.getByPlaceholderText(/Base URL/);
    fireEvent.change(baseInput, { target: { value: "staging.example.com" } });
    expect(screen.getByText("Must start with http:// or https://")).toBeInTheDocument();
  });

  it("clears URL validation error when valid URL is entered", () => {
    renderWizard();
    const repoInput = screen.getByPlaceholderText(/Repository URL/);
    fireEvent.change(repoInput, { target: { value: "invalid" } });
    expect(screen.getByText("Must start with http:// or https://")).toBeInTheDocument();
    fireEvent.change(repoInput, { target: { value: "https://github.com/org/repo" } });
    expect(screen.queryByText("Must start with http:// or https://")).not.toBeInTheDocument();
  });

  it("Create button is disabled when URLs are invalid format", () => {
    renderWizard();
    fireEvent.change(screen.getByPlaceholderText("Application name"), { target: { value: "My App" } });
    fireEvent.change(screen.getByPlaceholderText(/Repository URL/), { target: { value: "github.com/org/repo" } });
    fireEvent.change(screen.getByPlaceholderText(/Base URL/), { target: { value: "https://staging.example.com" } });
    const createBtn = screen.getByRole("button", { name: /Create Application/i });
    expect(createBtn).toBeDisabled();
  });

  it("Create button is enabled when all fields are valid", async () => {
    renderWizard();
    fireEvent.change(screen.getByPlaceholderText("Application name"), { target: { value: "My App" } });
    fireEvent.change(screen.getByPlaceholderText(/Repository URL/), {
      target: { value: "https://github.com/org/repo" },
    });
    fireEvent.change(screen.getByPlaceholderText(/Base URL/), { target: { value: "https://staging.example.com" } });
    const createBtn = screen.getByRole("button", { name: /Create Application/i });
    expect(createBtn).not.toBeDisabled();
  });

  it("shows error message when createApplication API fails", async () => {
    mockCreateApplication.mockRejectedValueOnce(new Error("Server error: 500"));
    renderWizard();
    fireEvent.change(screen.getByPlaceholderText("Application name"), { target: { value: "My App" } });
    fireEvent.change(screen.getByPlaceholderText(/Repository URL/), { target: { value: "https://github.com/repo" } });
    fireEvent.change(screen.getByPlaceholderText(/Base URL/), { target: { value: "https://staging.example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Create Application/i }));
    await waitFor(() => {
      expect(screen.getByText("Server error: 500")).toBeInTheDocument();
    });
  });

  it("shows error banner with retry button when getApplications API fails", async () => {
    mockGetApplications.mockRejectedValueOnce(new Error("Failed to fetch"));
    renderWizard();
    await waitFor(() => {
      expect(screen.getByText(/Cannot connect to the API server/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Retry/i })).toBeInTheDocument();
  });
});

// ── Tests for Tab Navigation (#Bug2) ──────────────────────────────────────────
describe("Tab Navigation", () => {
  it("step tabs 2-9 are disabled when no app is selected", () => {
    renderWizard();
    // Get all step buttons (9 total)
    const stepButtons = screen.getAllByRole("button").filter((btn) => {
      const span = btn.querySelector("span.rounded-full");
      return span && /^[1-9]$/.test(span.textContent || "");
    });
    // Steps 2-9 (index 1-8) should be disabled
    for (let i = 1; i < stepButtons.length; i++) {
      expect(stepButtons[i]).toBeDisabled();
      expect(stepButtons[i]).toHaveClass("opacity-50");
      expect(stepButtons[i]).toHaveClass("cursor-not-allowed");
    }
  });

  it("step tabs show tooltip explaining why disabled", () => {
    renderWizard();
    const stepButtons = screen.getAllByRole("button").filter((btn) => {
      const span = btn.querySelector("span.rounded-full");
      return span && span.textContent === "2";
    });
    if (stepButtons.length > 0) {
      expect(stepButtons[0]).toHaveAttribute("title", "Create or select an application first");
    }
  });

  it("step tabs become enabled after selecting an app", async () => {
    renderWizard();
    await waitFor(() => expect(screen.getByText("Existing App")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Existing App"));
    await waitFor(() => expect(screen.getByText("Configure JDBC database connections")).toBeInTheDocument());
    // Now step tabs should be enabled
    const stepButtons = screen.getAllByRole("button").filter((btn) => {
      const span = btn.querySelector("span.rounded-full");
      return span && span.textContent === "3";
    });
    if (stepButtons.length > 0) {
      expect(stepButtons[0]).not.toBeDisabled();
    }
  });
});

// ── Tests for #414 & #415: UploadDocsStep ─────────────────────────────────────
describe("#414 & #415 – UploadDocsStep", () => {
  async function goToUploadStep() {
    await navigateToStep(3);
    await waitFor(() => {
      expect(screen.getByText("Upload requirements documents"))
        .toBeInTheDocument()
        .or(expect(screen.queryByText(/Upload requirements documents|Upload Local Files/)).toBeTruthy());
    });
  }

  it("Continue button shows 'Skip This Step' label when no files uploaded", async () => {
    renderWizard();
    await waitFor(() => expect(screen.getByText("Existing App")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Existing App"));
    await waitFor(() => expect(screen.getByText("Configure JDBC database connections")).toBeInTheDocument());
    // Navigate to upload docs step — click the step button containing "Upload Docs" label
    // (completed steps show CheckCircle2 instead of step number, so find by label text)
    const uploadBtn = screen.getAllByRole("button").find((btn) => btn.textContent?.includes("Upload Docs"));
    if (uploadBtn) {
      fireEvent.click(uploadBtn);
    }
    await waitFor(() => {
      // Check that the Upload docs step is displayed
      expect(screen.getByText(/Upload requirements documents/i)).toBeInTheDocument();
    });
    // The continue button should say "Skip This Step" when no files are uploaded
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Skip This Step/i })).toBeInTheDocument();
    });
  });
});

// ── Tests for #419: DiscoveryStep Socket.IO ───────────────────────────────────
describe("#419 – DiscoveryStep Socket.IO", () => {
  beforeEach(() => {
    mockSubscribe.mockClear();
    mockUnsubscribe.mockClear();
    subscribeCallbacks.clear();
    mockTriggerDiscovery.mockResolvedValue({ jobId: "job-123" });
  });

  async function goToDiscoveryStep() {
    renderWizard();
    await waitFor(() => expect(screen.getByText("Existing App")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Existing App"));
    await waitFor(() => expect(screen.getByText("Configure JDBC database connections")).toBeInTheDocument());
    // Jump to step 5 (Discovery) via progress bar — button shows "6"
    const stepBtns = document.querySelectorAll("button span.rounded-full");
    const step6Btn = Array.from(stepBtns).find((s) => s.textContent === "6");
    if (step6Btn?.closest("button")) {
      fireEvent.click(step6Btn.closest("button")!);
    }
  }

  it("renders Start Discovery button initially", async () => {
    await goToDiscoveryStep();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Start Discovery/i })).toBeInTheDocument();
    });
  });

  it("shows progress spinner after clicking Start Discovery", async () => {
    await goToDiscoveryStep();
    await waitFor(() => expect(screen.getByRole("button", { name: /Start Discovery/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Start Discovery/i }));
    await waitFor(() => {
      expect(screen.getByText(/Discovery in progress/i)).toBeInTheDocument();
    });
  });

  it("jobId is set from API response and socket listeners are registered", async () => {
    await goToDiscoveryStep();
    await waitFor(() => expect(screen.getByRole("button", { name: /Start Discovery/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Start Discovery/i }));
    await waitFor(() => {
      expect(mockTriggerDiscovery).toHaveBeenCalledWith("app-1");
    });
    await waitFor(() => {
      expect(mockSubscribe).toHaveBeenCalledWith("discovery:progress", expect.any(Function));
      expect(mockSubscribe).toHaveBeenCalledWith("discovery:complete", expect.any(Function));
      expect(mockSubscribe).toHaveBeenCalledWith("discovery:error", expect.any(Function));
    });
  });

  it("updates progress message from discovery:progress socket event", async () => {
    await goToDiscoveryStep();
    await waitFor(() => expect(screen.getByRole("button", { name: /Start Discovery/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Start Discovery/i }));
    await waitFor(() => expect(mockTriggerDiscovery).toHaveBeenCalled());
    await waitFor(() => expect(subscribeCallbacks.has("discovery:progress")).toBe(true));

    act(() => {
      subscribeCallbacks.get("discovery:progress")?.({
        jobId: "job-123",
        phase: "Indexing",
        progress: 42,
        message: "Indexing source files...",
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Indexing source files...")).toBeInTheDocument();
    });
    expect(screen.getByText(/Indexing.*42%/)).toBeInTheDocument();
  });

  it("ignores discovery:progress events with different jobId", async () => {
    await goToDiscoveryStep();
    await waitFor(() => expect(screen.getByRole("button", { name: /Start Discovery/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Start Discovery/i }));
    await waitFor(() => expect(subscribeCallbacks.has("discovery:progress")).toBe(true));

    act(() => {
      subscribeCallbacks.get("discovery:progress")?.({
        jobId: "other-job",
        phase: "Indexing",
        progress: 50,
        message: "Should not appear",
      });
    });

    await waitFor(() => {
      expect(screen.queryByText("Should not appear")).not.toBeInTheDocument();
    });
  });

  it("shows complete state with file counts from discovery:complete event", async () => {
    await goToDiscoveryStep();
    await waitFor(() => expect(screen.getByRole("button", { name: /Start Discovery/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Start Discovery/i }));
    await waitFor(() => expect(subscribeCallbacks.has("discovery:complete")).toBe(true));

    act(() => {
      subscribeCallbacks.get("discovery:complete")?.({
        jobId: "job-123",
        filesDiscovered: 47,
        chunksCreated: 312,
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/47 files indexed/)).toBeInTheDocument();
      expect(screen.getByText(/312 chunks created/)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Continue/i })).toBeInTheDocument();
  });

  it("shows error message from discovery:error socket event", async () => {
    await goToDiscoveryStep();
    await waitFor(() => expect(screen.getByRole("button", { name: /Start Discovery/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Start Discovery/i }));
    await waitFor(() => expect(subscribeCallbacks.has("discovery:error")).toBe(true));

    act(() => {
      subscribeCallbacks.get("discovery:error")?.({
        jobId: "job-123",
        error: "Repository clone failed: authentication required",
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Repository clone failed: authentication required")).toBeInTheDocument();
    });
    // Should return to idle state so user can retry
    expect(screen.getByRole("button", { name: /Start Discovery/i })).toBeInTheDocument();
  });

  it("ignores discovery:error events with different jobId", async () => {
    await goToDiscoveryStep();
    await waitFor(() => expect(screen.getByRole("button", { name: /Start Discovery/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Start Discovery/i }));
    await waitFor(() => expect(subscribeCallbacks.has("discovery:error")).toBe(true));

    act(() => {
      subscribeCallbacks.get("discovery:error")?.({
        jobId: "wrong-job",
        error: "Wrong job error",
      });
    });

    await waitFor(() => {
      expect(screen.queryByText("Wrong job error")).not.toBeInTheDocument();
    });
  });
});

// ── Tests for #416: GenerateTestsStep navigation ──────────────────────────────
describe("#416 – GenerateTestsStep navigation", () => {
  async function goToGenerateTestsStep() {
    renderWizard();
    await waitFor(() => expect(screen.getByText("Existing App")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Existing App"));
    await waitFor(() => expect(screen.getByText("Configure JDBC database connections")).toBeInTheDocument());
    // Jump to step 8 (Generate Tests) — button shows "9"
    const stepBtns = document.querySelectorAll("button span.rounded-full");
    const step9Btn = Array.from(stepBtns).find((s) => s.textContent === "9");
    if (step9Btn?.closest("button")) {
      fireEvent.click(step9Btn.closest("button")!);
    }
  }

  it("renders 'Skip & Go to Test Library' link in generate tests step", async () => {
    await goToGenerateTestsStep();
    await waitFor(() => {
      expect(screen.getByText(/Skip.*Go to Test Library/i)).toBeInTheDocument();
    });
  });

  it("'Skip & Go to Test Library' navigates to the app test library", async () => {
    await goToGenerateTestsStep();
    await waitFor(() => expect(screen.getByText(/Skip.*Go to Test Library/i)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/Skip.*Go to Test Library/i));
    expect(mockPush).toHaveBeenCalledWith("/talos/app-1");
  });

  it("shows 'Go to Test Library' button after test generation completes", async () => {
    const { generateTest } = await import("@/lib/api");
    vi.mocked(generateTest).mockResolvedValue({ id: "t-1", code: "code", name: "test", confidence: 0.9 } as never);

    await goToGenerateTestsStep();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Generate Tests for All Criteria/i })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole("button", { name: /Generate Tests for All Criteria/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Go to Test Library/i })).toBeInTheDocument();
    });
  });

  it("'Go to Test Library' button navigates correctly after completion", async () => {
    mockPush.mockClear();
    await goToGenerateTestsStep();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Generate Tests for All Criteria/i })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole("button", { name: /Generate Tests for All Criteria/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Go to Test Library/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Go to Test Library/i }));
    expect(mockPush).toHaveBeenCalledWith("/talos/app-1");
  });
});

// ── Tests for #413: AtlassianStep Skip button ─────────────────────────────────
describe("#413 – AtlassianStep Skip button uses outline variant", () => {
  it("renders Skip button in the Atlassian step with outline class", async () => {
    renderWizard();
    await waitFor(() => expect(screen.getByText("Existing App")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Existing App"));
    await waitFor(() => expect(screen.getByText("Configure JDBC database connections")).toBeInTheDocument());
    // Jump to Atlassian step (step 2, button "3")
    const stepBtns = document.querySelectorAll("button span.rounded-full");
    const step3Btn = Array.from(stepBtns).find((s) => s.textContent === "3");
    if (step3Btn?.closest("button")) {
      fireEvent.click(step3Btn.closest("button")!);
    }
    // The Atlassian step description uses & entity
    await waitFor(() => expect(screen.getByText(/Connect Jira/i)).toBeInTheDocument());
    // All Skip buttons should use outline variant (has 'border' in className)
    const skipBtns = screen.getAllByRole("button", { name: /^Skip$/i });
    expect(skipBtns.length).toBeGreaterThanOrEqual(1);
    skipBtns.forEach((btn) => {
      expect(btn.className).toContain("border");
    });
  });
});

// ── Tests for URL validation helpers ─────────────────────────────────────────
describe("URL validation", () => {
  it("accepts http:// URLs", () => {
    renderWizard();
    const repoInput = screen.getByPlaceholderText(/Repository URL/);
    fireEvent.change(repoInput, { target: { value: "http://github.com/org/repo" } });
    expect(screen.queryByText("Must start with http:// or https://")).not.toBeInTheDocument();
  });

  it("accepts https:// URLs", () => {
    renderWizard();
    const repoInput = screen.getByPlaceholderText(/Repository URL/);
    fireEvent.change(repoInput, { target: { value: "https://github.com/org/repo" } });
    expect(screen.queryByText("Must start with http:// or https://")).not.toBeInTheDocument();
  });

  it("rejects ftp:// URLs", () => {
    renderWizard();
    const repoInput = screen.getByPlaceholderText(/Repository URL/);
    fireEvent.change(repoInput, { target: { value: "ftp://github.com/org/repo" } });
    expect(screen.getByText("Must start with http:// or https://")).toBeInTheDocument();
  });

  it("shows no error when URL field is empty", () => {
    renderWizard();
    const repoInput = screen.getByPlaceholderText(/Repository URL/);
    fireEvent.change(repoInput, { target: { value: "" } });
    expect(screen.queryByText("Must start with http:// or https://")).not.toBeInTheDocument();
  });
});
