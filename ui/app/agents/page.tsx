"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  getAgents, createAgent, updateAgent, deleteAgent,
  getAgentSkills, setAgentSkills, getSkills,
  type Agent, type SkillDef,
} from "@/lib/api";
import { AiEnhanceBar } from "@/components/talos/ai-enhance-bar";
import { Bot, Plus, Trash2, Pencil, Search, Wrench, Zap, Users } from "lucide-react";

export default function AgentsPage() {
  const qc = useQueryClient();
  const { data: agents, isLoading } = useQuery({ queryKey: ["agents"], queryFn: getAgents });
  const [createOpen, setCreateOpen] = useState(false);
  const [editAgent, setEditAgent] = useState<Agent | null>(null);
  const [search, setSearch] = useState("");

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteAgent(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agents"] }),
  });

  const toggleMut = useMutation({
    mutationFn: (a: Agent) => updateAgent(a.id, { enabled: !a.enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agents"] }),
  });

  const filtered = (agents ?? []).filter(
    (a) => a.name.toLowerCase().includes(search.toLowerCase()) || a.description.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="flex flex-col h-full">
      <main className="flex-1 overflow-auto container px-4 md:px-6 py-4 md:py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Bot className="h-6 w-6" />
            <h1 className="text-2xl font-bold">Agents</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search agents..."
                className="pl-9 w-64"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-1" />New Agent</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>Create Agent</DialogTitle></DialogHeader>
                <AgentForm
                  agents={agents ?? []}
                  onSave={() => { qc.invalidateQueries({ queryKey: ["agents"] }); setCreateOpen(false); }}
                />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {isLoading && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader><div className="h-5 w-32 bg-muted rounded" /><div className="h-3 w-48 bg-muted rounded mt-2" /></CardHeader>
                <CardContent><div className="h-4 w-20 bg-muted rounded" /></CardContent>
              </Card>
            ))}
          </div>
        )}

        {!isLoading && filtered.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((a) => (
              <AgentCard
                key={a.id}
                agent={a}
                allAgents={agents ?? []}
                onEdit={() => setEditAgent(a)}
                onDelete={() => deleteMut.mutate(a.id)}
                onToggle={() => toggleMut.mutate(a)}
              />
            ))}
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            {search ? "No agents match your search." : "No agents yet. Create your first agent to get started."}
          </div>
        )}
      </main>

      {editAgent && (
        <Dialog open={!!editAgent} onOpenChange={(open) => { if (!open) setEditAgent(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Edit Agent</DialogTitle></DialogHeader>
            <AgentForm
              agent={editAgent}
              agents={(agents ?? []).filter((a) => a.id !== editAgent.id)}
              onSave={() => { qc.invalidateQueries({ queryKey: ["agents"] }); setEditAgent(null); }}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function AgentCard({
  agent, allAgents, onEdit, onDelete, onToggle,
}: {
  agent: Agent;
  allAgents: Agent[];
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const subAgentCount = allAgents.filter((a) => a.parentAgentId === agent.id).length;

  return (
    <Card className="group">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <CardTitle className="text-base truncate">{agent.name}</CardTitle>
            <CardDescription className="text-xs mt-1 line-clamp-2">{agent.description || "No description"}</CardDescription>
          </div>
          <Switch checked={agent.enabled} onCheckedChange={onToggle} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 flex-wrap mb-3">
          <Badge variant="outline" className="text-xs gap-1">
            <Wrench className="h-3 w-3" />{agent.toolsWhitelist.length} tools
          </Badge>
          {subAgentCount > 0 && (
            <Badge variant="outline" className="text-xs gap-1">
              <Users className="h-3 w-3" />{subAgentCount} sub-agents
            </Badge>
          )}
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button size="sm" variant="ghost" onClick={onEdit}>
            <Pencil className="h-3 w-3 mr-1" />Edit
          </Button>
          <Button size="sm" variant="ghost" className="text-destructive" onClick={onDelete}>
            <Trash2 className="h-3 w-3 mr-1" />Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AgentForm({
  agent, agents, onSave,
}: {
  agent?: Agent;
  agents: Agent[];
  onSave: () => void;
}) {
  const [name, setName] = useState(agent?.name ?? "");
  const [description, setDescription] = useState(agent?.description ?? "");
  const [systemPrompt, setSystemPrompt] = useState(agent?.systemPrompt ?? "");
  const [toolsWhitelist, setToolsWhitelist] = useState(agent?.toolsWhitelist?.join(", ") ?? "");
  const [parentAgentId, setParentAgentId] = useState(agent?.parentAgentId ?? "");
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set());

  const { data: allSkills } = useQuery({ queryKey: ["skills"], queryFn: getSkills });
  const { data: agentSkillIds } = useQuery({
    queryKey: ["agent-skills", agent?.id],
    queryFn: () => getAgentSkills(agent!.id),
    enabled: !!agent,
  });

  // Sync loaded skill IDs into state once
  const [synced, setSynced] = useState(false);
  if (agentSkillIds && !synced) {
    setSelectedSkills(new Set((agentSkillIds as unknown as SkillDef[]).map((s) => s.id)));
    setSynced(true);
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name,
        description,
        systemPrompt,
        toolsWhitelist: toolsWhitelist ? toolsWhitelist.split(",").map((t) => t.trim()).filter(Boolean) : [],
        parentAgentId: parentAgentId || null,
      };
      const saved = agent ? await updateAgent(agent.id, payload) : await createAgent(payload);
      await setAgentSkills(saved.id, Array.from(selectedSkills));
      return saved;
    },
    onSuccess: onSave,
  });

  const toggleSkill = (id: string) => {
    setSelectedSkills((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
      <Input
        placeholder="Agent name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={100}
      />
      <Input
        placeholder="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <div>
        <label className="text-sm font-medium mb-1 block">Persona / System Prompt</label>
        <textarea
          className="w-full min-h-[120px] p-3 border rounded text-sm font-mono"
          placeholder="Agent persona and instructions..."
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
        />
        <AiEnhanceBar text={systemPrompt} onEnhanced={setSystemPrompt} context="agent persona prompt" />
      </div>
      <Input
        placeholder="Tools whitelist (comma-separated tool IDs)"
        value={toolsWhitelist}
        onChange={(e) => setToolsWhitelist(e.target.value)}
      />
      <div>
        <label className="text-sm font-medium mb-1 block">Parent Agent</label>
        <select
          className="w-full p-2 border rounded text-sm"
          value={parentAgentId}
          onChange={(e) => setParentAgentId(e.target.value)}
        >
          <option value="">None (top-level agent)</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>
      {allSkills && (allSkills as SkillDef[]).length > 0 && (
        <div>
          <label className="text-sm font-medium mb-1 block">
            Skills <span className="text-muted-foreground font-normal">({selectedSkills.size} selected)</span>
          </label>
          <div className="border rounded p-2 space-y-1 max-h-40 overflow-y-auto">
            {(allSkills as SkillDef[]).map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
                <input
                  type="checkbox"
                  checked={selectedSkills.has(s.id)}
                  onChange={() => toggleSkill(s.id)}
                  className="rounded"
                />
                <span>{s.name}</span>
                <span className="text-xs text-muted-foreground">{s.description}</span>
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="flex justify-end">
        <Button onClick={() => mutation.mutate()} disabled={!name || mutation.isPending}>
          {mutation.isPending ? "Saving..." : agent ? "Update" : "Create"}
        </Button>
      </div>
    </div>
  );
}
