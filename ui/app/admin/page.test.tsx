import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AdminPage from "./page";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/lib/api", () => ({
  getPersonalities: vi.fn().mockResolvedValue({ personalities: [], activeId: null }),
  createPersonality: vi.fn(),
  updatePersonality: vi.fn(),
  activatePersonality: vi.fn(),
  getModels: vi.fn().mockResolvedValue({ models: [], selected: "gpt-4.1", reasoningEffort: "medium" }),
  setSelectedModel: vi.fn(),
  setReasoningEffort: vi.fn(),
  getAuthStatus: vi.fn().mockResolvedValue({ authenticated: false }),
  startDeviceAuth: vi.fn(),
  getMcpServers: vi.fn().mockResolvedValue([]),
  createMcpServer: vi.fn(),
  deleteMcpServer: vi.fn(),
}));

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("AdminPage", () => {
  it("renders page title", () => {
    renderWithProviders(<AdminPage />);
    expect(screen.getByText("Admin Settings")).toBeInTheDocument();
  });

  it("renders all tab triggers", () => {
    renderWithProviders(<AdminPage />);
    expect(screen.getByText("Auth")).toBeInTheDocument();
    expect(screen.getByText("Personality")).toBeInTheDocument();
    expect(screen.getByText("Models")).toBeInTheDocument();
    expect(screen.getByText("MCP Servers")).toBeInTheDocument();
  });

  it("renders auth panel by default", () => {
    renderWithProviders(<AdminPage />);
    expect(screen.getByText("GitHub Copilot Authentication")).toBeInTheDocument();
  });
});
