"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Sparkles, ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { explainTest } from "@/lib/api";

interface TestExplainPanelProps {
  testId: string;
  selectedCode?: string;
}

export function TestExplainPanel({ testId, selectedCode }: TestExplainPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (selection?: string) => explainTest(testId, selection),
    onSuccess: (data) => {
      setExplanation(data.explanation);
    },
  });

  const handleExplainTest = () => {
    mutation.mutate(undefined);
  };

  const handleExplainSelection = () => {
    mutation.mutate(selectedCode);
  };

  return (
    <Card className="flex flex-col overflow-hidden h-full">
      <CardHeader
        className="flex flex-row items-center justify-between border-b px-4 py-2 space-y-0 cursor-pointer select-none"
        onClick={() => setIsOpen((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-500" />
          <span className="text-sm font-medium">AI Explanation</span>
        </div>
        {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </CardHeader>

      {isOpen && (
        <CardContent className="p-4 flex flex-col gap-3 flex-1 overflow-auto">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="flex-1 text-xs"
              onClick={handleExplainTest}
              disabled={mutation.isPending}
            >
              <Sparkles className="mr-1 h-3 w-3" />
              Explain Test
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 text-xs"
              onClick={handleExplainSelection}
              disabled={mutation.isPending || !selectedCode}
            >
              <Sparkles className="mr-1 h-3 w-3" />
              Explain Selection
            </Button>
          </div>

          {mutation.isPending && (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/6" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          )}

          {mutation.isError && !mutation.isPending && (
            <p className="text-sm text-destructive">
              Unable to get explanation. Check Copilot is configured.
            </p>
          )}

          {explanation && !mutation.isPending && (
            <p
              className={cn(
                "text-sm leading-relaxed text-foreground",
                "animate-in fade-in duration-300"
              )}
            >
              {explanation}
            </p>
          )}

          <div className="mt-auto pt-2 border-t">
            <p className="text-xs text-muted-foreground text-center">Powered by GitHub Copilot</p>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
