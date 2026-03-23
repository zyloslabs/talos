"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getChatSessions, deleteChatSession, type ChatSession } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageSquare, Trash2, Search, X } from "lucide-react";

interface SessionSidebarProps {
  activeSessionId?: string;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
}

export function SessionSidebar({ activeSessionId, onSelectSession, onNewChat }: SessionSidebarProps) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const { data: sessions } = useQuery({ queryKey: ["sessions"], queryFn: getChatSessions, refetchInterval: 10_000 });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteChatSession(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }),
  });

  const filtered = sessions?.filter((s) =>
    !search || s.preview.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="w-64 border-r flex flex-col h-full bg-background">
      <div className="p-3 border-b">
        <Button className="w-full" size="sm" onClick={onNewChat}>
          <MessageSquare className="h-4 w-4 mr-1" />New Chat
        </Button>
      </div>

      <div className="p-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search sessions..."
            className="pl-8 h-8 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setSearch("")}>
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="space-y-0.5 p-2">
          {filtered?.map((session) => (
            <SessionItem
              key={session.id}
              session={session}
              isActive={session.id === activeSessionId}
              onSelect={() => onSelectSession(session.id)}
              onDelete={() => deleteMut.mutate(session.id)}
            />
          ))}
          {(!filtered || filtered.length === 0) && (
            <p className="text-xs text-muted-foreground text-center py-4">No sessions</p>
          )}
        </div>
      </div>
    </div>
  );
}

function SessionItem({ session, isActive, onSelect, onDelete }: {
  session: ChatSession;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const timeAgo = formatTimeAgo(session.lastMessageAt);

  return (
    <div
      className={`group flex items-start gap-2 rounded-md px-2 py-1.5 cursor-pointer text-sm transition-colors ${
        isActive ? "bg-accent text-accent-foreground" : "hover:bg-muted"
      }`}
      onClick={onSelect}
    >
      <MessageSquare className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <p className="truncate text-xs font-medium">{session.preview || "Empty session"}</p>
        <p className="text-[10px] text-muted-foreground">{session.messageCount} msgs · {timeAgo}</p>
      </div>
      <button
        className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-destructive transition-opacity"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
