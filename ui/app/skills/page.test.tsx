import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SkillsPage from "./page";

vi.mock("next/navigation", () => ({
  usePathname: () => "/skills",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/lib/api", () => ({
  getSkills: vi.fn().mockResolvedValue([
    { id: "s-1", name: "Criteria Generator", description: "Generate criteria", tags: ["testing"], enabled: true, requiredTools: ["tool1"], content: "" },
    { id: "s-1", name: "Criteria Generator", description: "Generate criteria", tags: ["testing"], enabled: true, requiredTools: ["tool1"], content: "" },
    { id: "s-2", name: "Test Planner", description: "Plan tests", tags: ["testing"], enabled: true, requiredTools: [], content: "" },
    { id: "s-2", name: "Test Planner", description: "Plan tests", tags: ["testing"], enabled: true, requiredTools: [], content: "" },
  ]),
  createSkill: vi.fn(),
  updateSkill: vi.fn(),
  deleteSkill: vi.fn(),
  getSkillAgents: vi.fn().mockResolvedValue([]),
}));

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("SkillsPage", () => {
  it("renders page heading", () => {
    renderWithProviders(<SkillsPage />);
    expect(screen.getByRole("heading", { name: "Skills" })).toBeInTheDocument();
  });

  it("renders new skill button", () => {
    renderWithProviders(<SkillsPage />);
    expect(screen.getByText("New Skill")).toBeInTheDocument();
  });

  // #512: Deduplicates skills by ID — API returns 4 items (2 dupes), should render 2
  it("deduplicates skills so each appears only once", async () => {
    renderWithProviders(<SkillsPage />);
    await waitFor(() => {
      expect(screen.getByText("Criteria Generator")).toBeInTheDocument();
    });
    // Should show exactly 2 unique skill names, not 4 duplicates
    const criteriaCards = screen.getAllByText("Criteria Generator");
    expect(criteriaCards).toHaveLength(1);
    const plannerCards = screen.getAllByText("Test Planner");
    expect(plannerCards).toHaveLength(1);
  });
});
