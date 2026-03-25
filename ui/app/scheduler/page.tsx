"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  getJobs, createJob, updateJob, deleteJob,
  type ScheduledJob,
} from "@/lib/api";
import { Calendar, Plus, Trash2, Play, Pause, Clock } from "lucide-react";

export default function SchedulerPage() {
  const qc = useQueryClient();
  const { data: jobs } = useQuery({ queryKey: ["jobs"], queryFn: getJobs });
  const [createOpen, setCreateOpen] = useState(false);

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteJob(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs"] }),
  });

  const toggleMut = useMutation({
    mutationFn: (j: ScheduledJob) => updateJob(j.id, { enabled: !j.enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs"] }),
  });

  return (
    <div className="flex flex-col h-full">
      <main className="flex-1 overflow-auto container px-4 md:px-6 py-4 md:py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Calendar className="h-6 w-6" />
            <h1 className="text-2xl font-bold">Scheduler</h1>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-1" />New Job</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Create Scheduled Job</DialogTitle></DialogHeader>
              <JobForm onSave={() => { qc.invalidateQueries({ queryKey: ["jobs"] }); setCreateOpen(false); }} />
            </DialogContent>
          </Dialog>
        </div>

        <div className="space-y-4">
          {(jobs as ScheduledJob[] | undefined)?.map((j) => (
            <Card key={j.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">{j.name}</CardTitle>
                    <CardDescription className="flex items-center gap-2 mt-1">
                      <Clock className="h-3 w-3" />
                      <code className="text-xs bg-muted px-1 rounded">{j.cronExpression}</code>
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch checked={j.enabled} onCheckedChange={() => toggleMut.mutate(j)} />
                    {j.enabled ? <Play className="h-4 w-4 text-green-500" /> : <Pause className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-2">{j.prompt}</p>
                <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                    {j.lastRunAt && (
                      <span className="text-xs text-muted-foreground">
                        Last: {new Date(j.lastRunAt).toLocaleString()}
                      </span>
                    )}
                    {j.nextRunAt && (
                      <span className="text-xs text-muted-foreground">
                        Next: {new Date(j.nextRunAt).toLocaleString()}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteMut.mutate(j.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {(!jobs || (jobs as ScheduledJob[]).length === 0) && (
            <div className="text-center py-12 text-muted-foreground">
              No scheduled jobs. Create one to automate tasks.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function JobForm({ onSave }: { onSave: () => void }) {
  const [name, setName] = useState("");
  const [schedule, setSchedule] = useState("");
  const [prompt, setPrompt] = useState("");

  const presets = [
    { label: "Every hour", cron: "0 * * * *" },
    { label: "Every day 9am", cron: "0 9 * * *" },
    { label: "Every Monday", cron: "0 9 * * 1" },
    { label: "Every 15 min", cron: "*/15 * * * *" },
  ];

  const mutation = useMutation({
    mutationFn: () => createJob({ name, cronExpression: schedule, prompt }),
    onSuccess: onSave,
  });

  return (
    <div className="space-y-3">
      <Input placeholder="Job name" value={name} onChange={(e) => setName(e.target.value)} />
      <div>
        <Input placeholder="Cron expression (e.g., 0 9 * * *)" value={schedule} onChange={(e) => setSchedule(e.target.value)} />
        <div className="flex gap-1 mt-1">
          {presets.map((p) => (
            <Button key={p.cron} size="sm" variant="ghost" className="text-xs h-6" onClick={() => setSchedule(p.cron)}>
              {p.label}
            </Button>
          ))}
        </div>
      </div>
      <textarea
        className="w-full min-h-[100px] p-3 border rounded text-sm"
        placeholder="Prompt / instructions for this scheduled job..."
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />
      <div className="flex justify-end">
        <Button onClick={() => mutation.mutate()} disabled={!name || !schedule || !prompt || mutation.isPending}>
          {mutation.isPending ? "Creating..." : "Create Job"}
        </Button>
      </div>
    </div>
  );
}
