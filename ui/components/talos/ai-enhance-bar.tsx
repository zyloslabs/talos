"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { InlineModelPicker } from "./inline-model-picker";
import { Button } from "@/components/ui/button";
import { enhanceText } from "@/lib/api";
import { Sparkles, Loader2 } from "lucide-react";

export function AiEnhanceBar({
  text,
  onEnhanced,
  context,
}: {
  text: string;
  onEnhanced: (text: string) => void;
  context?: string;
}) {
  const [model, setModel] = useState("");

  const enhanceMut = useMutation({
    mutationFn: () => enhanceText({ text, model: model || undefined, context }),
    onSuccess: (data) => onEnhanced(data.enhanced),
  });

  return (
    <div className="flex items-center gap-2">
      <InlineModelPicker value={model} onChange={setModel} />
      <Button
        size="sm"
        variant="outline"
        onClick={() => enhanceMut.mutate()}
        disabled={enhanceMut.isPending || !text.trim()}
      >
        {enhanceMut.isPending ? (
          <Loader2 className="h-3 w-3 animate-spin mr-1" />
        ) : (
          <Sparkles className="h-3 w-3 mr-1" />
        )}
        AI Enhance
      </Button>
    </div>
  );
}
