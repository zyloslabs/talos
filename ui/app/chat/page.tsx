"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSocket } from "@/lib/socket";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { SessionSidebar } from "@/components/talos/session-sidebar";
import { ChatHeader } from "@/components/talos/chat-header";
import { RagContextIndicator } from "@/components/talos/rag-context-indicator";
import { Send, Bot, User, Loader2 } from "lucide-react";

type ContextSource = { filePath: string; score: number; snippet?: string };

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  sources?: ContextSource[];
};

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState(() => `chat-${Date.now()}`);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { subscribe, emit, isConnected } = useSocket();

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    const unsubs = [
      subscribe<{ conversationId: string }>("chat:stream:start", () => {
        setIsStreaming(true);
        setMessages((prev) => [...prev, {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: "",
          timestamp: new Date(),
        }]);
      }),
      subscribe<{ delta: string; conversationId: string }>("chat:stream:delta", (data) => {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant") {
            return [...prev.slice(0, -1), { ...last, content: last.content + data.delta }];
          }
          return prev;
        });
      }),
      subscribe<{ conversationId: string; sources?: ContextSource[] }>("chat:stream:end", (data) => {
        setIsStreaming(false);
        if (data.sources && data.sources.length > 0) {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant") {
              return [...prev.slice(0, -1), { ...last, sources: data.sources }];
            }
            return prev;
          });
        }
      }),
    ];
    return () => unsubs.forEach((unsub) => unsub());
  }, [subscribe]);

  const sendMessage = () => {
    if (!input.trim() || isStreaming) return;
    const msg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, msg]);
    emit("chat:message", { message: input.trim(), conversationId });
    setInput("");
  };

  const handleNewChat = () => {
    setMessages([]);
    setConversationId(`chat-${Date.now()}`);
  };

  const handleSelectSession = (id: string) => {
    setConversationId(id);
    setMessages([]);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex">
        {sidebarOpen && (
          <SessionSidebar
            activeSessionId={conversationId}
            onSelectSession={handleSelectSession}
            onNewChat={handleNewChat}
          />
        )}
        <div className="flex-1 flex flex-col">
          <ChatHeader
            conversationId={conversationId}
            onClearChat={handleNewChat}
          />
          <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full px-4">
            <div className="flex-1 overflow-y-auto py-4 space-y-4">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <Bot className="h-16 w-16 mb-4 opacity-30" />
                  <h2 className="text-xl font-medium">Talos AI Chat</h2>
                  <p className="text-sm">Send a message to start a conversation</p>
                </div>
              )}
              {messages.map((msg) => (
                <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`flex gap-3 max-w-[80%] ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                    <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-muted">
                      {msg.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                    </div>
                    <div>
                      <Card className={msg.role === "user" ? "bg-primary text-primary-foreground" : ""}>
                        <CardContent className="p-3">
                          <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        </CardContent>
                      </Card>
                      {msg.sources && msg.sources.length > 0 && (
                        <RagContextIndicator sources={msg.sources} />
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {isStreaming && messages[messages.length - 1]?.content === "" && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center bg-muted">
                    <Bot className="h-4 w-4" />
                  </div>
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            <div className="border-t py-4">
              <div className="flex gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                  placeholder={isConnected ? "Type a message..." : "Connecting..."}
                  disabled={!isConnected || isStreaming}
                  className="flex-1"
                />
                <Button onClick={sendMessage} disabled={!input.trim() || isStreaming || !isConnected}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
