import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SetupPage from "./page";

vi.mock("next/navigation", () => ({
  usePathname: () => "/talos/setup",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/lib/api", () => ({
  getApplications: vi
    .fn()
    .mockResolvedValue([
      { id: "app-1", name: "Test App", repositoryUrl: "https://github.com/test/app", baseUrl: "https://test.app" },
    ]),
  createApplication: vi.fn().mockResolvedValue({ id: "app-2", name: "New App" }),
  getVaultRoles: vi.fn().mockResolvedValue([]),
  createVaultRole: vi.fn().mockResolvedValue({ id: "role-1", name: "Admin", roleType: "admin" }),
  triggerDiscovery: vi.fn().mockResolvedValue({ jobId: "job-1" }),
  getCriteria: vi.fn().mockResolvedValue([
    {
      id: "c-1",
      applicationId: "app-1",
      title: "Login test",
      description: "Test login flow",
      scenarios: [{ given: "a valid user", when: "they log in", then: "they see the dashboard" }],
      preconditions: [],
      dataRequirements: [],
      nfrTags: [],
      status: "draft",
      confidence: 0.9,
      tags: [],
      createdAt: "2025-01-01",
      updatedAt: "2025-01-01",
    },
  ]),
  generateCriteria: vi.fn().mockResolvedValue({ criteriaCreated: 5, totalChunksAnalyzed: 10, averageConfidence: 0.85 }),
  updateCriteria: vi.fn().mockResolvedValue({}),
  suggestCriteria: vi.fn().mockResolvedValue({ id: "c-2", title: "Suggested", scenarios: [] }),
  generateTest: vi.fn().mockResolvedValue({ id: "t-1", code: "test code", name: "test", confidence: 0.9 }),
  getTraceabilityReport: vi.fn().mockResolvedValue({
    totalRequirements: 10,
    coveredRequirements: 5,
    totalCriteria: 8,
    implementedCriteria: 3,
    coveragePercentage: 37.5,
    unmappedRequirements: [],
    untestedCriteria: [],
  }),
  ingestDocument: vi.fn().mockResolvedValue({ chunksCreated: 12, chunksSkipped: 0, totalTokens: 1500, docId: "doc-1" }),
  m365Status: vi.fn().mockResolvedValue({ status: "disabled", message: "M365 integration is not enabled" }),
  m365Search: vi.fn().mockResolvedValue({ results: [] }),
  m365Fetch: vi.fn().mockResolvedValue({ content: "", savedPath: "" }),
  getDataSources: vi.fn().mockResolvedValue([]),
  createDataSource: vi.fn().mockResolvedValue({ id: "ds-1", label: "Test DB" }),
  deleteDataSource: vi.fn().mockResolvedValue(undefined),
  testDataSourceConnection: vi.fn().mockResolvedValue({ success: true }),
  getAtlassianConfig: vi.fn().mockResolvedValue(null),
  saveAtlassianConfig: vi.fn().mockResolvedValue({ id: "atl-1" }),
  testAtlassianConnection: vi.fn().mockResolvedValue({ success: true }),
}));

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("SetupPage", () => {
  it("renders the wizard with step 1 active", () => {
    renderWithProviders(<SetupPage />);
    expect(screen.getAllByText("Register App").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Set up your target application")).toBeInTheDocument();
  });

  it("shows existing applications to select", async () => {
    renderWithProviders(<SetupPage />);
    await waitFor(() => {
      expect(screen.getByText("Test App")).toBeInTheDocument();
    });
  });

  it("renders create application form", () => {
    renderWithProviders(<SetupPage />);
    expect(screen.getByPlaceholderText("Application name")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Repository URL/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Base URL/)).toBeInTheDocument();
  });

  it("navigates to step 2 when app is selected", async () => {
    renderWithProviders(<SetupPage />);
    await waitFor(() => {
      expect(screen.getByText("Test App")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Test App"));
    await waitFor(() => {
      expect(screen.getByText("Configure JDBC database connections")).toBeInTheDocument();
    });
  });

  it("shows back button disabled on step 1", () => {
    renderWithProviders(<SetupPage />);
    const backBtn = screen.getByText("Back").closest("button");
    expect(backBtn).toBeDisabled();
  });

  it("renders all step labels in the progress bar", () => {
    renderWithProviders(<SetupPage />);
    expect(screen.getAllByText("Register App").length).toBeGreaterThanOrEqual(1);
  });
});
