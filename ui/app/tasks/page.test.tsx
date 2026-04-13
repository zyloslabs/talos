import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import TasksPage from "./page";

vi.mock("next/navigation", () => ({
  usePathname: () => "/tasks",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/lib/api", () => ({
  getTasks: vi.fn().mockResolvedValue([]),
  getTaskStats: vi.fn().mockResolvedValue({ pending: 0, running: 0, completed: 5, failed: 0 }),
}));

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("TasksPage", () => {
  it("renders page heading", () => {
    renderWithProviders(<TasksPage />);
    expect(screen.getByRole("heading", { name: "Task Queue" })).toBeInTheDocument();
  });

  // #519: Failed count should use muted color when zero, not red
  it("shows zero failed count in muted style, not red", async () => {
    renderWithProviders(<TasksPage />);
    await waitFor(() => {
      // Find the "Failed" label card
      const failedLabel = screen.getByText("Failed");
      const card = failedLabel.closest("[class*='CardContent']") || failedLabel.parentElement;
      const countEl = card?.querySelector("p.text-2xl");
      // When value is 0, should have muted-foreground class, not red
      if (countEl) {
        expect(countEl.className).toContain("text-muted-foreground");
        expect(countEl.className).not.toContain("text-red-500");
      }
    });
  });

  // #519: Completed count should also use muted when zero
  it("shows zero pending count in muted style", async () => {
    renderWithProviders(<TasksPage />);
    await waitFor(() => {
      const pendingLabel = screen.getByText("Pending");
      const card = pendingLabel.closest("[class*='CardContent']") || pendingLabel.parentElement;
      const countEl = card?.querySelector("p.text-2xl");
      if (countEl) {
        expect(countEl.className).toContain("text-muted-foreground");
      }
    });
  });
});
