import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AdminPage from "./page";

beforeAll(() => {
  // jsdom doesn't implement IntersectionObserver
  global.IntersectionObserver = class {
    readonly root = null;
    readonly rootMargin = "";
    readonly thresholds: ReadonlyArray<number> = [];
    constructor() {}
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] { return []; }
  };
});

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
  testAuthConnection: vi.fn().mockResolvedValue({ connected: true, models: 3 }),
  getMcpServers: vi.fn().mockResolvedValue([]),
  createMcpServer: vi.fn(),
  deleteMcpServer: vi.fn(),
  getEnvEntries: vi.fn().mockResolvedValue({ entries: [], warnings: {} }),
  setEnvEntry: vi.fn(),
  deleteEnvEntry: vi.fn(),
  getEnvRaw: vi.fn(),
  validateEnv: vi.fn().mockResolvedValue({ valid: true, missing: [] }),
  getKnowledgeStats: vi.fn().mockResolvedValue({ documentCount: 0, chunkCount: 0, lastIndexedAt: null }),
  getKnowledgeDocuments: vi.fn().mockResolvedValue([]),
  getKnowledgeConfig: vi.fn().mockResolvedValue({ vectorDbPath: "", collectionName: "", searchMode: "hybrid", minScore: 0.5 }),
  searchKnowledge: vi.fn(),
  reindexKnowledge: vi.fn(),
  deleteKnowledgeDocument: vi.fn(),
  getModelsHealth: vi.fn().mockResolvedValue({ healthy: true, authenticated: true, latencyMs: 50 }),
  enhanceText: vi.fn().mockResolvedValue({ enhanced: "enhanced text" }),
}));

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("AdminPage", () => {
  it("renders page title", () => {
    renderWithProviders(<AdminPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Administration" })).toBeInTheDocument();
  });

  it("renders all section headings", () => {
    renderWithProviders(<AdminPage />);
    expect(screen.getAllByText("Authentication").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Personality").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Models").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("MCP Servers").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Environment").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Knowledge Base").length).toBeGreaterThanOrEqual(1);
  });

  it("renders auth section content", () => {
    renderWithProviders(<AdminPage />);
    expect(screen.getByText("Connect Talos to GitHub Copilot")).toBeInTheDocument();
  });
});
