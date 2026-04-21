import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { VaultManager } from "@/components/talos/vault-manager";

vi.mock("@/lib/api", () => ({
  getVaultRoles: vi.fn(),
  getApplications: vi.fn(),
  createVaultRole: vi.fn(),
  updateVaultRole: vi.fn(),
  deleteVaultRole: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/utils", async () => {
  const actual = (await vi.importActual<typeof import("@/lib/utils")>("@/lib/utils"));
  return {
    ...actual,
    formatRelativeTime: () => "just now",
  };
});

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const SAMPLE_APP = {
  id: "app-1",
  name: "Demo App",
  description: "",
  repositoryUrl: "https://github.com/a/b",
  baseUrl: "https://demo.example.com",
  status: "active" as const,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

const SAMPLE_ROLE = {
  id: "role-1",
  applicationId: "app-1",
  name: "Admin User",
  roleType: "admin" as const,
  description: "Primary admin",
  usernameRef: "vault:app/admin/username",
  passwordRef: "vault:app/admin/password",
  additionalRefs: { totp: "vault:app/admin/totp" },
  isActive: true,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-02T00:00:00Z",
};

describe("VaultManager — EditVaultRoleDialog (#531)", () => {
  beforeEach(async () => {
    const api = await import("@/lib/api");
    vi.clearAllMocks();
    vi.mocked(api.getApplications).mockResolvedValue([SAMPLE_APP]);
    vi.mocked(api.getVaultRoles).mockResolvedValue([SAMPLE_ROLE]);
    vi.mocked(api.updateVaultRole).mockResolvedValue(SAMPLE_ROLE);
  });

  it("opens edit dialog pre-populated with role values when Edit clicked", async () => {
    wrap(<VaultManager />);
    const editButton = await screen.findByRole("button", { name: /edit/i });
    fireEvent.click(editButton);

    expect(await screen.findByText("Edit Vault Role")).toBeInTheDocument();
    // Form fields hydrated from role
    expect(screen.getByDisplayValue("Admin User")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Primary admin")).toBeInTheDocument();
    expect(screen.getByDisplayValue("vault:app/admin/username")).toBeInTheDocument();
    expect(screen.getByDisplayValue("vault:app/admin/password")).toBeInTheDocument();
    // additionalRefs serialized as JSON
    expect(screen.getByDisplayValue(/totp/)).toBeInTheDocument();
  });

  it("calls updateVaultRole with edited values, preserving id and additionalRefs", async () => {
    const api = await import("@/lib/api");
    wrap(<VaultManager />);
    fireEvent.click(await screen.findByRole("button", { name: /edit/i }));
    await screen.findByText("Edit Vault Role");

    const nameInput = screen.getByDisplayValue("Admin User");
    fireEvent.change(nameInput, { target: { value: "Renamed Admin" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(vi.mocked(api.updateVaultRole)).toHaveBeenCalledWith(
        "role-1",
        expect.objectContaining({
          name: "Renamed Admin",
          usernameRef: "vault:app/admin/username",
          passwordRef: "vault:app/admin/password",
          additionalRefs: { totp: "vault:app/admin/totp" },
        })
      );
    });
    // Audit fields are NOT sent — server controls them
    const lastCallData = vi.mocked(api.updateVaultRole).mock.calls[0][1];
    expect(lastCallData).not.toHaveProperty("createdAt");
    expect(lastCallData).not.toHaveProperty("updatedAt");
    expect(lastCallData).not.toHaveProperty("id");
  });

  it("rejects malformed additionalRefs JSON without calling the API", async () => {
    const api = await import("@/lib/api");
    wrap(<VaultManager />);
    fireEvent.click(await screen.findByRole("button", { name: /edit/i }));
    await screen.findByText("Edit Vault Role");

    const refsTextarea = screen.getByDisplayValue(/totp/);
    fireEvent.change(refsTextarea, { target: { value: "{ not valid json" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(vi.mocked(api.updateVaultRole)).not.toHaveBeenCalled();
    // Error message is rendered in the dedicated error element
    await waitFor(() => {
      expect(screen.getByTestId("vault-role-refs-error")).toBeInTheDocument();
    });
  });

  it("rejects additionalRefs whose values are not strings", async () => {
    const api = await import("@/lib/api");
    wrap(<VaultManager />);
    fireEvent.click(await screen.findByRole("button", { name: /edit/i }));
    await screen.findByText("Edit Vault Role");

    const refsTextarea = screen.getByDisplayValue(/totp/);
    fireEvent.change(refsTextarea, { target: { value: '{ "k": 123 }' } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(vi.mocked(api.updateVaultRole)).not.toHaveBeenCalled();
    expect(await screen.findByTestId("vault-role-refs-error")).toHaveTextContent(
      /must be a string/i
    );
  });

  it("Save Changes button disabled when required fields blank", async () => {
    wrap(<VaultManager />);
    fireEvent.click(await screen.findByRole("button", { name: /edit/i }));
    await screen.findByText("Edit Vault Role");

    const nameInput = screen.getByDisplayValue("Admin User");
    fireEvent.change(nameInput, { target: { value: "   " } });
    const saveBtn = screen.getByRole("button", { name: /save changes/i });
    expect(saveBtn).toBeDisabled();
  });
});

describe("VaultManager — mutation toasts (#534 review)", () => {
  beforeEach(async () => {
    const api = await import("@/lib/api");
    const { toast } = await import("sonner");
    vi.clearAllMocks();
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
    vi.mocked(api.getApplications).mockResolvedValue([SAMPLE_APP]);
    vi.mocked(api.getVaultRoles).mockResolvedValue([SAMPLE_ROLE]);
  });

  it("emits success toast when updateVaultRole succeeds", async () => {
    const api = await import("@/lib/api");
    const { toast } = await import("sonner");
    vi.mocked(api.updateVaultRole).mockResolvedValue(SAMPLE_ROLE);

    wrap(<VaultManager />);
    fireEvent.click(await screen.findByRole("button", { name: /edit/i }));
    await screen.findByText("Edit Vault Role");
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Vault role updated"));
    expect(vi.mocked(toast.error)).not.toHaveBeenCalled();
  });

  it("emits error toast when updateVaultRole fails", async () => {
    const api = await import("@/lib/api");
    const { toast } = await import("sonner");
    vi.mocked(api.updateVaultRole).mockRejectedValue(new Error("boom"));

    wrap(<VaultManager />);
    fireEvent.click(await screen.findByRole("button", { name: /edit/i }));
    await screen.findByText("Edit Vault Role");
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() =>
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
        "Failed to update vault role",
        expect.objectContaining({ description: "boom" }),
      ),
    );
    expect(vi.mocked(toast.success)).not.toHaveBeenCalled();
  });

  it("emits success toast when deleteVaultRole succeeds", async () => {
    const api = await import("@/lib/api");
    const { toast } = await import("sonner");
    vi.mocked(api.deleteVaultRole).mockResolvedValue(null);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    wrap(<VaultManager />);
    const deleteBtn = await screen.findByRole("button", { name: /delete/i });
    fireEvent.click(deleteBtn);

    await waitFor(() => expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Vault role deleted"));
    confirmSpy.mockRestore();
  });

  it("emits error toast when deleteVaultRole fails", async () => {
    const api = await import("@/lib/api");
    const { toast } = await import("sonner");
    vi.mocked(api.deleteVaultRole).mockRejectedValue(new Error("nope"));
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    wrap(<VaultManager />);
    const deleteBtn = await screen.findByRole("button", { name: /delete/i });
    fireEvent.click(deleteBtn);

    await waitFor(() =>
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
        "Failed to delete vault role",
        expect.objectContaining({ description: "nope" }),
      ),
    );
    confirmSpy.mockRestore();
  });
});
