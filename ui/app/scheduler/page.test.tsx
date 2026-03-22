import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SchedulerPage from "./page";

vi.mock("next/navigation", () => ({
  usePathname: () => "/scheduler",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/lib/api", () => ({
  getJobs: vi.fn().mockResolvedValue([]),
  createJob: vi.fn(),
  updateJob: vi.fn(),
  deleteJob: vi.fn(),
}));

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("SchedulerPage", () => {
  it("renders page heading", () => {
    renderWithProviders(<SchedulerPage />);
    expect(screen.getByRole("heading", { name: "Scheduler" })).toBeInTheDocument();
  });

  it("renders new job button", () => {
    renderWithProviders(<SchedulerPage />);
    expect(screen.getByText("New Job")).toBeInTheDocument();
  });

  it("shows empty state when no jobs", () => {
    renderWithProviders(<SchedulerPage />);
    expect(screen.getByText("No scheduled jobs. Create one to automate tasks.")).toBeInTheDocument();
  });
});
