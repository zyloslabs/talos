import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
  getSkills: vi.fn().mockResolvedValue([]),
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

  it("shows empty state when no skills", () => {
    renderWithProviders(<SkillsPage />);
    expect(screen.getByText("No skills configured. Create one or use a template to get started.")).toBeInTheDocument();
  });
});
