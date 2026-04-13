import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AgentsPage from "./page";

vi.mock("next/navigation", () => ({
  usePathname: () => "/agents",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/lib/api", () => ({
  getAgents: vi.fn().mockResolvedValue([
    {
      id: "a-1",
      name: "Test Orchestrator",
      description: "Coordinates the full autonomous testing lifecycle: ingest requirements, generate acceptance criteria, create Playwright tests, run them, and report results with traceability metrics.",
      enabled: true,
      toolsWhitelist: ["tool1", "tool2"],
      systemPrompt: "",
      parentAgentId: null,
    },
  ]),
  createAgent: vi.fn(),
  updateAgent: vi.fn(),
  deleteAgent: vi.fn(),
  getAgentSkills: vi.fn().mockResolvedValue([]),
  setAgentSkills: vi.fn(),
  getSkills: vi.fn().mockResolvedValue([]),
}));

const longDescription =
  "Coordinates the full autonomous testing lifecycle: ingest requirements, generate acceptance criteria, create Playwright tests, run them, and report results with traceability metrics.";

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("AgentsPage", () => {
  it("renders page heading", () => {
    renderWithProviders(<AgentsPage />);
    expect(screen.getByRole("heading", { name: "Agents" })).toBeInTheDocument();
  });

  // #522: Agent description should have a "Show more" button for long text
  it("shows 'Show more' link for long descriptions", async () => {
    renderWithProviders(<AgentsPage />);
    await waitFor(() => {
      expect(screen.getByText("Test Orchestrator")).toBeInTheDocument();
    });
    // Should show "Show more" button for the long description
    expect(screen.getByText("Show more")).toBeInTheDocument();
  });

  it("expands description on 'Show more' click", async () => {
    renderWithProviders(<AgentsPage />);
    await waitFor(() => {
      expect(screen.getByText("Show more")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Show more"));
    // After expanding, the full description should be visible
    await waitFor(() => {
      expect(screen.getByText(longDescription)).toBeInTheDocument();
    });
    // "Show more" should disappear after expanding
    expect(screen.queryByText("Show more")).not.toBeInTheDocument();
  });
});
