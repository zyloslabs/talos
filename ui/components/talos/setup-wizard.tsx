"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  getApplications,
  createApplication,
  getVaultRoles,
  createVaultRole,
  triggerDiscovery,
  getCriteria,
  generateCriteria,
  updateCriteria,
  suggestCriteria,
  generateTest,
  getTraceabilityReport,
  ingestDocument,
  type TalosApplication,
  type AcceptanceCriteria,
  type TraceabilityReport,
} from "@/lib/api";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Upload,
  Sparkles,
  FileText,
  Loader2,
  Check,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Step Definitions ──────────────────────────────────────────────────────────

const STEPS = [
  { label: "Register App", description: "Set up your target application" },
  { label: "Upload Docs", description: "Upload requirements documents" },
  { label: "Vault Roles", description: "Configure test credentials" },
  { label: "Discovery", description: "Index your repository" },
  { label: "Generate Criteria", description: "AI-generate acceptance criteria" },
  { label: "Review Criteria", description: "Review and approve criteria" },
  { label: "Generate Tests", description: "Create Playwright tests" },
] as const;

// ── Main Wizard Component ─────────────────────────────────────────────────────

export function SetupWizard() {
  const [currentStep, setCurrentStep] = useState(0);
  const [appId, setAppId] = useState<string | null>(null);

  const goNext = useCallback(() => {
    setCurrentStep((s) => Math.min(s + 1, STEPS.length - 1));
  }, []);

  const goBack = useCallback(() => {
    setCurrentStep((s) => Math.max(s - 1, 0));
  }, []);

  return (
    <div className="space-y-6">
      {/* Progress Bar */}
      <div className="flex items-center gap-2">
        {STEPS.map((step, i) => (
          <div key={step.label} className="flex items-center gap-2 flex-1">
            <button
              onClick={() => i <= currentStep ? setCurrentStep(i) : undefined}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors w-full",
                i === currentStep && "bg-primary text-primary-foreground",
                i < currentStep && "bg-primary/10 text-primary cursor-pointer",
                i > currentStep && "bg-muted text-muted-foreground"
              )}
            >
              {i < currentStep ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              ) : (
                <span className="flex h-5 w-5 items-center justify-center rounded-full border text-xs shrink-0">
                  {i + 1}
                </span>
              )}
              <span className="truncate hidden lg:inline">{step.label}</span>
            </button>
          </div>
        ))}
      </div>

      {/* Step Content */}
      <Card>
        <CardHeader>
          <CardTitle>{STEPS[currentStep].label}</CardTitle>
          <CardDescription>{STEPS[currentStep].description}</CardDescription>
        </CardHeader>
        <CardContent>
          {currentStep === 0 && <RegisterAppStep onComplete={(id) => { setAppId(id); goNext(); }} />}
          {currentStep === 1 && appId && <UploadDocsStep appId={appId} onComplete={goNext} />}
          {currentStep === 2 && appId && <VaultRolesStep appId={appId} onComplete={goNext} />}
          {currentStep === 3 && appId && <DiscoveryStep appId={appId} onComplete={goNext} />}
          {currentStep === 4 && appId && <GenerateCriteriaStep appId={appId} onComplete={goNext} />}
          {currentStep === 5 && appId && <ReviewCriteriaStep appId={appId} onComplete={goNext} />}
          {currentStep === 6 && appId && <GenerateTestsStep appId={appId} />}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={goBack} disabled={currentStep === 0}>
          <ChevronLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        {currentStep < STEPS.length - 1 && currentStep > 0 && (
          <Button variant="outline" onClick={goNext}>
            Skip <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Step 1: Register Application ──────────────────────────────────────────────

function RegisterAppStep({ onComplete }: { onComplete: (appId: string) => void }) {
  const [name, setName] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [baseUrl, setBaseUrl] = useState("");

  const { data: apps } = useQuery({ queryKey: ["applications"], queryFn: getApplications });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; repositoryUrl: string; baseUrl: string }) =>
      createApplication(data as Partial<TalosApplication>),
    onSuccess: (app) => onComplete(app.id),
  });

  return (
    <div className="space-y-4">
      {apps && apps.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Select an existing application or create a new one:</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {apps.map((app) => (
              <Button key={app.id} variant="outline" className="justify-start" onClick={() => onComplete(app.id)}>
                {app.name}
              </Button>
            ))}
          </div>
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">or create new</span></div>
          </div>
        </div>
      )}
      <div className="space-y-3">
        <Input placeholder="Application name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="Repository URL (https://github.com/...)" value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} />
        <Input placeholder="Base URL (https://staging.example.com)" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
        <Button
          onClick={() => createMutation.mutate({ name, repositoryUrl: repoUrl, baseUrl })}
          disabled={!name || createMutation.isPending}
        >
          {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create Application
        </Button>
      </div>
    </div>
  );
}

// ── Step 2: Upload Requirements Documents ─────────────────────────────────────

function UploadDocsStep({ appId, onComplete }: { appId: string; onComplete: () => void }) {
  const [files, setFiles] = useState<{ name: string; status: "pending" | "ingesting" | "done" | "error"; chunks?: number }[]>([]);
  const [docType, setDocType] = useState<string>("prd");
  const [isIngesting, setIsIngesting] = useState(false);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected) return;
    const newFiles = Array.from(selected).map((f) => ({ name: f.name, status: "pending" as const, file: f }));
    setFiles((prev) => [...prev, ...newFiles.map(({ name, status }) => ({ name, status }))]);

    // Read and ingest each file
    for (const { file } of newFiles) {
      const reader = new FileReader();
      reader.onload = async () => {
        const content = reader.result as string;
        const format = file.name.endsWith(".yaml") || file.name.endsWith(".yml")
          ? "openapi_yaml"
          : file.name.endsWith(".json")
          ? "openapi_json"
          : "markdown";

        setFiles((prev) => prev.map((f) => f.name === file.name ? { ...f, status: "ingesting" } : f));
        setIsIngesting(true);

        try {
          const result = await ingestDocument(appId, { content, format, fileName: file.name, docType });
          setFiles((prev) => prev.map((f) => f.name === file.name ? { ...f, status: "done", chunks: result.chunksCreated } : f));
        } catch {
          setFiles((prev) => prev.map((f) => f.name === file.name ? { ...f, status: "error" } : f));
        } finally {
          setIsIngesting(false);
        }
      };
      reader.readAsText(file);
    }
  }, [appId, docType]);

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-end">
        <div className="flex-1">
          <label className="text-sm font-medium mb-1 block">Document Type</label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
          >
            <option value="prd">PRD</option>
            <option value="user_story">User Story</option>
            <option value="api_spec">API Spec</option>
            <option value="functional_spec">Functional Spec</option>
          </select>
        </div>
        <label className="cursor-pointer">
          <input type="file" className="hidden" accept=".md,.yaml,.yml,.json" multiple onChange={handleFileSelect} />
          <Button asChild variant="outline">
            <span><Upload className="mr-2 h-4 w-4" /> Select Files</span>
          </Button>
        </label>
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((f) => (
            <div key={f.name} className="flex items-center justify-between rounded-md border px-3 py-2">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{f.name}</span>
              </div>
              <div className="flex items-center gap-2">
                {f.status === "ingesting" && <Loader2 className="h-4 w-4 animate-spin" />}
                {f.status === "done" && <Badge variant="success">{f.chunks} chunks</Badge>}
                {f.status === "error" && <Badge variant="destructive">Error</Badge>}
                {f.status === "pending" && <Badge variant="secondary">Pending</Badge>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Button onClick={onComplete} disabled={isIngesting}>
        Continue <ChevronRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}

// ── Step 3: Vault Roles ───────────────────────────────────────────────────────

function VaultRolesStep({ appId, onComplete }: { appId: string; onComplete: () => void }) {
  const [roleName, setRoleName] = useState("");
  const [roleType, setRoleType] = useState<string>("admin");
  const [usernameRef, setUsernameRef] = useState("");
  const [passwordRef, setPasswordRef] = useState("");

  const queryClient = useQueryClient();
  const { data: roles } = useQuery({ queryKey: ["vaultRoles", appId], queryFn: () => getVaultRoles(appId) });

  const createMutation = useMutation({
    mutationFn: () =>
      createVaultRole({
        applicationId: appId,
        name: roleName,
        roleType: roleType as "admin" | "standard" | "guest",
        usernameRef,
        passwordRef,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vaultRoles", appId] });
      setRoleName("");
      setUsernameRef("");
      setPasswordRef("");
    },
  });

  return (
    <div className="space-y-4">
      {roles && roles.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Configured roles:</p>
          {roles.map((r) => (
            <div key={r.id} className="flex items-center gap-2 rounded-md border px-3 py-2">
              <Badge>{r.roleType}</Badge>
              <span className="text-sm">{r.name}</span>
            </div>
          ))}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Input placeholder="Role name" value={roleName} onChange={(e) => setRoleName(e.target.value)} />
        <select
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={roleType}
          onChange={(e) => setRoleType(e.target.value)}
        >
          <option value="admin">Admin</option>
          <option value="standard">Standard</option>
          <option value="guest">Guest</option>
          <option value="service">Service</option>
          <option value="user">User</option>
        </select>
        <Input placeholder="Username ref (e.g. vault:admin-user)" value={usernameRef} onChange={(e) => setUsernameRef(e.target.value)} />
        <Input placeholder="Password ref (e.g. vault:admin-pass)" value={passwordRef} onChange={(e) => setPasswordRef(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => createMutation.mutate()} disabled={!roleName || createMutation.isPending}>
          {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Add Role
        </Button>
        <Button onClick={onComplete}>
          Continue <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ── Step 4: Discovery ─────────────────────────────────────────────────────────

function DiscoveryStep({ appId, onComplete }: { appId: string; onComplete: () => void }) {
  const [discoveryStatus, setDiscoveryStatus] = useState<"idle" | "running" | "done">("idle");

  const discoverMutation = useMutation({
    mutationFn: () => triggerDiscovery(appId),
    onMutate: () => setDiscoveryStatus("running"),
    onSuccess: () => setDiscoveryStatus("done"),
    onError: () => setDiscoveryStatus("idle"),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Crawl your repository to index source code for test generation context.
      </p>
      {discoveryStatus === "idle" && (
        <Button onClick={() => discoverMutation.mutate()}>
          <Sparkles className="mr-2 h-4 w-4" /> Start Discovery
        </Button>
      )}
      {discoveryStatus === "running" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Discovery in progress...
        </div>
      )}
      {discoveryStatus === "done" && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-green-600">
            <CheckCircle2 className="h-4 w-4" /> Discovery complete
          </div>
          <Button onClick={onComplete}>
            Continue <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Step 5: Generate Acceptance Criteria ───────────────────────────────────────

function GenerateCriteriaStep({ appId, onComplete }: { appId: string; onComplete: () => void }) {
  const [result, setResult] = useState<{ criteriaCreated: number; averageConfidence: number } | null>(null);

  const generateMutation = useMutation({
    mutationFn: () => generateCriteria(appId),
    onSuccess: (data) => setResult(data),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Generate acceptance criteria from your indexed requirements using AI.
      </p>
      {!result && (
        <Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
          {generateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          <Sparkles className="mr-2 h-4 w-4" /> Generate Criteria
        </Button>
      )}
      {result && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold">{result.criteriaCreated}</div>
                <p className="text-xs text-muted-foreground">Criteria generated</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold">{(result.averageConfidence * 100).toFixed(0)}%</div>
                <p className="text-xs text-muted-foreground">Average confidence</p>
              </CardContent>
            </Card>
          </div>
          <Button onClick={onComplete}>
            Review Criteria <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Step 6: Review Acceptance Criteria ─────────────────────────────────────────

function ReviewCriteriaStep({ appId, onComplete }: { appId: string; onComplete: () => void }) {
  const queryClient = useQueryClient();
  const { data: criteria, isLoading } = useQuery({
    queryKey: ["criteria", appId],
    queryFn: () => getCriteria(appId),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => updateCriteria(id, { status: "approved" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["criteria", appId] }),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => updateCriteria(id, { status: "deprecated" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["criteria", appId] }),
  });

  const [suggestDesc, setSuggestDesc] = useState("");
  const suggestMutation = useMutation({
    mutationFn: (desc: string) => suggestCriteria(appId, desc),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["criteria", appId] });
      setSuggestDesc("");
    },
  });

  if (isLoading) return <div className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading criteria...</div>;

  return (
    <div className="space-y-4">
      {/* AI Suggest */}
      <div className="flex gap-2">
        <Input
          placeholder="Describe a new criterion for AI to suggest..."
          value={suggestDesc}
          onChange={(e) => setSuggestDesc(e.target.value)}
          className="flex-1"
        />
        <Button
          variant="outline"
          onClick={() => suggestMutation.mutate(suggestDesc)}
          disabled={!suggestDesc || suggestMutation.isPending}
        >
          {suggestMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          AI Suggest
        </Button>
      </div>

      {/* Criteria List */}
      {criteria && criteria.length > 0 ? (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {criteria.map((c) => (
            <div key={c.id} className="rounded-md border p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-sm">{c.title}</h4>
                <div className="flex items-center gap-2">
                  <Badge variant={c.confidence >= 0.8 ? "success" : c.confidence >= 0.5 ? "warning" : "destructive"}>
                    {(c.confidence * 100).toFixed(0)}%
                  </Badge>
                  <Badge variant={c.status === "approved" ? "success" : c.status === "deprecated" ? "destructive" : "secondary"}>
                    {c.status}
                  </Badge>
                </div>
              </div>
              {c.description && <p className="text-sm text-muted-foreground">{c.description}</p>}
              {c.scenarios.length > 0 && (
                <div className="space-y-1 text-xs font-mono bg-muted rounded p-2">
                  {c.scenarios.map((s, i) => (
                    <div key={i}>
                      <div><span className="text-green-600 font-bold">Given</span> {s.given}</div>
                      <div><span className="text-blue-600 font-bold">When</span> {s.when}</div>
                      <div><span className="text-purple-600 font-bold">Then</span> {s.then}</div>
                      {i < c.scenarios.length - 1 && <hr className="my-1 border-dashed" />}
                    </div>
                  ))}
                </div>
              )}
              {c.status === "draft" && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => approveMutation.mutate(c.id)}>
                    <Check className="mr-1 h-3 w-3" /> Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => rejectMutation.mutate(c.id)}>
                    <X className="mr-1 h-3 w-3" /> Reject
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No criteria found. Use AI Suggest to create one, or go back and generate criteria.</p>
      )}

      <Button onClick={onComplete}>
        Continue to Test Generation <ChevronRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}

// ── Step 7: Generate Tests ────────────────────────────────────────────────────

function GenerateTestsStep({ appId }: { appId: string }) {
  const { data: criteria } = useQuery({
    queryKey: ["criteria", appId, "approved"],
    queryFn: () => getCriteria(appId, "approved"),
  });

  const { data: traceability } = useQuery({
    queryKey: ["traceability", appId],
    queryFn: () => getTraceabilityReport(appId),
  });

  const [generating, setGenerating] = useState(false);
  const [generatedCount, setGeneratedCount] = useState(0);
  const [isComplete, setIsComplete] = useState(false);

  const handleGenerateAll = useCallback(async () => {
    if (!criteria) return;
    setGenerating(true);
    let count = 0;
    for (const c of criteria) {
      try {
        await generateTest({
          applicationId: appId,
          prompt: `Generate a Playwright test for: ${c.title}. Scenarios: ${c.scenarios.map((s) => `Given ${s.given}, When ${s.when}, Then ${s.then}`).join("; ")}`,
          testType: "e2e",
        });
        count++;
        setGeneratedCount(count);
      } catch {
        // continue with next criterion
      }
    }
    setGenerating(false);
    setIsComplete(true);
  }, [criteria, appId]);

  return (
    <div className="space-y-4">
      {traceability && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{traceability.totalCriteria}</div>
              <p className="text-xs text-muted-foreground">Total criteria</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{traceability.implementedCriteria}</div>
              <p className="text-xs text-muted-foreground">With tests</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{traceability.coveragePercentage.toFixed(0)}%</div>
              <p className="text-xs text-muted-foreground">Coverage</p>
            </CardContent>
          </Card>
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        {criteria?.length ?? 0} approved criteria ready for test generation.
      </p>

      {!isComplete && (
        <Button onClick={handleGenerateAll} disabled={generating || !criteria?.length}>
          {generating ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating ({generatedCount}/{criteria?.length ?? 0})...</>
          ) : (
            <><Sparkles className="mr-2 h-4 w-4" /> Generate Tests for All Criteria</>
          )}
        </Button>
      )}

      {isComplete && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle2 className="h-5 w-5" />
            <span className="text-sm font-medium">Setup complete! {generatedCount} tests generated.</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Your tests are now available in the Test Library. Review them, run them, and iterate.
          </p>
        </div>
      )}
    </div>
  );
}
