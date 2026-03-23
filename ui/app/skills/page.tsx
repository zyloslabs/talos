"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { NavTabs } from "@/components/talos/nav-tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  getSkills, createSkill, updateSkill, deleteSkill,
  getSkillAgents,
  type SkillDef,
} from "@/lib/api";
import { AiEnhanceBar } from "@/components/talos/ai-enhance-bar";
import { Zap, Plus, Trash2, Pencil, Download, Upload, Play, Loader2, Copy, Wrench, Users } from "lucide-react";

const SKILL_TEMPLATES: { name: string; description: string; tags: string[]; content: string }[] = [
  { name: "Web Scraper", description: "Scrape and parse a web page for structured data", tags: ["web", "scraping"], content: "Navigate to the given URL, extract the main content, and return it as structured JSON with title, headings, paragraphs, and links." },
  { name: "Code Reviewer", description: "Review code for quality, security, and performance", tags: ["code", "review"], content: "Analyze the provided code for: 1) Security vulnerabilities (OWASP Top 10), 2) Performance issues, 3) Code quality and maintainability, 4) Test coverage gaps. Provide actionable suggestions." },
  { name: "Test Generator", description: "Generate test cases from requirements", tags: ["testing", "automation"], content: "Given the feature requirements, generate comprehensive test cases including: happy path, edge cases, error handling, boundary conditions, and accessibility checks." },
  { name: "API Tester", description: "Test REST API endpoints systematically", tags: ["api", "testing"], content: "For the given API endpoint, generate and execute tests for: valid requests, invalid inputs, authentication, rate limits, and error responses. Report results in a structured format." },
  { name: "Documentation Writer", description: "Generate documentation from code", tags: ["docs", "writing"], content: "Analyze the provided code and generate comprehensive documentation including: purpose, usage examples, parameter descriptions, return values, and error handling." },
];

export default function SkillsPage() {
  const qc = useQueryClient();
  const { data: skills } = useQuery({ queryKey: ["skills"], queryFn: getSkills });
  const [createOpen, setCreateOpen] = useState(false);
  const [editSkill, setEditSkill] = useState<SkillDef | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [executeSkill, setExecuteSkill] = useState<SkillDef | null>(null);

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteSkill(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });

  const toggleMut = useMutation({
    mutationFn: (s: SkillDef) => updateSkill(s.id, { enabled: !s.enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });

  const handleExport = useCallback(() => {
    if (!skills) return;
    const blob = new Blob([JSON.stringify(skills, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "talos-skills.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [skills]);

  const handleImport = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        const imported = JSON.parse(text) as SkillDef[];
        for (const s of imported) {
          await createSkill({ name: s.name, description: s.description, tags: s.tags, content: s.content });
        }
        qc.invalidateQueries({ queryKey: ["skills"] });
      } catch { /* ignore invalid files */ }
    };
    input.click();
  }, [qc]);

  const handleCreateFromTemplate = async (template: typeof SKILL_TEMPLATES[number]) => {
    await createSkill({ name: template.name, description: template.description, tags: template.tags, content: template.content });
    qc.invalidateQueries({ queryKey: ["skills"] });
    setTemplateOpen(false);
  };

  return (
    <div className="flex flex-col h-full">
      <NavTabs />
      <main className="flex-1 overflow-auto container px-4 md:px-6 py-4 md:py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Zap className="h-6 w-6" />
            <h1 className="text-2xl font-bold">Skills</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleImport}>
              <Upload className="h-4 w-4 mr-1" />Import
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-1" />Export
            </Button>
            <Button variant="outline" size="sm" onClick={() => setTemplateOpen(true)}>
              <Copy className="h-4 w-4 mr-1" />Templates
            </Button>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-1" />New Skill</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>Create Skill</DialogTitle></DialogHeader>
                <SkillForm onSave={() => { qc.invalidateQueries({ queryKey: ["skills"] }); setCreateOpen(false); }} />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(skills as SkillDef[] | undefined)?.map((s) => (
            <Card key={s.id} className="group">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{s.name}</CardTitle>
                    <CardDescription className="text-xs mt-1">{s.description}</CardDescription>
                  </div>
                  <Switch checked={s.enabled} onCheckedChange={() => toggleMut.mutate(s)} />
                </div>
              </CardHeader>
              <CardContent>
                {s.tags && s.tags.length > 0 && (
                  <div className="flex gap-1 flex-wrap mb-2">
                    {s.tags.slice(0, 4).map((t) => (
                      <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                    ))}
                    {s.tags.length > 4 && <Badge variant="outline" className="text-xs">+{s.tags.length - 4}</Badge>}
                  </div>
                )}
                {(s.requiredTools?.length > 0) && (
                  <div className="flex gap-2 mb-2">
                    <Badge variant="secondary" className="text-xs gap-1">
                      <Wrench className="h-3 w-3" />{s.requiredTools.length} tools
                    </Badge>
                  </div>
                )}
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button size="sm" variant="ghost" onClick={() => setExecuteSkill(s)}>
                    <Play className="h-3 w-3 mr-1" />Run
                  </Button>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="ghost" onClick={() => setEditSkill(s)}>
                        <Pencil className="h-3 w-3 mr-1" />Edit
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg">
                      <DialogHeader><DialogTitle>Edit Skill</DialogTitle></DialogHeader>
                      {editSkill && <SkillForm skill={editSkill} onSave={() => { qc.invalidateQueries({ queryKey: ["skills"] }); setEditSkill(null); }} />}
                    </DialogContent>
                  </Dialog>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteMut.mutate(s.id)}>
                    <Trash2 className="h-3 w-3 mr-1" />Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {(!skills || (skills as SkillDef[]).length === 0) && (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              No skills configured. Create one or use a template to get started.
            </div>
          )}
        </div>

        {/* Templates Dialog (#227) */}
        <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Skill Templates</DialogTitle></DialogHeader>
            <div className="grid gap-3 md:grid-cols-2 max-h-[60vh] overflow-y-auto">
              {SKILL_TEMPLATES.map((tmpl) => (
                <Card key={tmpl.name} className="cursor-pointer hover:ring-2 hover:ring-primary transition-all" onClick={() => handleCreateFromTemplate(tmpl)}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{tmpl.name}</CardTitle>
                    <CardDescription className="text-xs">{tmpl.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex gap-1 flex-wrap">
                      {tmpl.tags.map((t) => (
                        <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        {/* Inline Execution Dialog (#228) */}
        <Dialog open={!!executeSkill} onOpenChange={(open) => !open && setExecuteSkill(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Execute: {executeSkill?.name}</DialogTitle></DialogHeader>
            {executeSkill && <SkillExecutionPanel skill={executeSkill} />}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}

// ── Inline Execution Panel (#228) ─────────────────────────────────────────────

function SkillExecutionPanel({ skill }: { skill: SkillDef }) {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const handleRun = async () => {
    setRunning(true);
    setOutput(null);
    try {
      const { createTask } = await import("@/lib/api");
      const task = await createTask(`[Skill: ${skill.name}] ${skill.content}\n\nInput: ${input}`);
      setOutput(`Task created: ${task.id}\nStatus: ${task.status}\n\nThe skill is executing as a background task. Check the Tasks page for results.`);
    } catch (err) {
      setOutput(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="bg-muted p-3 rounded text-xs font-mono whitespace-pre-wrap max-h-24 overflow-y-auto">
        {skill.content}
      </div>
      <textarea
        className="w-full min-h-[80px] p-3 border rounded text-sm"
        placeholder="Input for this skill..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />
      <Button onClick={handleRun} disabled={running || !input.trim()} className="w-full">
        {running ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Executing...</> : <><Play className="h-4 w-4 mr-1" />Execute</>}
      </Button>
      {output && (
        <pre className="bg-muted p-3 rounded text-xs whitespace-pre-wrap max-h-48 overflow-y-auto">{output}</pre>
      )}
    </div>
  );
}

// ── Skill Form ────────────────────────────────────────────────────────────────

function SkillForm({ skill, onSave }: { skill?: SkillDef; onSave: () => void }) {
  const [name, setName] = useState(skill?.name ?? "");
  const [description, setDescription] = useState(skill?.description ?? "");
  const [tags, setTags] = useState(skill?.tags?.join(", ") ?? "");
  const [content, setContent] = useState(skill?.content ?? "");
  const [requiredTools, setRequiredTools] = useState(skill?.requiredTools?.join(", ") ?? "");

  const { data: skillAgents } = useQuery({
    queryKey: ["skill-agents", skill?.id],
    queryFn: () => getSkillAgents(skill!.id),
    enabled: !!skill,
  });
  // Agent assignment is read-only here — managed from the Agents page

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        name,
        description,
        tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        content: content || undefined,
        requiredTools: requiredTools ? requiredTools.split(",").map((t) => t.trim()).filter(Boolean) : [],
      };
      if (skill) return updateSkill(skill.id, payload);
      return createSkill(payload);
    },
    onSuccess: onSave,
  });

  return (
    <div className="space-y-3">
      <Input placeholder="Skill name" value={name} onChange={(e) => setName(e.target.value)} />
      <Input placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
      <Input placeholder="Tags (comma-separated)" value={tags} onChange={(e) => setTags(e.target.value)} />
      <div>
        <label className="text-sm font-medium mb-1 block">Skill Content</label>
        <textarea
          className="w-full min-h-[100px] p-3 border rounded text-sm font-mono"
          placeholder="Skill content / instructions..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <AiEnhanceBar text={content} onEnhanced={setContent} context="skill definition" />
      </div>
      <div>
        <label className="text-sm font-medium mb-1 block">Required Tools</label>
        <Input
          placeholder="Tool IDs (comma-separated)"
          value={requiredTools}
          onChange={(e) => setRequiredTools(e.target.value)}
        />
        <p className="text-xs text-muted-foreground mt-1">Tools this skill needs to function</p>
      </div>
      {skill && skillAgents && skillAgents.length > 0 && (
        <div>
          <label className="text-sm font-medium mb-1 block">
            <Users className="h-3 w-3 inline mr-1" />Used by Agents
          </label>
          <div className="flex gap-1 flex-wrap">
            {skillAgents.map((a) => (
              <Badge key={a.id} variant="secondary" className="text-xs">{a.name}</Badge>
            ))}
          </div>
        </div>
      )}
      <div className="flex justify-end">
        <Button onClick={() => mutation.mutate()} disabled={!name || !description || mutation.isPending}>
          {mutation.isPending ? "Saving..." : skill ? "Update" : "Create"}
        </Button>
      </div>
    </div>
  );
}
