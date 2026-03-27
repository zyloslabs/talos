"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { getPrompts, createPrompt, updatePrompt, deletePrompt, type SavedPrompt } from "@/lib/api";
import { AiEnhanceBar } from "@/components/talos/ai-enhance-bar";
import { BookOpen, Plus, Search, Pencil, Trash2, Download, Upload, GitBranch, Variable } from "lucide-react";

export default function LibraryPage() {
  const qc = useQueryClient();
  const { data: prompts } = useQuery({ queryKey: ["prompts"], queryFn: () => getPrompts() });
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState<SavedPrompt | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [pipelineOpen, setPipelineOpen] = useState<SavedPrompt | null>(null);
  const [variablesOpen, setVariablesOpen] = useState<SavedPrompt | null>(null);

  const deleteMut = useMutation({
    mutationFn: (id: string) => deletePrompt(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prompts"] }),
  });

  const filtered = (prompts as SavedPrompt[] | undefined)?.filter((p) => {
    if (
      search &&
      !p.name.toLowerCase().includes(search.toLowerCase()) &&
      !p.content.toLowerCase().includes(search.toLowerCase())
    )
      return false;
    if (filterCategory && p.category !== filterCategory) return false;
    return true;
  });

  const categories = [...new Set((prompts as SavedPrompt[] | undefined)?.map((p) => p.category).filter(Boolean) ?? [])];

  const handleExport = useCallback(() => {
    if (!prompts) return;
    const blob = new Blob([JSON.stringify(prompts, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "talos-prompts.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [prompts]);

  const handleImport = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        const imported = JSON.parse(text) as SavedPrompt[];
        for (const p of imported) {
          await createPrompt({
            name: p.name,
            content: p.content,
            category: p.category,
            stages: p.stages,
            preferredTools: p.preferredTools,
          });
        }
        qc.invalidateQueries({ queryKey: ["prompts"] });
      } catch {
        /* ignore invalid files */
      }
    };
    input.click();
  }, [qc]);

  return (
    <div className="flex flex-col h-full">
      <main className="flex-1 overflow-auto container px-4 md:px-6 py-4 md:py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <BookOpen className="h-6 w-6" />
            <h1 className="text-2xl font-bold">Prompt Library</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleImport}>
              <Upload className="h-4 w-4 mr-1" />
              Import
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-1" />
              Export
            </Button>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-1" />
                  New Prompt
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Create Prompt</DialogTitle>
                </DialogHeader>
                <PromptForm
                  onSave={() => {
                    qc.invalidateQueries({ queryKey: ["prompts"] });
                    setCreateOpen(false);
                  }}
                />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search prompts..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button variant={!filterCategory ? "default" : "outline"} size="sm" onClick={() => setFilterCategory(null)}>
            All
          </Button>
          {categories.map((c) => (
            <Button
              key={c}
              variant={filterCategory === c ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterCategory(c as string)}
            >
              {c as string}
            </Button>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered?.map((p) => (
            <Card key={p.id} className="group">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{p.name}</CardTitle>
                    {p.category && (
                      <Badge variant="secondary" className="mt-1">
                        {p.category}
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => setVariablesOpen(p)}
                      title="Template variables"
                    >
                      <Variable className="h-3 w-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => setPipelineOpen(p)}
                      title="Pipeline stages"
                    >
                      <GitBranch className="h-3 w-3" />
                    </Button>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditPrompt(p)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-lg">
                        <DialogHeader>
                          <DialogTitle>Edit Prompt</DialogTitle>
                        </DialogHeader>
                        {editPrompt && (
                          <PromptForm
                            prompt={editPrompt}
                            onSave={() => {
                              qc.invalidateQueries({ queryKey: ["prompts"] });
                              setEditPrompt(null);
                            }}
                          />
                        )}
                      </DialogContent>
                    </Dialog>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive"
                      onClick={() => deleteMut.mutate(p.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground line-clamp-3">{p.content}</p>
                <TemplateVariableBadges content={p.content} />
                {p.stages && p.stages.length > 0 && (
                  <div className="mt-2 flex gap-1">
                    <Badge variant="outline" className="text-xs">
                      {p.stages.length} stages
                    </Badge>
                  </div>
                )}
                {p.preferredTools && p.preferredTools.length > 0 && (
                  <div className="mt-1 flex gap-1 flex-wrap">
                    {p.preferredTools.slice(0, 3).map((t) => (
                      <Badge key={t} variant="outline" className="text-xs">
                        {t}
                      </Badge>
                    ))}
                    {p.preferredTools.length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{p.preferredTools.length - 3}
                      </Badge>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          {filtered?.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              No prompts found. Create one to get started.
            </div>
          )}
        </div>

        {/* Pipeline Builder Dialog (#224) */}
        <Dialog open={!!pipelineOpen} onOpenChange={(open) => !open && setPipelineOpen(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Pipeline Builder — {pipelineOpen?.name}</DialogTitle>
            </DialogHeader>
            {pipelineOpen && (
              <PipelineBuilder
                prompt={pipelineOpen}
                onSave={() => {
                  qc.invalidateQueries({ queryKey: ["prompts"] });
                  setPipelineOpen(null);
                }}
              />
            )}
          </DialogContent>
        </Dialog>

        {/* Template Variables Dialog (#225) */}
        <Dialog open={!!variablesOpen} onOpenChange={(open) => !open && setVariablesOpen(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Template Variables — {variablesOpen?.name}</DialogTitle>
            </DialogHeader>
            {variablesOpen && <TemplateVariablesPanel prompt={variablesOpen} />}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}

// ── Template Variable Badges ──────────────────────────────────────────────────

function TemplateVariableBadges({ content }: { content: string }) {
  const vars = extractVariables(content);
  if (vars.length === 0) return null;
  return (
    <div className="mt-2 flex gap-1 flex-wrap">
      {vars.map((v) => (
        <Badge key={v} variant="secondary" className="text-[10px] font-mono">{`{{${v}}}`}</Badge>
      ))}
    </div>
  );
}

function extractVariables(content: string): string[] {
  const matches = content.match(/\{\{(\w+)\}\}/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.slice(2, -2)))];
}

// ── Template Variables Panel (#225) ───────────────────────────────────────────

function TemplateVariablesPanel({ prompt }: { prompt: SavedPrompt }) {
  const vars = extractVariables(prompt.content);
  const [values, setValues] = useState<Record<string, string>>({});

  const rendered = vars.reduce((text, v) => text.replaceAll(`{{${v}}}`, values[v] || `{{${v}}}`), prompt.content);

  return (
    <div className="space-y-4">
      {vars.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No template variables found. Use {"{{variable}}"} syntax in your prompt content.
        </p>
      ) : (
        <>
          <div className="space-y-2">
            {vars.map((v) => (
              <div key={v} className="flex items-center gap-2">
                <label className="text-sm font-mono w-32 truncate">{`{{${v}}}`}</label>
                <Input
                  className="flex-1"
                  placeholder={`Value for ${v}`}
                  value={values[v] ?? ""}
                  onChange={(e) => setValues((prev) => ({ ...prev, [v]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <div className="border-t pt-3">
            <h4 className="text-sm font-medium mb-1">Preview</h4>
            <pre className="text-xs bg-muted p-3 rounded whitespace-pre-wrap max-h-40 overflow-y-auto">{rendered}</pre>
          </div>
        </>
      )}
    </div>
  );
}

// ── Pipeline Builder (#224) ───────────────────────────────────────────────────

interface PipelineStage {
  name: string;
  prompt: string;
}

function PipelineBuilder({ prompt, onSave }: { prompt: SavedPrompt; onSave: () => void }) {
  const [stages, setStages] = useState<PipelineStage[]>(
    (prompt.stages as PipelineStage[] | undefined) ?? [{ name: "Stage 1", prompt: prompt.content }]
  );

  const mutation = useMutation({
    mutationFn: () => updatePrompt(prompt.id, { stages }),
    onSuccess: onSave,
  });

  const addStage = () => {
    setStages((prev) => [...prev, { name: `Stage ${prev.length + 1}`, prompt: "" }]);
  };

  const removeStage = (index: number) => {
    setStages((prev) => prev.filter((_, i) => i !== index));
  };

  const updateStage = (index: number, updates: Partial<PipelineStage>) => {
    setStages((prev) => prev.map((s, i) => (i === index ? { ...s, ...updates } : s)));
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {stages.map((stage, i) => (
          <Card key={i}>
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {i + 1}
                </Badge>
                <Input
                  className="flex-1"
                  value={stage.name}
                  onChange={(e) => updateStage(i, { name: e.target.value })}
                  placeholder="Stage name"
                />
                {stages.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => removeStage(i)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
              <textarea
                className="w-full min-h-[80px] p-2 border rounded text-xs font-mono resize-y"
                placeholder="Stage prompt..."
                value={stage.prompt}
                onChange={(e) => updateStage(i, { prompt: e.target.value })}
              />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={addStage}>
          <Plus className="h-3 w-3 mr-1" />
          Add Stage
        </Button>
        <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? "Saving..." : "Save Pipeline"}
        </Button>
      </div>
    </div>
  );
}

// ── Original Prompt Form ──────────────────────────────────────────────────────

function PromptForm({ prompt, onSave }: { prompt?: SavedPrompt; onSave: () => void }) {
  const [name, setName] = useState(prompt?.name ?? "");
  const [content, setContent] = useState(prompt?.content ?? "");
  const [category, setCategory] = useState(prompt?.category ?? "");

  const mutation = useMutation({
    mutationFn: () => {
      if (prompt) return updatePrompt(prompt.id, { name, content, category: category || undefined });
      return createPrompt({ name, content, category: category || undefined });
    },
    onSuccess: onSave,
  });

  return (
    <div className="space-y-3">
      <Input placeholder="Prompt name" value={name} onChange={(e) => setName(e.target.value)} />
      <Input placeholder="Category (optional)" value={category} onChange={(e) => setCategory(e.target.value)} />
      <textarea
        className="w-full min-h-[150px] p-3 border rounded text-sm font-mono"
        placeholder="Prompt content... Use {{variable}} for template variables"
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <AiEnhanceBar text={content} onEnhanced={setContent} context="prompt template" />
      <div className="flex justify-end">
        <Button onClick={() => mutation.mutate()} disabled={!name || !content || mutation.isPending}>
          {mutation.isPending ? "Saving..." : prompt ? "Update" : "Create"}
        </Button>
      </div>
    </div>
  );
}
