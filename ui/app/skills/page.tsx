"use client";

import { useState } from "react";
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
  type SkillDef,
} from "@/lib/api";
import { Zap, Plus, Trash2, Pencil } from "lucide-react";

export default function SkillsPage() {
  const qc = useQueryClient();
  const { data: skills } = useQuery({ queryKey: ["skills"], queryFn: getSkills });
  const [createOpen, setCreateOpen] = useState(false);
  const [editSkill, setEditSkill] = useState<SkillDef | null>(null);

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteSkill(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });

  const toggleMut = useMutation({
    mutationFn: (s: SkillDef) => updateSkill(s.id, { enabled: !s.enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });

  return (
    <div className="min-h-screen flex flex-col">
      <NavTabs />
      <main className="flex-1 container py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Zap className="h-6 w-6" />
            <h1 className="text-2xl font-bold">Skills</h1>
          </div>
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
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
              No skills configured. Create one to get started.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function SkillForm({ skill, onSave }: { skill?: SkillDef; onSave: () => void }) {
  const [name, setName] = useState(skill?.name ?? "");
  const [description, setDescription] = useState(skill?.description ?? "");
  const [tags, setTags] = useState(skill?.tags?.join(", ") ?? "");
  const [content, setContent] = useState(skill?.content ?? "");

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        name,
        description,
        tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        content: content || undefined,
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
      <textarea
        className="w-full min-h-[100px] p-3 border rounded text-sm font-mono"
        placeholder="Skill content / instructions..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <div className="flex justify-end">
        <Button onClick={() => mutation.mutate()} disabled={!name || !description || mutation.isPending}>
          {mutation.isPending ? "Saving..." : skill ? "Update" : "Create"}
        </Button>
      </div>
    </div>
  );
}
