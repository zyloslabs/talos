"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SectionCard } from "@/components/ui/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { EnvPanel } from "@/components/talos/env-panel";
import { KnowledgePanel } from "@/components/talos/knowledge-panel";
import {
  getPersonalities, createPersonality, updatePersonality, activatePersonality,
  getModels, setSelectedModel, setReasoningEffort,
  getAuthStatus, startDeviceAuth, testAuthConnection,
  getMcpServers, createMcpServer, deleteMcpServer,
  type Personality, type ModelInfo, type McpServer,
} from "@/lib/api";
import { AiEnhanceBar } from "@/components/talos/ai-enhance-bar";
import {
  Shield, Brain, Server, User, KeyRound, Database, ChevronRight,
} from "lucide-react";

// ── Sidebar Navigation (#213) ─────────────────────────────────────────────────

const adminSections = [
  { id: "auth", label: "Authentication", icon: Shield },
  { id: "personality", label: "Personality", icon: User },
  { id: "models", label: "Models", icon: Brain },
  { id: "mcp", label: "MCP Servers", icon: Server },
  { id: "env", label: "Environment", icon: KeyRound },
  { id: "knowledge", label: "Knowledge Base", icon: Database },
];

function AdminSidebar({ activeSection }: { activeSection: string }) {
  return (
    <aside className="sticky top-20 w-48 shrink-0 hidden lg:block">
      <nav className="space-y-1">
        {adminSections.map((s) => {
          const isActive = activeSection === s.id;
          return (
            <a
              key={s.id}
              href={`#${s.id}`}
              className={`flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${
                isActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <s.icon className="h-4 w-4" />
              <span>{s.label}</span>
              {isActive && <ChevronRight className="h-3 w-3 ml-auto" />}
            </a>
          );
        })}
      </nav>
    </aside>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [activeSection, setActiveSection] = useState("auth");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.target.id) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: "-20% 0px -70% 0px" }
    );
    for (const s of adminSections) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 lg:px-12">
      <header className="mb-8">
        <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">Talos</p>
        <h1 className="mt-1 text-3xl font-semibold text-foreground">Administration</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Authentication, personality, models, MCP servers, and environment configuration.
        </p>
      </header>
      <div className="flex gap-8">
        <AdminSidebar activeSection={activeSection} />
        <div className="flex-1 space-y-6 min-w-0">
            <SectionCard id="auth" title="Authentication" description="Connect Talos to GitHub Copilot" icon={<Shield className="h-5 w-5" />} defaultOpen>
              <AuthPanel />
            </SectionCard>
            <SectionCard id="personality" title="System Personality" description="Configure the AI assistant persona" icon={<User className="h-5 w-5" />}>
              <PersonalityPanel />
            </SectionCard>
            <SectionCard id="models" title="Model Configuration" description="Select AI model and reasoning effort" icon={<Brain className="h-5 w-5" />}>
              <ModelsPanel />
            </SectionCard>
            <SectionCard id="mcp" title="MCP Servers" description="Manage Model Context Protocol servers" icon={<Server className="h-5 w-5" />}>
              <McpPanel />
            </SectionCard>
            <SectionCard id="env" title="Environment Variables" description="Configure .env settings for Talos" icon={<KeyRound className="h-5 w-5" />}>
              <EnvPanel />
            </SectionCard>
            <SectionCard id="knowledge" title="Knowledge Base" description="RAG document index and vector search" icon={<Database className="h-5 w-5" />}>
              <KnowledgePanel />
            </SectionCard>
          </div>
        </div>
      </div>
  );
}

// ── Auth Panel ────────────────────────────────────────────────────────────────

function AuthPanel() {
  const { data: authStatus } = useQuery({ queryKey: ["auth-status"], queryFn: getAuthStatus });
  const authMutation = useMutation({ mutationFn: startDeviceAuth });
  const testMutation = useMutation({ mutationFn: testAuthConnection });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Badge variant={authStatus?.authenticated ? "default" : "secondary"}>
          {authStatus?.authenticated ? "Authenticated" : "Not Authenticated"}
        </Badge>
        {authStatus?.authMode === "token" && (
          <Badge variant="outline">API Key</Badge>
        )}
      </div>

      {/* Token-based auth info */}
      {authStatus?.authMode === "token" && (
        <div className="p-4 bg-muted/50 rounded-lg space-y-3">
          <p className="text-sm text-muted-foreground">
            Authenticated via <code className="text-xs font-mono bg-muted px-1 py-0.5 rounded">GITHUB_TOKEN</code> or <code className="text-xs font-mono bg-muted px-1 py-0.5 rounded">COPILOT_GITHUB_TOKEN</code> environment variable.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending}
          >
            {testMutation.isPending ? "Testing..." : "Test Connection"}
          </Button>
          {testMutation.data && (
            <div className={`text-sm ${testMutation.data.connected ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
              {testMutation.data.connected
                ? `Connected — ${testMutation.data.models} model(s) available`
                : `Failed: ${testMutation.data.error}`}
            </div>
          )}
        </div>
      )}

      {/* Device auth fallback */}
      {authStatus?.authMode !== "token" && !authStatus?.authenticated && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Set <code className="text-xs font-mono bg-muted px-1 py-0.5 rounded">GITHUB_TOKEN</code> in Environment Variables for API key auth, or use device auth below.
          </p>
          <Button onClick={() => authMutation.mutate()} disabled={authMutation.isPending}>
            {authMutation.isPending ? "Starting..." : "Start Device Auth"}
          </Button>
          {authMutation.data && (
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <p className="text-sm">Open: <a href={authMutation.data.verificationUri} target="_blank" rel="noreferrer" className="text-primary underline">{authMutation.data.verificationUri}</a></p>
              <p className="text-sm">Enter code: <code className="font-mono text-lg font-bold">{authMutation.data.userCode}</code></p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Personality Panel ─────────────────────────────────────────────────────────

function PersonalityPanel() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["personality"], queryFn: getPersonalities });
  const [newName, setNewName] = useState("");
  const [newPrompt, setNewPrompt] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState("");

  const createMut = useMutation({
    mutationFn: () => createPersonality(newName, newPrompt),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["personality"] }); setNewName(""); setNewPrompt(""); },
  });
  const updateMut = useMutation({
    mutationFn: () => updatePersonality(editId!, editPrompt),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["personality"] }); setEditId(null); },
  });
  const activateMut = useMutation({
    mutationFn: (id: string) => activatePersonality(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["personality"] }),
  });

  return (
    <div className="space-y-4">
      {data?.personalities.map((p: Personality) => (
        <div key={p.id} className="border rounded p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-medium">{p.name}</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{p.isActive ? "Active" : ""}</span>
              <Switch checked={p.isActive} onCheckedChange={() => activateMut.mutate(p.id)} />
            </div>
          </div>
          {editId === p.id ? (
            <div className="space-y-2">
              <textarea className="w-full min-h-[100px] p-2 border rounded text-sm font-mono bg-background" value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)} />
              <AiEnhanceBar text={editPrompt} onEnhanced={setEditPrompt} context="system personality prompt" />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => updateMut.mutate()}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground cursor-pointer" onClick={() => { setEditId(p.id); setEditPrompt(p.systemPrompt); }}>
              {p.systemPrompt.substring(0, 200)}{p.systemPrompt.length > 200 ? "..." : ""}
            </p>
          )}
        </div>
      ))}
      <div className="border-t pt-4 space-y-2">
        <h4 className="text-sm font-medium">Add Personality</h4>
        <Input placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <textarea className="w-full min-h-[60px] p-2 border rounded text-sm bg-background" placeholder="System prompt" value={newPrompt} onChange={(e) => setNewPrompt(e.target.value)} />
        <Button size="sm" onClick={() => createMut.mutate()} disabled={!newName}>Create</Button>
      </div>
    </div>
  );
}

// ── Models Panel ──────────────────────────────────────────────────────────────

function ModelsPanel() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["models"], queryFn: getModels });
  const selectMut = useMutation({
    mutationFn: (model: string) => setSelectedModel(model),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["models"] }),
  });
  const effortMut = useMutation({
    mutationFn: (effort: string) => setReasoningEffort(effort),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["models"] }),
  });

  const efforts = ["low", "medium", "high", "xhigh"];

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium">Selected Model</label>
        <div className="flex flex-wrap gap-2 mt-2">
          {(data as ModelInfo | undefined)?.models.map((m) => (
            <Button key={m.id} size="sm" variant={m.id === data?.selected ? "default" : "outline"} onClick={() => selectMut.mutate(m.id)}>{m.id}</Button>
          ))}
          {(!data?.models || data.models.length === 0) && (
            <p className="text-sm text-muted-foreground">No models available. Authenticate first.</p>
          )}
        </div>
      </div>
      <div>
        <label className="text-sm font-medium">Reasoning Effort</label>
        <div className="flex gap-2 mt-2">
          {efforts.map((e) => (
            <Button key={e} size="sm" variant={e === data?.reasoningEffort ? "default" : "outline"} onClick={() => effortMut.mutate(e)}>{e}</Button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── MCP Panel ─────────────────────────────────────────────────────────────────

function McpPanel() {
  const qc = useQueryClient();
  const { data: servers } = useQuery({ queryKey: ["mcp-servers"], queryFn: getMcpServers });
  const [name, setName] = useState("");
  const [type, setType] = useState("stdio");
  const [command, setCommand] = useState("");

  const createMut = useMutation({
    mutationFn: () => createMcpServer({ name, type, command }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["mcp-servers"] }); setName(""); setCommand(""); },
  });
  const delMut = useMutation({
    mutationFn: (id: string) => deleteMcpServer(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mcp-servers"] }),
  });

  return (
    <div className="space-y-4">
      {(servers as McpServer[] | undefined)?.map((s) => (
        <div key={s.id} className="flex items-center justify-between border rounded p-3">
          <div>
            <span className="font-medium">{s.name}</span>
            <span className="ml-2 text-xs text-muted-foreground">{s.type}</span>
            {s.command && <span className="ml-2 text-xs font-mono">{s.command}</span>}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={s.enabled ? "default" : "secondary"}>{s.enabled ? "Enabled" : "Disabled"}</Badge>
            <Button size="sm" variant="ghost" onClick={() => delMut.mutate(s.id)}>Delete</Button>
          </div>
        </div>
      ))}
      <div className="border-t pt-4 space-y-2">
        <h4 className="text-sm font-medium">Add MCP Server</h4>
        <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="flex gap-2">
          {["stdio", "http", "sse", "docker"].map((t) => (
            <Button key={t} size="sm" variant={t === type ? "default" : "outline"} onClick={() => setType(t)}>{t}</Button>
          ))}
        </div>
        <Input placeholder="Command (for stdio)" value={command} onChange={(e) => setCommand(e.target.value)} />
        <Button size="sm" onClick={() => createMut.mutate()} disabled={!name}>Add Server</Button>
      </div>
    </div>
  );
}
