"use client";

import { useTheme } from "next-themes";

export function useMonacoTheme(): "vs-dark" | "vs" {
  const { resolvedTheme } = useTheme();
  return resolvedTheme === "dark" ? "vs-dark" : "vs";
}
