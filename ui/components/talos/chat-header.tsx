"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAuthStatus } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { InlineModelPicker } from "./inline-model-picker";
import { GenerateTestDialog } from "./generate-test-dialog";
import { Sparkles, RotateCcw } from "lucide-react";

interface ChatHeaderProps {
  conversationId: string;
  onClearChat: () => void;
  applicationId?: string;
  selectedModel?: string;
  onModelChange?: (model: string) => void;
}

export function ChatHeader({
  conversationId,
  onClearChat,
  applicationId,
  selectedModel,
  onModelChange,
}: ChatHeaderProps) {
  const [generateOpen, setGenerateOpen] = useState(false);

  const { data: authData } = useQuery({
    queryKey: ["authStatus"],
    queryFn: getAuthStatus,
    refetchInterval: 10_000,
    staleTime: 5_000,
  });
  const isConnected = authData?.authenticated ?? false;

  return (
    <div className="border-b px-4 py-2 flex items-center justify-between bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-medium truncate max-w-[200px]">{conversationId.replace(/^chat-/, "Session ")}</h2>
        <span
          title={isConnected ? "Copilot connected" : "Copilot disconnected"}
          className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${isConnected ? "bg-green-500" : "bg-red-500"}`}
        />
        <InlineModelPicker value={selectedModel} onChange={onModelChange ?? (() => {})} />
      </div>

      <div className="flex items-center gap-1">
        {applicationId && (
          <>
            <Button variant="ghost" size="sm" onClick={() => setGenerateOpen(true)}>
              <Sparkles className="h-3.5 w-3.5 mr-1" />
              Generate Test
            </Button>
            <GenerateTestDialog
              open={generateOpen}
              onClose={() => setGenerateOpen(false)}
              applicationId={applicationId}
            />
          </>
        )}
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClearChat} title="Clear chat">
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
