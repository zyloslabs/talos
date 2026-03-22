"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getTestRuns,
  getArtifacts,
  getTests,
  type TalosTestRun,
  type TalosTestArtifact,
  type TalosTest,
} from "@/lib/api";
import { cn, formatDuration, formatRelativeTime } from "@/lib/utils";
import { useState } from "react";
import {
  Image,
  Video,
  FileText,
  Activity,
  Eye,
  Download,
  FileImage,
  Clock,
  CheckCircle2,
  XCircle,
  ExternalLink,
} from "lucide-react";

const artifactTypeIcons: Record<string, React.ElementType> = {
  screenshot: Image,
  video: Video,
  trace: Activity,
  log: FileText,
  report: FileText,
  diff: FileImage,
};

function RunSelector({
  runs,
  selectedRunId,
  onSelect,
  tests,
}: {
  runs: TalosTestRun[];
  selectedRunId: string | null;
  onSelect: (id: string) => void;
  tests: TalosTest[];
}) {
  const getTestName = (testId: string) => {
    const test = tests.find((t) => t.id === testId);
    return test?.name || "Unknown Test";
  };

  return (
    <div className="space-y-2">
      {runs.map((run) => (
        <Card
          key={run.id}
          className={cn(
            "cursor-pointer transition-colors hover:bg-accent",
            selectedRunId === run.id && "border-primary"
          )}
          onClick={() => onSelect(run.id)}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {run.status === "passed" ? (
                  <CheckCircle2 className="h-4 w-4 text-success" />
                ) : run.status === "failed" ? (
                  <XCircle className="h-4 w-4 text-destructive" />
                ) : (
                  <Clock className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="font-medium text-sm line-clamp-1">
                  {getTestName(run.testId)}
                </span>
              </div>
              <Badge
                variant={
                  run.status === "passed"
                    ? "success"
                    : run.status === "failed"
                    ? "destructive"
                    : "secondary"
                }
                className="text-xs"
              >
                {run.status}
              </Badge>
            </div>
            <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
              <span>{formatRelativeTime(run.createdAt)}</span>
              <span>{formatDuration(run.durationMs)}</span>
              <span>{run.browser}</span>
            </div>
            {run.errorMessage && (
              <p className="mt-2 text-xs text-destructive line-clamp-2">{run.errorMessage}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ArtifactCard({
  artifact,
  onView,
}: {
  artifact: TalosTestArtifact;
  onView: (artifact: TalosTestArtifact) => void;
}) {
  const Icon = artifactTypeIcons[artifact.type] || FileText;
  const sizeKb = Math.round(artifact.sizeBytes / 1024);

  return (
    <Card className="animate-slide-in">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-primary" />
            <div>
              <p className="font-medium text-sm">{artifact.stepName || artifact.type}</p>
              <p className="text-xs text-muted-foreground">
                {artifact.mimeType} · {sizeKb} KB
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" onClick={() => onView(artifact)}>
              <Eye className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" asChild>
              <a href={`/api/talos/artifacts/${artifact.id}/download`} download>
                <Download className="h-4 w-4" />
              </a>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ArtifactViewerDialog({
  artifact,
  open,
  onOpenChange,
}: {
  artifact: TalosTestArtifact | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!artifact) return null;

  const renderContent = () => {
    if (artifact.type === "screenshot" || artifact.type === "diff") {
      return (
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/talos/artifacts/${artifact.id}/content`}
            alt={artifact.stepName || "Screenshot"}
            className="max-w-full max-h-[60vh] object-contain rounded-md"
          />
        </div>
      );
    }

    if (artifact.type === "video") {
      return (
        <video
          src={`/api/talos/artifacts/${artifact.id}/content`}
          controls
          className="max-w-full max-h-[60vh] rounded-md"
        />
      );
    }

    if (artifact.type === "trace") {
      return (
        <div className="text-center p-8">
          <Activity className="mx-auto h-12 w-12 text-muted-foreground" />
          <p className="mt-4">
            <Button asChild>
              <a
                href={`/api/talos/artifacts/${artifact.id}/trace`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Open in Trace Viewer
              </a>
            </Button>
          </p>
        </div>
      );
    }

    return (
      <div className="p-4 bg-muted rounded-md">
        <pre className="text-sm overflow-auto max-h-[60vh]">
          {/* Log content would be fetched here */}
          Loading...
        </pre>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{artifact.stepName || artifact.type}</DialogTitle>
          <DialogDescription>
            {artifact.mimeType} · {Math.round(artifact.sizeBytes / 1024)} KB
          </DialogDescription>
        </DialogHeader>
        {renderContent()}
      </DialogContent>
    </Dialog>
  );
}

export function ArtifactViewer() {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string>("all");
  const [viewingArtifact, setViewingArtifact] = useState<TalosTestArtifact | null>(null);

  const { data: runs = [] } = useQuery({
    queryKey: ["testRuns"],
    queryFn: () => getTestRuns(),
  });

  const { data: tests = [] } = useQuery({
    queryKey: ["tests"],
    queryFn: () => getTests(),
  });

  const { data: artifacts = [] } = useQuery({
    queryKey: ["artifacts", selectedRunId],
    queryFn: () => (selectedRunId ? getArtifacts(selectedRunId) : Promise.resolve([])),
    enabled: !!selectedRunId,
  });

  const filteredArtifacts =
    selectedType === "all"
      ? artifacts
      : artifacts.filter((a) => a.type === selectedType);

  const artifactTypes = ["all", "screenshot", "video", "trace", "log", "report", "diff"];

  // Sort runs by date, most recent first
  const sortedRuns = [...runs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Artifacts</h1>
        <p className="text-muted-foreground">
          View screenshots, videos, traces, and logs from test runs
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <div className="space-y-4">
          <h2 className="font-semibold">Recent Runs</h2>
          <div className="max-h-[calc(100vh-300px)] overflow-auto pr-2">
            {sortedRuns.length > 0 ? (
              <RunSelector
                runs={sortedRuns.slice(0, 20)}
                selectedRunId={selectedRunId}
                onSelect={setSelectedRunId}
                tests={tests}
              />
            ) : (
              <p className="text-sm text-muted-foreground">No test runs yet</p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {selectedRunId ? (
            <>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">
                  Artifacts ({filteredArtifacts.length})
                </h2>
                <Tabs value={selectedType} onValueChange={setSelectedType}>
                  <TabsList>
                    {artifactTypes.map((type) => (
                      <TabsTrigger key={type} value={type} className="capitalize text-xs">
                        {type === "all" ? "All" : type}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </div>

              {filteredArtifacts.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {filteredArtifacts.map((artifact) => (
                    <ArtifactCard
                      key={artifact.id}
                      artifact={artifact}
                      onView={setViewingArtifact}
                    />
                  ))}
                </div>
              ) : (
                <Card className="p-8 text-center">
                  <FileImage className="mx-auto h-10 w-10 text-muted-foreground" />
                  <p className="mt-2 text-sm text-muted-foreground">
                    No {selectedType === "all" ? "" : selectedType} artifacts for this run
                  </p>
                </Card>
              )}
            </>
          ) : (
            <Card className="p-12 text-center">
              <FileImage className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">Select a test run</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Choose a test run from the list to view its artifacts.
              </p>
            </Card>
          )}
        </div>
      </div>

      <ArtifactViewerDialog
        artifact={viewingArtifact}
        open={!!viewingArtifact}
        onOpenChange={(open) => !open && setViewingArtifact(null)}
      />
    </div>
  );
}
