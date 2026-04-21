"use client";

import { Badge } from "@/components/ui/badge";
import { Database, Sparkles, FileWarning, Bot } from "lucide-react";

/**
 * `generationPath` values returned by `POST /api/talos/tests/generate`.
 *
 * - `rag-backed` — TestGenerator with RAG context (preferred)
 * - `raw-copilot` — direct Copilot LLM, no RAG
 * - `raw` — alias historically used in some contracts (treated as raw-copilot)
 * - `skeleton` — no generator available; only a stub was produced. Surfaced
 *   to make the audit gap E3 visible in the UI.
 */
export type GenerationPath = "rag-backed" | "raw-copilot" | "raw" | "skeleton";

const META: Record<
  GenerationPath,
  { label: string; tone: "success" | "secondary" | "destructive" | "outline"; Icon: React.ElementType }
> = {
  "rag-backed": { label: "RAG", tone: "success", Icon: Database },
  "raw-copilot": { label: "Raw", tone: "secondary", Icon: Bot },
  raw: { label: "Raw", tone: "secondary", Icon: Bot },
  skeleton: { label: "Skeleton", tone: "destructive", Icon: FileWarning },
};

export interface GenerationPathBadgeProps {
  path: GenerationPath | string | null | undefined;
  /** Optional chunk count, only meaningful for `rag-backed`. */
  chunkCount?: number | null;
  className?: string;
}

/**
 * Compact badge that visualises which generation path produced a test.
 *
 * Surfaces audit gap E3 (epic #537 / sub-issue #552). Renders nothing if the
 * path is unknown so the badge degrades gracefully on legacy responses.
 */
export function GenerationPathBadge({ path, chunkCount, className }: GenerationPathBadgeProps) {
  if (!path) return null;
  const meta = META[path as GenerationPath];
  if (!meta) {
    return (
      <Badge variant="outline" className={className} data-testid="generation-path-badge" data-path={path}>
        <Sparkles className="mr-1 h-3 w-3" />
        {String(path)}
      </Badge>
    );
  }
  const { Icon } = meta;
  return (
    <Badge
      variant={meta.tone}
      className={className}
      data-testid="generation-path-badge"
      data-path={path}
      aria-label={`Generation path: ${meta.label}`}
    >
      <Icon className="mr-1 h-3 w-3" />
      {meta.label}
      {path === "rag-backed" && typeof chunkCount === "number" && chunkCount >= 0 ? (
        <span className="ml-1 opacity-80">· {chunkCount} chunks</span>
      ) : null}
    </Badge>
  );
}
