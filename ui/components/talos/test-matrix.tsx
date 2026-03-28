"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getTests,
  getTestRuns as fetchTestRuns,
  getApplications,
  getVaultRoles,
  getExportInfo,
  triggerTestRun,
  updateTest,
  type TalosTest,
  type TalosTestRun,
  type TalosVaultRole,
} from "@/lib/api";
import { cn, formatDuration, formatRelativeTime } from "@/lib/utils";
import { useTestRunUpdates } from "@/lib/socket";
import { useState, useCallback } from "react";
import {
  CheckCircle2,
  Clock,
  Play,
  TestTube2,
  XCircle,
  AlertCircle,
  Loader2,
  Code,
  Tag,
  GitBranch,
  ExternalLink,
} from "lucide-react";
import { GitHubExportDialog } from "@/components/talos/github-export-dialog";
import { TestCodeViewer } from "@/components/talos/test-code-viewer";
import { TestExplainPanel } from "@/components/talos/test-explain-panel";

const statusIcons: Record<string, React.ElementType> = {
  passed: CheckCircle2,
  failed: XCircle,
  running: Loader2,
  queued: Clock,
  skipped: AlertCircle,
  cancelled: AlertCircle,
};

const testTypeColors: Record<string, string> = {
  e2e: "bg-blue-500",
  smoke: "bg-green-500",
  regression: "bg-purple-500",
  accessibility: "bg-orange-500",
  unit: "bg-gray-500",
};

function TestCard({
  test,
  runs,
  vaultRoles,
  onRun,
  onViewCode,
}: {
  test: TalosTest;
  runs: TalosTestRun[];
  vaultRoles: TalosVaultRole[];
  onRun: (testId: string, vaultRoleId?: string) => void;
  onViewCode: (test: TalosTest) => void;
}) {
  const latestRun = runs[0];
  const StatusIcon = latestRun ? statusIcons[latestRun.status] || AlertCircle : Clock;
  const [selectedRole, setSelectedRole] = useState<string>("none");

  const passCount = runs.filter((r) => r.status === "passed").length;
  const failCount = runs.filter((r) => r.status === "failed").length;
  const passRate = runs.length > 0 ? Math.round((passCount / runs.length) * 100) : 0;

  return (
    <Card className="animate-slide-in">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={cn("h-2 w-2 rounded-full", testTypeColors[test.type])} />
            <CardTitle className="text-base line-clamp-1">{test.name}</CardTitle>
          </div>
          <Badge
            variant={
              latestRun?.status === "passed" ? "success" : latestRun?.status === "failed" ? "destructive" : "secondary"
            }
          >
            <StatusIcon className={cn("mr-1 h-3 w-3", latestRun?.status === "running" && "animate-spin")} />
            {latestRun?.status || "Not Run"}
          </Badge>
        </div>
        <CardDescription className="line-clamp-2">{test.description || `${test.type} test`}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <span>{passCount}</span>
            </div>
            <div className="flex items-center gap-1">
              <XCircle className="h-4 w-4 text-destructive" />
              <span>{failCount}</span>
            </div>
            <div className="text-muted-foreground">{passRate}% pass rate</div>
          </div>

          {test.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {test.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  <Tag className="mr-1 h-3 w-3" />
                  {tag}
                </Badge>
              ))}
              {test.tags.length > 3 && (
                <Badge variant="outline" className="text-xs">
                  +{test.tags.length - 3}
                </Badge>
              )}
            </div>
          )}

          {latestRun && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>{formatDuration(latestRun.durationMs)}</span>
              <span>·</span>
              <span>{formatRelativeTime(latestRun.createdAt)}</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            {vaultRoles.length > 0 && (
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger className="h-8 w-[140px] text-xs">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No role</SelectItem>
                  {vaultRoles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button size="sm" onClick={() => onRun(test.id, selectedRole === "none" ? undefined : selectedRole)}>
              <Play className="mr-1 h-3 w-3" />
              Run
            </Button>
            <Button size="sm" variant="outline" onClick={() => onViewCode(test)}>
              <Code className="mr-1 h-3 w-3" />
              Code
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CodeViewerDialog({
  test,
  open,
  onOpenChange,
}: {
  test: TalosTest | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [selectedCode, setSelectedCode] = useState<string | undefined>(undefined);

  if (!test) return null;

  const handleSave = async (code: string) => {
    await updateTest(test.id, { code });
    queryClient.invalidateQueries({ queryKey: ["tests"] });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{test.name}</DialogTitle>
          <DialogDescription>
            {test.type} test · v{test.version}
            {test.generationConfidence !== null && (
              <span className="ml-2">· AI confidence: {Math.round(test.generationConfidence * 100)}%</span>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col md:flex-row gap-4 min-h-0 flex-1 overflow-hidden">
          <div className="flex-1 min-w-0 min-h-0">
            <TestCodeViewer
              testId={test.id}
              code={test.code}
              height="500px"
              onSave={handleSave}
              onSelectionChange={setSelectedCode}
            />
          </div>
          <div className="w-full md:w-72 shrink-0">
            <TestExplainPanel testId={test.id} selectedCode={selectedCode} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function TestMatrix() {
  const queryClient = useQueryClient();
  const [selectedApp, setSelectedApp] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [codeViewerTest, setCodeViewerTest] = useState<TalosTest | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  const { data: apps = [] } = useQuery({
    queryKey: ["applications"],
    queryFn: getApplications,
  });

  const { data: tests = [] } = useQuery({
    queryKey: ["tests", selectedApp],
    queryFn: () => getTests(selectedApp === "all" ? undefined : selectedApp),
  });

  const { data: runs = [] } = useQuery({
    queryKey: ["testRuns"],
    queryFn: () => fetchTestRuns(),
  });

  const { data: vaultRoles = [] } = useQuery({
    queryKey: ["vaultRoles", selectedApp],
    queryFn: () => getVaultRoles(selectedApp === "all" ? undefined : selectedApp),
  });

  const { data: exportInfo } = useQuery({
    queryKey: ["export-info", selectedApp],
    queryFn: () => getExportInfo(selectedApp),
    enabled: selectedApp !== "all",
  });

  const runMutation = useMutation({
    mutationFn: ({ testId, vaultRoleId }: { testId: string; vaultRoleId?: string }) =>
      triggerTestRun(testId, { vaultRoleId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["testRuns"] }),
  });

  // Real-time updates
  const handleRunUpdate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["testRuns"] });
  }, [queryClient]);

  useTestRunUpdates(handleRunUpdate);

  const filteredTests = tests.filter((test) => {
    if (selectedType !== "all" && test.type !== selectedType) return false;
    return true;
  });

  const getRunsForTest = (testId: string) => runs.filter((r) => r.testId === testId);

  const handleRun = (testId: string, vaultRoleId?: string) => {
    runMutation.mutate({ testId, vaultRoleId });
  };

  const testTypes = ["all", "e2e", "smoke", "regression", "accessibility", "unit"];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Test Library</h1>
          <p className="text-muted-foreground">Manage and run your generated test cases</p>
        </div>
        {selectedApp !== "all" && (
          <Button variant="outline" size="sm" onClick={() => setExportDialogOpen(true)}>
            <GitBranch className="mr-2 h-4 w-4" />
            Export to GitHub
          </Button>
        )}
      </div>

      {selectedApp !== "all" && exportInfo?.exportRepoUrl && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Last exported to:</span>
          <a
            href={`https://github.com/${exportInfo.exportRepoUrl}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 font-medium text-foreground hover:underline"
          >
            {exportInfo.exportRepoUrl}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <Select value={selectedApp} onValueChange={setSelectedApp}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by app" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Applications</SelectItem>
            {apps.map((app) => (
              <SelectItem key={app.id} value={app.id}>
                {app.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Tabs value={selectedType} onValueChange={setSelectedType}>
          <TabsList>
            {testTypes.map((type) => (
              <TabsTrigger key={type} value={type} className="capitalize">
                {type === "all" ? "All" : type}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {filteredTests.length > 0 ? (
        <div className="test-grid">
          {filteredTests.map((test) => (
            <TestCard
              key={test.id}
              test={test}
              runs={getRunsForTest(test.id)}
              vaultRoles={vaultRoles.filter((r) => r.applicationId === test.applicationId)}
              onRun={handleRun}
              onViewCode={setCodeViewerTest}
            />
          ))}
        </div>
      ) : (
        <Card className="p-12 text-center">
          <TestTube2 className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">No tests found</h3>
          <p className="mt-2 text-sm text-muted-foreground">Run discovery on an application to generate test cases.</p>
        </Card>
      )}

      <CodeViewerDialog
        test={codeViewerTest}
        open={!!codeViewerTest}
        onOpenChange={(open) => !open && setCodeViewerTest(null)}
      />

      <GitHubExportDialog
        applicationId={selectedApp}
        currentExportRepo={exportInfo?.exportRepoUrl ?? undefined}
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
      />
    </div>
  );
}
