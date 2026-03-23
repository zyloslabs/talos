"use client";

import { useQuery } from "@tanstack/react-query";
import { getModels, type ModelInfo } from "@/lib/api";

export interface InlineModelPickerProps {
  value?: string;
  onChange: (model: string) => void;
  className?: string;
}

export function InlineModelPicker({ value, onChange, className }: InlineModelPickerProps) {
  const { data } = useQuery({ queryKey: ["models"], queryFn: getModels, staleTime: 60_000 });
  const models = (data as ModelInfo | undefined)?.models ?? [];
  const selected = value ?? data?.selected ?? "";

  if (models.length === 0) {
    return <span className="text-xs text-muted-foreground">No models</span>;
  }

  return (
    <select
      value={selected}
      onChange={(e) => onChange(e.target.value)}
      className={`text-xs border rounded px-2 py-1 bg-background ${className ?? ""}`}
    >
      <option value="">Default ({data?.selected})</option>
      {models.map((m) => (
        <option key={m.id} value={m.id}>{m.id}</option>
      ))}
    </select>
  );
}
