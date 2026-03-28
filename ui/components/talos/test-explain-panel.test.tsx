import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TestExplainPanel } from "@/components/talos/test-explain-panel";

vi.mock("@/lib/api", () => ({
  explainTest: vi.fn(),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "dark" }),
}));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("TestExplainPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders collapsed by default", () => {
    wrap(<TestExplainPanel testId="t-1" />);
    expect(screen.getByText("AI Explanation")).toBeInTheDocument();
    expect(screen.queryByText("Explain Test")).not.toBeInTheDocument();
  });

  it("expands when header is clicked", () => {
    wrap(<TestExplainPanel testId="t-1" />);
    fireEvent.click(screen.getByText("AI Explanation"));
    expect(screen.getByText("Explain Test")).toBeInTheDocument();
    expect(screen.getByText("Explain Selection")).toBeInTheDocument();
  });

  it("disables Explain Selection when no selectedCode", () => {
    wrap(<TestExplainPanel testId="t-1" />);
    fireEvent.click(screen.getByText("AI Explanation"));
    const btn = screen.getByText("Explain Selection").closest("button");
    expect(btn).toBeDisabled();
  });

  it("enables Explain Selection when selectedCode is provided", () => {
    wrap(<TestExplainPanel testId="t-1" selectedCode="const x = 1;" />);
    fireEvent.click(screen.getByText("AI Explanation"));
    const btn = screen.getByText("Explain Selection").closest("button");
    expect(btn).not.toBeDisabled();
  });

  it("shows explanation on successful API call", async () => {
    const { explainTest } = await import("@/lib/api");
    vi.mocked(explainTest).mockResolvedValue({ explanation: "This test verifies login flow." });

    wrap(<TestExplainPanel testId="t-1" />);
    fireEvent.click(screen.getByText("AI Explanation"));
    fireEvent.click(screen.getByText("Explain Test"));

    await waitFor(() => {
      expect(screen.getByText("This test verifies login flow.")).toBeInTheDocument();
    });
  });

  it("shows error message on failed API call", async () => {
    const { explainTest } = await import("@/lib/api");
    vi.mocked(explainTest).mockRejectedValue(new Error("Network error"));

    wrap(<TestExplainPanel testId="t-1" />);
    fireEvent.click(screen.getByText("AI Explanation"));
    fireEvent.click(screen.getByText("Explain Test"));

    await waitFor(() => {
      expect(screen.getByText(/Unable to get explanation/i)).toBeInTheDocument();
    });
  });

  it("shows 'Powered by GitHub Copilot' footer when expanded", () => {
    wrap(<TestExplainPanel testId="t-1" />);
    fireEvent.click(screen.getByText("AI Explanation"));
    expect(screen.getByText("Powered by GitHub Copilot")).toBeInTheDocument();
  });

  it("collapses when header is clicked again", () => {
    wrap(<TestExplainPanel testId="t-1" />);
    fireEvent.click(screen.getByText("AI Explanation"));
    expect(screen.getByText("Explain Test")).toBeInTheDocument();
    fireEvent.click(screen.getByText("AI Explanation"));
    expect(screen.queryByText("Explain Test")).not.toBeInTheDocument();
  });

  it("calls explainTest with selection when Explain Selection is clicked", async () => {
    const { explainTest } = await import("@/lib/api");
    vi.mocked(explainTest).mockResolvedValue({ explanation: "This line clicks a button." });

    wrap(<TestExplainPanel testId="t-1" selectedCode="await page.click('button')" />);
    fireEvent.click(screen.getByText("AI Explanation"));
    fireEvent.click(screen.getByText("Explain Selection"));

    await waitFor(() => {
      expect(vi.mocked(explainTest)).toHaveBeenCalledWith("t-1", "await page.click('button')");
    });
  });
});
