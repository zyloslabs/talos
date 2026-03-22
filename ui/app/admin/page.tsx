"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { NavTabs } from "@/components/talos/nav-tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  getPersonalities, createPersonality, updatePersonality, activatePersonality,
  getModels, setSelectedModel, setReasoningEffort,
  getAuthStatus, startDeviceAuth,
  getMcpServers, createMcpServer, deleteMcpServer,
  type Personality, type ModelInfo, type McpServer,
} from "@/lib/api";
import { Settings, Shield, Brain, Server, User } from "lucide-react";

export default function AdminPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <NavTabs />
      <main className="flex-1 container py-6">
        <div className="flex items-center gap-2 mb-6">
          <Settings className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Admin Settings</h1>
        </div>
        <Tabs defaultValue="auth">
          <TabsList className="mb-4">
            <TabsTrigger value="auth"><Shield className="h-4 w-4 mr-1" />Auth</TabsTrigger>
            <TabsTrigger value="personality"><User className="h-4 w-4 mr-1" />Personality</TabsTrigger>
            <TabsTrigger value="models"><Brain className="h-4 w-4 mr-1" />Models</TabsTrigger>
            <TabsTrigger value="mcp"><Server className="h-4 w-4 mr-1" />MCP Servers</TabsTrigger>
          </TabsList>

          <TabsContent value="auth"><AuthPanel /></TabsContent>
          <TabsContent value="personality"><PersonalityPanel /></TabsContent>
          <TabsContent value="models"><ModelsPanel /></TabsContent>
          <TabsContent value="mcp"><McpPanel /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function AuthPanel() {
  const { data: authStatus } = useQuery({ queryKey: ["auth-status"], queryFn: getAuthStatus });
  const authMutation = useMutation({ mutationFn: startDeviceAuth });

  return (
    <Card>
      <CardHeader>
        <CardTitle>GitHub Copilot Authentication</CardTitle>
        <CardDescription>Connect Talos to GitHub Copilot for AI-powered features</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Badge variant={authStatus?.authenticated ? "default" : "secondary"}>
            {authStatus?.authenticated ? "Authenticated" : "Not Authenticated"}
          </Badge>
        </div>
        {!authStatus?.authenticated && (
          <div className="space-y-2">
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
      </CardContent>
    </Card>
  );
}

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
    <Card>
      <CardHeader>
        <CardTitle>System Personality</CardTitle>
        <CardDescription>Configure the AI assistant persona</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
                <textarea className="w-full min-h-[100px] p-2 border rounded text-sm font-mono" value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)} />
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
          <textarea className="w-full min-h-[60px] p-2 border rounded text-sm" placeholder="System prompt" value={newPrompt} onChange={(e) => setNewPrompt(e.target.value)} />
          <Button size="sm" onClick={() => createMut.mutate()} disabled={!newName}>Create</Button>
        </div>
      </CardContent>
    </Card>
  );
}

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
    <Card>
      <CardHeader>
        <CardTitle>Model Configuration</CardTitle>
        <CardDescription>Select the AI model and reasoning effort</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm font-medium">Selected Model</label>
          <div className="flex flex-wrap gap-2 mt-2">
            {(data as ModelInfo | undefined)?.models.map((m) => (
              <Button
                key={m.id}
                size="sm"
                variant={m.id === data?.selected ? "default" : "outline"}
                onClick={() => selectMut.mutate(m.id)}
              >
                {m.id}
              </Button>
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
              <Button
                key={e}
                size="sm"
                variant={e === data?.reasoningEffort ? "default" : "outline"}
                onClick={() => effortMut.mutate(e)}
              >
                {e}
              </Button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

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
    <Card>
      <CardHeader>
        <CardTitle>MCP Servers</CardTitle>
        <CardDescription>Manage Model Context Protocol server connections</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
      </CardContent>
    </Card>
  );
}
