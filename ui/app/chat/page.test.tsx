import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ChatPage from "./page";

beforeAll(() => {
  // jsdom doesn't implement scrollIntoView
  Element.prototype.scrollIntoView = vi.fn();
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/chat",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/lib/socket", () => ({
  useSocket: () => ({
    isConnected: true,
    subscribe: vi.fn(() => vi.fn()),
    emit: vi.fn(),
  }),
}));

vi.mock("@/lib/api", () => ({
  getChatSessions: vi.fn().mockResolvedValue([]),
  deleteChatSession: vi.fn(),
  getModels: vi.fn().mockResolvedValue({ models: [], selected: "gpt-4.1", reasoningEffort: "medium" }),
}));

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("ChatPage", () => {
  it("renders empty state", () => {
    renderWithProviders(<ChatPage />);
    expect(screen.getByText("Talos AI Chat")).toBeInTheDocument();
    expect(screen.getByText("Send a message to start a conversation")).toBeInTheDocument();
  });

  it("renders message input", () => {
    renderWithProviders(<ChatPage />);
    expect(screen.getByPlaceholderText("Type a message...")).toBeInTheDocument();
  });

  it("renders send button", () => {
    renderWithProviders(<ChatPage />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
  });
});
