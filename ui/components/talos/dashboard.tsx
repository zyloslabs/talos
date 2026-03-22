"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getApplications,
  getStats,
  createApplication,
  triggerDiscovery,
  type TalosApplication,
  type TalosStats,
} from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  BarChart3,
  CheckCircle2,
  Clock,
  FolderGit2,
  Plus,
  RefreshCw,
  TestTube2,
  XCircle,
} from "lucide-react";

function StatCard({
  title,
  value,
  description,
  icon: Icon,
}: {
  title: string;
  value: string | number;
  description?: string;
  icon: React.ElementType;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </CardContent>
    </Card>
  );
}

function ApplicationCard({
  app,
  onScan,
}: {
  app: TalosApplication;
  onScan: (id: string) => void;
}) {
  return (
    <Card className="animate-slide-in">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{app.name}</CardTitle>
          <Badge variant={app.status === "active" ? "success" : "secondary"}>
            {app.status}
          </Badge>
        </div>
        <CardDescription>{app.description || "No description"}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm">
          {app.repositoryUrl && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <FolderGit2 className="h-4 w-4" />
              <span className="truncate">{app.repositoryUrl}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>Updated {formatRelativeTime(app.updatedAt)}</span>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Button size="sm" variant="outline" onClick={() => onScan(app.id)}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Scan
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AddApplicationDialog({ onAdd }: { onAdd: (data: { name: string; repositoryUrl?: string; baseUrl?: string }) => void }) {
  const [name, setName] = useState("");
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [open, setOpen] = useState(false);

  const handleSubmit = () => {
    if (name.trim()) {
      onAdd({ name: name.trim(), repositoryUrl: repositoryUrl.trim() || undefined, baseUrl: baseUrl.trim() || undefined });
      setName("");
      setRepositoryUrl("");
      setBaseUrl("");
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Application
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Application</DialogTitle>
          <DialogDescription>Add a new application to test with Talos.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium">
              Application Name
            </label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Application"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="repositoryUrl" className="text-sm font-medium">
              Repository URL
            </label>
            <Input
              id="repositoryUrl"
              value={repositoryUrl}
              onChange={(e) => setRepositoryUrl(e.target.value)}
              placeholder="https://github.com/org/repo"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="baseUrl" className="text-sm font-medium">
              Base URL
            </label>
            <Input
              id="baseUrl"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://app.example.com"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim()}>
            Add Application
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function Dashboard() {
  const { data: apps, refetch: refetchApps } = useQuery({
    queryKey: ["applications"],
    queryFn: getApplications,
  });

  const { data: stats } = useQuery({
    queryKey: ["stats"],
    queryFn: getStats,
  });

  const handleAddApplication = async (data: { name: string; repositoryUrl?: string; baseUrl?: string }) => {
    try {
      await createApplication(data);
      refetchApps();
    } catch {
      // Error handled silently - could add toast notification here
    }
  };

  const handleScan = async (applicationId: string) => {
    try {
      await triggerDiscovery(applicationId);
    } catch {
      // Error handled silently - could add toast notification here
    }
  };

  const defaultStats: TalosStats = { applications: 0, tests: 0, recentRuns: 0, passRate: 0 };
  const displayStats = stats || defaultStats;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of your test automation environment
          </p>
        </div>
        <AddApplicationDialog onAdd={handleAddApplication} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Applications"
          value={displayStats.applications}
          description="Total registered apps"
          icon={FolderGit2}
        />
        <StatCard
          title="Tests"
          value={displayStats.tests}
          description="Generated test cases"
          icon={TestTube2}
        />
        <StatCard
          title="Recent Runs"
          value={displayStats.recentRuns}
          description="Last 24 hours"
          icon={BarChart3}
        />
        <StatCard
          title="Pass Rate"
          value={`${displayStats.passRate}%`}
          description="Overall success rate"
          icon={displayStats.passRate >= 80 ? CheckCircle2 : XCircle}
        />
      </div>

      <div>
        <h2 className="mb-4 text-xl font-semibold">Applications</h2>
        {apps && apps.length > 0 ? (
          <div className="test-grid">
            {apps.map((app) => (
              <ApplicationCard key={app.id} app={app} onScan={handleScan} />
            ))}
          </div>
        ) : (
          <Card className="p-12 text-center">
            <FolderGit2 className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">No applications yet</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Get started by adding your first application to test.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
