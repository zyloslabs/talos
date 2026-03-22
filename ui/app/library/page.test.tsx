import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import LibraryPage from "./page";

vi.mock("next/navigation", () => ({
  usePathname: () => "/library",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/lib/api", () => ({
  getPrompts: vi.fn().mockResolvedValue([]),
  createPrompt: vi.fn(),
  updatePrompt: vi.fn(),
  deletePrompt: vi.fn(),
}));

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("LibraryPage", () => {
  it("renders page title", () => {
    renderWithProviders(<LibraryPage />);
    expect(screen.getByText("Prompt Library")).toBeInTheDocument();
  });

  it("renders search input", () => {
    renderWithProviders(<LibraryPage />);
    expect(screen.getByPlaceholderText("Search prompts...")).toBeInTheDocument();
  });

  it("renders new prompt button", () => {
    renderWithProviders(<LibraryPage />);
    expect(screen.getByText("New Prompt")).toBeInTheDocument();
  });
});
