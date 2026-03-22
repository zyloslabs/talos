import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
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

describe("ChatPage", () => {
  it("renders empty state", () => {
    render(<ChatPage />);
    expect(screen.getByText("Talos AI Chat")).toBeInTheDocument();
    expect(screen.getByText("Send a message to start a conversation")).toBeInTheDocument();
  });

  it("renders message input", () => {
    render(<ChatPage />);
    expect(screen.getByPlaceholderText("Type a message...")).toBeInTheDocument();
  });

  it("renders send button", () => {
    render(<ChatPage />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
  });
});
