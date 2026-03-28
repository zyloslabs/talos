import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useMonacoTheme } from "@/lib/monaco";
import { useTheme } from "next-themes";

vi.mock("next-themes", () => ({
  useTheme: vi.fn(() => ({ resolvedTheme: "dark" })),
}));

describe("useMonacoTheme", () => {
  it('returns "vs-dark" when resolvedTheme is dark', () => {
    vi.mocked(useTheme).mockReturnValue({
      resolvedTheme: "dark",
      theme: "dark",
      setTheme: vi.fn(),
      themes: [],
      systemTheme: "dark",
    });
    const { result } = renderHook(() => useMonacoTheme());
    expect(result.current).toBe("vs-dark");
  });

  it('returns "vs" when resolvedTheme is light', () => {
    vi.mocked(useTheme).mockReturnValue({
      resolvedTheme: "light",
      theme: "light",
      setTheme: vi.fn(),
      themes: [],
      systemTheme: "light",
    });
    const { result } = renderHook(() => useMonacoTheme());
    expect(result.current).toBe("vs");
  });

  it('returns "vs" when resolvedTheme is undefined', () => {
    vi.mocked(useTheme).mockReturnValue({
      resolvedTheme: undefined,
      theme: undefined,
      setTheme: vi.fn(),
      themes: [],
      systemTheme: undefined,
    });
    const { result } = renderHook(() => useMonacoTheme());
    expect(result.current).toBe("vs");
  });
});
