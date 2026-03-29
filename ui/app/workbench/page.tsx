"use client";

import { Suspense, useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSearchParams, useRouter } from "next/navigation";
import { useSocket } from "@/lib/socket";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  getApplications,
  startOrchestration,
  getOrchestrationStatus,
  type TalosApplication,
  type OrchestrateResult,
} from "@/lib/api";
import {
  Wand2,
  Play,
  CheckCircle2,
  XCircle,
  Loader2,
  Settings2,
  Search,
  Database,
  Sparkles,
  TestTube2,
  BarChart3,
  ChevronRight,
  Zap,
} from "lucide-react";

const STEPS = [
  {
    id: "discover",
    label: "Discover",
    icon: Search,
    description: "Crawl application and discover pages, forms, and flows",
  },
  {
    id: "index",
    label: "Index",
    icon: Database,
    description: "Index discovered content into the knowledge base for RAG",
  },
  {
    id: "generate",
    label: "Generate",
    icon: Sparkles,
    description: "AI-generate test cases based on discovered content",
  },
  { id: "execute", label: "Execute", icon: TestTube2, description: "Run generated tests against the application" },
] as const;

type WizardStep = "select-app" | "configure" | "running" | "results";
const WIZARD_STEPS: WizardStep[] = ["select-app", "configure", "running", "results"];

function stepToIndex(step: WizardStep): number {
  return WIZARD_STEPS.indexOf(step);
}

export default function WorkbenchPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      }
    >
      <WorkbenchContent />
    </Suspense>
  );
}

function WorkbenchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Restore step from URL on initial load
  const initialStep = (() => {
    const urlStep = searchParams.get("step");
    if (urlStep) {
      const idx = parseInt(urlStep, 10) - 1;
      if (idx >= 0 && idx < WIZARD_STEPS.length) return WIZARD_STEPS[idx];
    }
    return "select-app" as WizardStep;
  })();

  const [wizardStep, setWizardStepRaw] = useState<WizardStep>(initialStep);
  const [selectedApp, setSelectedApp] = useState<TalosApplication | null>(null);
  const [selectedSteps, setSelectedSteps] = useState<string[]>(STEPS.map((s) => s.id));
  const [stepConfigs, setStepConfigs] = useState<Record<string, Record<string, string>>>({});
  const [result, setResult] = useState<OrchestrateResult | null>(null);
  const [liveStepStatus, setLiveStepStatus] = useState<Record<string, string>>({});
  const [orchestrationMode, setOrchestrationMode] = useState<"task" | "session">("task");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sync wizard step to URL param
  const setWizardStep = useCallback(
    (step: WizardStep) => {
      setWizardStepRaw(step);
      const stepNum = stepToIndex(step) + 1;
      const params = new URLSearchParams(searchParams.toString());
      params.set("step", String(stepNum));
      router.replace(`/workbench?${params.toString()}`);
    },
    [searchParams, router]
  );

  const { data: apps } = useQuery({ queryKey: ["applications"], queryFn: getApplications });
  const { subscribe } = useSocket();

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const orchestrateMut = useMutation({
    mutationFn: () =>
      startOrchestration({
        applicationId: selectedApp!.id,
        steps: selectedSteps,
        config: stepConfigs,
        mode: orchestrationMode,
      }),
    onSuccess: (data) => {
      setResult(data);
      // Subscribe to live step events
      subscribe<{ runId: string; step: string; status: string }>("orchestration:step", (event) => {
        if (event.runId === data.runId) {
          setLiveStepStatus((prev) => ({ ...prev, [event.step]: event.status }));
        }
      });
      subscribe<{ runId: string; status: string }>("orchestration:completed", (event) => {
        if (event.runId === data.runId) {
          setResult((prev) => (prev ? { ...prev, status: "completed" } : prev));
        }
      });
      setWizardStep("running");
      // Poll for completion
      if (pollRef.current) clearInterval(pollRef.current);
      const poll = setInterval(async () => {
        try {
          const status = await getOrchestrationStatus(data.runId);
          if (status.status === "completed" || status.status === "failed") {
            setResult(status);
            setWizardStep("results");
            clearInterval(poll);
            pollRef.current = null;
          }
        } catch {
          clearInterval(poll);
          pollRef.current = null;
        }
      }, 2000);
      pollRef.current = poll;
    },
  });

  const toggleStep = (stepId: string) => {
    setSelectedSteps((prev) => (prev.includes(stepId) ? prev.filter((s) => s !== stepId) : [...prev, stepId]));
  };

  const handleReset = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setWizardStep("select-app");
    setSelectedApp(null);
    setSelectedSteps(STEPS.map((s) => s.id));
    setStepConfigs({});
    setResult(null);
    setLiveStepStatus({});
    setOrchestrationMode("task");
  };

  // Step validation: can only advance forward when criteria are met
  const canAdvanceTo = (target: WizardStep): boolean => {
    switch (target) {
      case "configure":
        return selectedApp !== null;
      case "running":
        return selectedApp !== null && selectedSteps.length > 0;
      case "results":
        return result !== null;
      default:
        return true;
    }
  };

  return (
    <div className="flex flex-col h-full">
      <main className="flex-1 overflow-auto container px-4 md:px-6 py-4 md:py-6 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Wand2 className="h-6 w-6" />
            <h1 className="text-2xl font-bold">Test Workbench</h1>
          </div>
          {wizardStep !== "select-app" && (
            <Button variant="outline" size="sm" onClick={handleReset}>
              Start Over
            </Button>
          )}
        </div>

        {/* Progress Indicator */}
        <div className="flex items-center gap-2 mb-8">
          {(["select-app", "configure", "running", "results"] as const).map((step, i) => (
            <div key={step} className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                  wizardStep === step
                    ? "bg-primary text-primary-foreground"
                    : ["select-app", "configure", "running", "results"].indexOf(wizardStep) > i
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {i + 1}
              </div>
              <span className={`text-sm ${wizardStep === step ? "font-medium" : "text-muted-foreground"}`}>
                {step === "select-app"
                  ? "Select App"
                  : step === "configure"
                    ? "Configure"
                    : step === "running"
                      ? "Running"
                      : "Results"}
              </span>
              {i < 3 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </div>
          ))}
        </div>

        {/* Step 1: Select Application (#230) */}
        {wizardStep === "select-app" && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {apps?.map((app) => (
              <Card
                key={app.id}
                className={`cursor-pointer transition-all hover:ring-2 hover:ring-primary ${selectedApp?.id === app.id ? "ring-2 ring-primary" : ""}`}
                onClick={() => {
                  setSelectedApp(app);
                  setWizardStep("configure");
                }}
              >
                <CardHeader>
                  <CardTitle className="text-base">{app.name}</CardTitle>
                  <CardDescription className="text-xs">{app.baseUrl}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Badge variant="secondary">{app.status}</Badge>
                </CardContent>
              </Card>
            ))}
            {(!apps || apps.length === 0) && (
              <div className="col-span-full text-center py-12 text-muted-foreground">
                No applications registered. Add one from the Dashboard first.
              </div>
            )}
          </div>
        )}

        {/* Step 2: Configure Steps (#231) */}
        {wizardStep === "configure" && selectedApp && (
          <div className="space-y-4 max-w-2xl">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Target: {selectedApp.name}</CardTitle>
                <CardDescription>{selectedApp.baseUrl}</CardDescription>
              </CardHeader>
            </Card>

            <h3 className="text-sm font-medium">Pipeline Steps</h3>
            {STEPS.map((step) => {
              const Icon = step.icon;
              const enabled = selectedSteps.includes(step.id);
              return (
                <Card key={step.id} className={`transition-opacity ${enabled ? "" : "opacity-50"}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <button
                        className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${enabled ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground"}`}
                        onClick={() => toggleStep(step.id)}
                      >
                        {enabled && <CheckCircle2 className="h-3 w-3" />}
                      </button>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          <span className="font-medium text-sm">{step.label}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                        {enabled && (
                          <div className="mt-2 space-y-1">
                            {step.id === "discover" && (
                              <Input
                                className="h-7 text-xs"
                                placeholder="Max pages to crawl (default: 50)"
                                value={stepConfigs.discover?.maxPages ?? ""}
                                onChange={(e) =>
                                  setStepConfigs((prev) => ({
                                    ...prev,
                                    discover: { ...prev.discover, maxPages: e.target.value },
                                  }))
                                }
                              />
                            )}
                            {step.id === "generate" && (
                              <Input
                                className="h-7 text-xs"
                                placeholder="Test types: e2e, smoke, accessibility (comma-separated)"
                                value={stepConfigs.generate?.testTypes ?? ""}
                                onChange={(e) =>
                                  setStepConfigs((prev) => ({
                                    ...prev,
                                    generate: { ...prev.generate, testTypes: e.target.value },
                                  }))
                                }
                              />
                            )}
                            {step.id === "execute" && (
                              <Input
                                className="h-7 text-xs"
                                placeholder="Browser: chromium, firefox, webkit (default: chromium)"
                                value={stepConfigs.execute?.browser ?? ""}
                                onChange={(e) =>
                                  setStepConfigs((prev) => ({
                                    ...prev,
                                    execute: { ...prev.execute, browser: e.target.value },
                                  }))
                                }
                              />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            <div className="flex justify-between items-center pt-2">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Orchestration Mode:</span>
                <div className="flex rounded-md border">
                  <button
                    className={`px-3 py-1 text-xs font-medium rounded-l-md transition-colors ${
                      orchestrationMode === "task" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                    }`}
                    onClick={() => setOrchestrationMode("task")}
                  >
                    Task (N+1 calls)
                  </button>
                  <button
                    className={`px-3 py-1 text-xs font-medium rounded-r-md transition-colors ${
                      orchestrationMode === "session" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                    }`}
                    onClick={() => setOrchestrationMode("session")}
                  >
                    Session (~2 calls)
                  </button>
                </div>
              </div>
              <Button
                onClick={() => orchestrateMut.mutate()}
                disabled={selectedSteps.length === 0 || orchestrateMut.isPending}
              >
                {orchestrateMut.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-1" />
                    Start Pipeline
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Running (#232) */}
        {wizardStep === "running" && result && (
          <div className="max-w-2xl space-y-4">
            <Card>
              <CardContent className="p-6 text-center">
                <Loader2 className="h-10 w-10 animate-spin mx-auto mb-3 text-primary" />
                <h3 className="text-lg font-medium">Pipeline Running</h3>
                <p className="text-sm text-muted-foreground">Run ID: {result.runId.slice(0, 8)}</p>
              </CardContent>
            </Card>

            <div className="space-y-2">
              {selectedSteps.map((stepId) => {
                const stepDef = STEPS.find((s) => s.id === stepId);
                const status = liveStepStatus[stepId] ?? "pending";
                const Icon = stepDef?.icon ?? Settings2;
                return (
                  <div key={stepId} className="flex items-center gap-3 p-3 rounded border">
                    <Icon className="h-4 w-4" />
                    <span className="text-sm flex-1">{stepDef?.label ?? stepId}</span>
                    {status === "pending" && <Badge variant="outline">Pending</Badge>}
                    {status === "running" && (
                      <Badge variant="secondary">
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        Running
                      </Badge>
                    )}
                    {status === "completed" && (
                      <Badge variant="default" className="bg-green-600">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Done
                      </Badge>
                    )}
                    {status === "failed" && (
                      <Badge variant="destructive">
                        <XCircle className="h-3 w-3 mr-1" />
                        Failed
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 4: Results Dashboard (#233) */}
        {wizardStep === "results" && result && (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardContent className="p-4 text-center">
                  <BarChart3 className="h-8 w-8 mx-auto mb-2 text-primary" />
                  <p className="text-2xl font-bold">{result.status === "completed" ? "100%" : "—"}</p>
                  <p className="text-xs text-muted-foreground">Completion</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <TestTube2 className="h-8 w-8 mx-auto mb-2 text-green-600" />
                  <p className="text-2xl font-bold">{result.steps.filter((s) => s.status === "completed").length}</p>
                  <p className="text-xs text-muted-foreground">Steps Passed</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <XCircle className="h-8 w-8 mx-auto mb-2 text-red-500" />
                  <p className="text-2xl font-bold">{result.steps.filter((s) => s.status === "failed").length}</p>
                  <p className="text-xs text-muted-foreground">Steps Failed</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-blue-500" />
                  <p className="text-2xl font-bold">{result.status}</p>
                  <p className="text-xs text-muted-foreground">Overall Status</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pipeline Steps</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {selectedSteps.map((stepId) => {
                    const stepDef = STEPS.find((s) => s.id === stepId);
                    const stepResult = result.steps.find((s) => s.name === stepId);
                    const Icon = stepDef?.icon ?? Settings2;
                    return (
                      <div key={stepId} className="flex items-center gap-3 p-2 rounded border">
                        <Icon className="h-4 w-4" />
                        <span className="text-sm flex-1 font-medium">{stepDef?.label ?? stepId}</span>
                        <Badge
                          variant={
                            stepResult?.status === "completed"
                              ? "default"
                              : stepResult?.status === "failed"
                                ? "destructive"
                                : "outline"
                          }
                        >
                          {stepResult?.status ?? "skipped"}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-2">
              <Button variant="outline" onClick={handleReset}>
                New Pipeline
              </Button>
              <Button variant="outline" onClick={() => setWizardStep("configure")}>
                Re-run with Changes
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
