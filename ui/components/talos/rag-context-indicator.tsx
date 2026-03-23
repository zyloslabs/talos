"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Database, ChevronDown, ChevronUp } from "lucide-react";

interface ContextSource {
  filePath: string;
  score: number;
  snippet?: string;
}

interface RagContextIndicatorProps {
  sources: ContextSource[];
}

export function RagContextIndicator({ sources }: RagContextIndicatorProps) {
  const [expanded, setExpanded] = useState(false);

  if (!sources.length) return null;

  return (
    <div className="mt-1">
      <button
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <Database className="h-3 w-3" />
        <span>{sources.length} context source{sources.length !== 1 ? "s" : ""}</span>
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {expanded && (
        <div className="mt-1.5 space-y-1 pl-4 border-l-2 border-muted">
          {sources.map((src, i) => (
            <div key={i} className="text-xs">
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-muted-foreground truncate max-w-[200px]">{src.filePath}</span>
                <Badge variant="outline" className="text-[10px] px-1 py-0">
                  {(src.score * 100).toFixed(0)}%
                </Badge>
              </div>
              {src.snippet && (
                <p className="text-muted-foreground line-clamp-2 mt-0.5">{src.snippet}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
