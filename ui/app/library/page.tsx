"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { NavTabs } from "@/components/talos/nav-tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  getPrompts, createPrompt, updatePrompt, deletePrompt,
  type SavedPrompt,
} from "@/lib/api";
import { BookOpen, Plus, Search, Pencil, Trash2 } from "lucide-react";

export default function LibraryPage() {
  const qc = useQueryClient();
  const { data: prompts } = useQuery({ queryKey: ["prompts"], queryFn: () => getPrompts() });
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState<SavedPrompt | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const deleteMut = useMutation({
    mutationFn: (id: string) => deletePrompt(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prompts"] }),
  });

  const filtered = (prompts as SavedPrompt[] | undefined)?.filter((p) => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.content.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterCategory && p.category !== filterCategory) return false;
    return true;
  });

  const categories = [...new Set((prompts as SavedPrompt[] | undefined)?.map((p) => p.category).filter(Boolean) ?? [])];

  return (
    <div className="min-h-screen flex flex-col">
      <NavTabs />
      <main className="flex-1 container py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <BookOpen className="h-6 w-6" />
            <h1 className="text-2xl font-bold">Prompt Library</h1>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-1" />New Prompt</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Create Prompt</DialogTitle></DialogHeader>
              <PromptForm onSave={() => { qc.invalidateQueries({ queryKey: ["prompts"] }); setCreateOpen(false); }} />
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search prompts..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Button variant={!filterCategory ? "default" : "outline"} size="sm" onClick={() => setFilterCategory(null)}>All</Button>
          {categories.map((c) => (
            <Button key={c} variant={filterCategory === c ? "default" : "outline"} size="sm" onClick={() => setFilterCategory(c as string)}>
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
                    {p.category && <Badge variant="secondary" className="mt-1">{p.category}</Badge>}
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditPrompt(p)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-lg">
                        <DialogHeader><DialogTitle>Edit Prompt</DialogTitle></DialogHeader>
                        {editPrompt && <PromptForm prompt={editPrompt} onSave={() => { qc.invalidateQueries({ queryKey: ["prompts"] }); setEditPrompt(null); }} />}
                      </DialogContent>
                    </Dialog>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteMut.mutate(p.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground line-clamp-3">{p.content}</p>
                {p.stages && p.stages.length > 0 && (
                  <div className="mt-2 flex gap-1">
                    <Badge variant="outline" className="text-xs">{p.stages.length} stages</Badge>
                  </div>
                )}
                {p.preferredTools && p.preferredTools.length > 0 && (
                  <div className="mt-1 flex gap-1 flex-wrap">
                    {p.preferredTools.slice(0, 3).map((t) => (
                      <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                    ))}
                    {p.preferredTools.length > 3 && <Badge variant="outline" className="text-xs">+{p.preferredTools.length - 3}</Badge>}
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
      </main>
    </div>
  );
}

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
      <div className="flex justify-end">
        <Button onClick={() => mutation.mutate()} disabled={!name || !content || mutation.isPending}>
          {mutation.isPending ? "Saving..." : prompt ? "Update" : "Create"}
        </Button>
      </div>
    </div>
  );
}
