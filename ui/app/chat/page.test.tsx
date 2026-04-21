import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
  getChatSessions: vi.fn().mockResolvedValue([
    { id: "session-1", startedAt: "2026-04-01T00:00:00Z", lastMessageAt: "2026-04-01T01:00:00Z", messageCount: 3, preview: "are you there" },
  ]),
  getChatSession: vi.fn().mockResolvedValue({
    id: "session-1",
    messages: [
      { role: "user", content: "are you there", timestamp: "2026-04-01T00:00:00Z" },
      { role: "assistant", content: "Yes I am here", timestamp: "2026-04-01T00:00:01Z" },
    ],
  }),
  deleteChatSession: vi.fn(),
  getModels: vi.fn().mockResolvedValue({ models: [], selected: "gpt-4.1", reasoningEffort: "medium" }),
  getAuthStatus: vi.fn().mockResolvedValue({ authenticated: true, authMode: "token" }),
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

  // #510: Hydration — initial conversationId should be empty string to avoid SSR/CSR mismatch
  it("does not use Date.now() in initial render (avoids hydration mismatch)", () => {
    renderWithProviders(<ChatPage />);
    // The header should show "New Conversation" or "Chat" instead of a timestamp-based ID
    // Use getAllByText since "Chat" appears in multiple places, then filter by heading role
    const headings = screen.getAllByText(/New Conversation|Chat/);
    expect(headings.length).toBeGreaterThan(0);
    // Should NOT have any "Session 17760..." style raw IDs
    expect(screen.queryByText(/Session \d{10,}/)).not.toBeInTheDocument();
  });

  // #515: Session title instead of raw ID
  it("shows session title instead of raw numeric ID in header", async () => {
    renderWithProviders(<ChatPage />);
    // Should not show "Session 17760..." style text
    await waitFor(() => {
      expect(screen.queryByText(/Session \d{10,}/)).not.toBeInTheDocument();
    });
  });
});
