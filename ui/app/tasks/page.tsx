"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { NavTabs } from "@/components/talos/nav-tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getTasks, getTaskStats,
  type AgentTask, type TaskStats,
} from "@/lib/api";
import { ListTodo, RefreshCw, AlertCircle, CheckCircle, Clock, Loader2, XCircle } from "lucide-react";
import { useState } from "react";

const STATUS_ICONS: Record<string, React.ReactNode> = {
  pending: <Clock className="h-4 w-4 text-yellow-500" />,
  running: <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />,
  completed: <CheckCircle className="h-4 w-4 text-green-500" />,
  failed: <XCircle className="h-4 w-4 text-red-500" />,
  cancelled: <AlertCircle className="h-4 w-4 text-muted-foreground" />,
};

const STATUS_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  running: "default",
  completed: "default",
  failed: "destructive",
  cancelled: "outline",
};

export default function TasksPage() {
  const qc = useQueryClient();
  const { data: tasks, isLoading } = useQuery({ queryKey: ["tasks"], queryFn: () => getTasks(), refetchInterval: 5000 });
  const { data: stats } = useQuery({ queryKey: ["task-stats"], queryFn: () => getTaskStats(), refetchInterval: 5000 });

  return (
    <div className="flex flex-col h-full">
      <NavTabs />
      <main className="flex-1 overflow-auto container px-4 md:px-6 py-4 md:py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <ListTodo className="h-6 w-6" />
            <h1 className="text-2xl font-bold">Task Queue</h1>
          </div>
          <Button variant="outline" size="sm" onClick={() => { qc.invalidateQueries({ queryKey: ["tasks"] }); qc.invalidateQueries({ queryKey: ["task-stats"] }); }}>
            <RefreshCw className="h-4 w-4 mr-1" />Refresh
          </Button>
        </div>

        {stats && <StatsBar stats={stats as TaskStats} />}

        <Tabs defaultValue="all" className="mt-4">
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="running">Running</TabsTrigger>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
            <TabsTrigger value="failed">Failed</TabsTrigger>
          </TabsList>

          {["all", "running", "pending", "completed", "failed"].map((tab) => (
            <TabsContent key={tab} value={tab} className="space-y-3 mt-4">
              {(tasks as AgentTask[] | undefined)
                ?.filter((t) => tab === "all" || t.status === tab)
                .map((t) => <TaskCard key={t.id} task={t} />)}
              {(!tasks || (tasks as AgentTask[]).filter((t) => tab === "all" || t.status === tab).length === 0) && (
                <div className="text-center py-8 text-muted-foreground">
                  {isLoading ? "Loading..." : "No tasks found"}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </main>
    </div>
  );
}

function StatsBar({ stats }: { stats: TaskStats }) {
  const total = stats.pending + stats.running + stats.completed + stats.failed;
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {[
        { label: "Pending", value: stats.pending, color: "text-yellow-500" },
        { label: "Running", value: stats.running, color: "text-blue-500" },
        { label: "Completed", value: stats.completed, color: "text-green-500" },
        { label: "Failed", value: stats.failed, color: "text-red-500" },
        { label: "Total", value: total, color: "" },
      ].map((s) => (
        <Card key={s.label}>
          <CardContent className="pt-4 pb-3 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function TaskCard({ task }: { task: AgentTask }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="cursor-pointer" onClick={() => setExpanded(!expanded)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {STATUS_ICONS[task.status] ?? null}
            <CardTitle className="text-sm font-medium">{task.prompt.substring(0, 100)}{task.prompt.length > 100 ? "..." : ""}</CardTitle>
          </div>
          <Badge variant={STATUS_COLORS[task.status] ?? "secondary"}>{task.status}</Badge>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="text-sm space-y-2">
          <p className="font-mono text-xs bg-muted p-2 rounded whitespace-pre-wrap">{task.prompt}</p>
          {task.result && (
            <div>
              <p className="text-xs font-medium mb-1">Result:</p>
              <p className="font-mono text-xs bg-muted p-2 rounded whitespace-pre-wrap max-h-48 overflow-auto">{task.result}</p>
            </div>
          )}
          {task.error && (
            <div>
              <p className="text-xs font-medium text-destructive mb-1">Error:</p>
              <p className="font-mono text-xs bg-destructive/10 p-2 rounded">{task.error}</p>
            </div>
          )}
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>Created: {new Date(task.createdAt).toLocaleString()}</span>
            {task.startedAt && <span>Started: {new Date(task.startedAt).toLocaleString()}</span>}
            {task.completedAt && <span>Completed: {new Date(task.completedAt).toLocaleString()}</span>}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
