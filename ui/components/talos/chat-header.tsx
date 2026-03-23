"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getModels, type ModelInfo } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { InlineModelPicker } from "./inline-model-picker";
import { GenerateTestDialog } from "./generate-test-dialog";
import { Sparkles, RotateCcw, Settings2 } from "lucide-react";

interface ChatHeaderProps {
  conversationId: string;
  onClearChat: () => void;
  applicationId?: string;
}

export function ChatHeader({ conversationId, onClearChat, applicationId }: ChatHeaderProps) {
  const [selectedModel, setSelectedModel] = useState<string | undefined>();
  const [generateOpen, setGenerateOpen] = useState(false);

  return (
    <div className="border-b px-4 py-2 flex items-center justify-between bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-medium truncate max-w-[200px]">
          {conversationId.replace(/^chat-/, "Session ")}
        </h2>
        <InlineModelPicker value={selectedModel} onChange={setSelectedModel} />
      </div>

      <div className="flex items-center gap-1">
        {applicationId && (
          <>
            <Button variant="ghost" size="sm" onClick={() => setGenerateOpen(true)}>
              <Sparkles className="h-3.5 w-3.5 mr-1" />Generate Test
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
