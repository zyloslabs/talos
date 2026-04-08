"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  getSyncJobs,
  createOrUpdateSyncJob,
  triggerSyncJob,
  type SyncJob,
} from "@/lib/api";
import { Loader2, RefreshCw, Clock, Play, Check, X, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Sync Schedule Settings (#474) ─────────────────────────────────────────────

const SOURCE_LABELS: Record<string, string> = {
  atlassian: "Atlassian (Jira/Confluence)",
  jdbc: "JDBC Database",
  m365: "Microsoft 365",
};

const SCHEDULE_OPTIONS = [
  { value: "manual", label: "Manual Only" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "custom", label: "Custom Cron" },
] as const;

export function SyncScheduleSettings({ appId }: { appId: string }) {
  const queryClient = useQueryClient();

  const { data: jobs, isLoading } = useQuery({
    queryKey: ["sync-jobs", appId],
    queryFn: () => getSyncJobs(appId),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading sync schedules...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">Sync Schedules</h3>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Configure automatic re-sync for external data sources. Sync jobs incrementally import new and updated content.
      </p>

      {(["atlassian", "jdbc", "m365"] as const).map((sourceType) => {
        const job = jobs?.find((j) => j.sourceType === sourceType);
        return (
          <SyncJobCard
            key={sourceType}
            appId={appId}
            sourceType={sourceType}
            job={job ?? null}
            queryClient={queryClient}
          />
        );
      })}
    </div>
  );
}

function SyncJobCard({
  appId,
  sourceType,
  job,
  queryClient,
}: {
  appId: string;
  sourceType: string;
  job: SyncJob | null;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [schedule, setSchedule] = useState(job?.schedule ?? "manual");
  const [cronExpression, setCronExpression] = useState(job?.cronExpression ?? "");
  const [saving, setSaving] = useState(false);
  const [triggering, setTriggering] = useState(false);

  const saveMut = useMutation({
    mutationFn: () =>
      createOrUpdateSyncJob(appId, {
        sourceType,
        schedule,
        cronExpression: schedule === "custom" ? cronExpression : undefined,
        enabled: schedule !== "manual",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sync-jobs", appId] });
      setSaving(false);
    },
  });

  const triggerMut = useMutation({
    mutationFn: () => triggerSyncJob(appId, job!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sync-jobs", appId] });
      setTriggering(false);
    },
  });

  const handleSave = async () => {
    setSaving(true);
    await saveMut.mutateAsync();
  };

  const handleTrigger = async () => {
    if (!job) return;
    setTriggering(true);
    await triggerMut.mutateAsync();
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">{SOURCE_LABELS[sourceType] ?? sourceType}</CardTitle>
          {job && (
            <Badge
              variant={
                job.status === "completed" ? "default" :
                job.status === "running" ? "secondary" :
                job.status === "failed" ? "destructive" : "outline"
              }
            >
              {job.status}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {job?.lastRunAt && (
          <p className="text-xs text-muted-foreground">
            Last sync: {new Date(job.lastRunAt).toLocaleString()}
          </p>
        )}
        {job?.lastError && (
          <p className="text-xs text-red-500 flex items-center gap-1">
            <X className="h-3 w-3" /> {job.lastError}
          </p>
        )}

        <div className="flex gap-2 items-center">
          <select
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
            value={schedule}
            onChange={(e) => setSchedule(e.target.value as "manual" | "daily" | "weekly" | "custom")}
          >
            {SCHEDULE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {schedule === "custom" && (
            <Input
              placeholder="0 2 * * * (cron)"
              value={cronExpression}
              onChange={(e) => setCronExpression(e.target.value)}
              className="max-w-[200px]"
            />
          )}
        </div>

        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Clock className="h-3 w-3 mr-1" />}
            Save Schedule
          </Button>
          {job && (
            <Button size="sm" onClick={handleTrigger} disabled={triggering || job.status === "running"}>
              {triggering ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Play className="h-3 w-3 mr-1" />}
              Sync Now
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
