"use client";

import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  getApplications,
  getApplication,
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
  getIntelligenceReport,
  ingestDocument,
  m365Search,
  m365Fetch,
  m365Status,
  getDataSources,
  createDataSource,
  deleteDataSource,
  testDataSourceConnection,
  getAtlassianConfig,
  saveAtlassianConfig,
  testAtlassianConnection,
  getMcpServers,
  type TalosApplication,
  type AcceptanceCriteria,
  type TraceabilityReport,
  type M365SearchResult,
  type M365SessionStatus,
  type TalosDataSource,
  type TalosAtlassianConfig,
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
  Search,
  Globe,
  Shield,
  Database,
  Plus,
  Trash2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Error Helper ──────────────────────────────────────────────────────────────

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // Check for HTTP status codes in the error message
    if (error.message.includes("503")) {
      return "AI service unavailable — please check your Copilot configuration in Admin > Auth settings.";
    }
    if (error.message.includes("Failed to fetch") || error.message.includes("NetworkError")) {
      return "Network error — please check your connection and try again.";
    }
    return error.message;
  }
  return "An unexpected error occurred. Please try again.";
}

// ── Step Definitions ──────────────────────────────────────────────────────────

const STEPS = [
  { label: "Register App", description: "Set up your target application" },
  { label: "Data Sources", description: "Configure JDBC database connections" },
  { label: "Atlassian", description: "Connect Jira & Confluence (optional)" },
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
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  const goNext = useCallback(() => {
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      next.add(currentStep);
      return next;
    });
    setCurrentStep((s) => Math.min(s + 1, STEPS.length - 1));
  }, [currentStep]);

  const goBack = useCallback(() => {
    setCurrentStep((s) => Math.max(s - 1, 0));
  }, []);

  // When an existing app is selected, detect which steps are done and resume
  const handleSelectApp = useCallback(async (id: string) => {
    setAppId(id);
    const done = new Set<number>();
    done.add(0); // Step 0 (Register) is always done if we have an app

    try {
      const [dataSources, atlassianConfig, roles, intelligence, criteria] = await Promise.allSettled([
        getDataSources(id),
        getAtlassianConfig(id),
        getVaultRoles(id),
        getIntelligenceReport(id),
        getCriteria(id),
      ]);

      if (dataSources.status === "fulfilled" && dataSources.value?.length > 0) done.add(1);
      if (atlassianConfig.status === "fulfilled" && atlassianConfig.value) done.add(2);
      // Step 3 (upload docs) — consider done if intelligence or criteria exist (docs feed into discovery)
      const hasIntelligence = intelligence.status === "fulfilled" && intelligence.value;
      const hasCriteria = criteria.status === "fulfilled" && criteria.value?.length > 0;
      if (hasIntelligence || hasCriteria) done.add(3);
      if (roles.status === "fulfilled" && roles.value?.length > 0) done.add(4);
      // Step 5 (Discovery) — complete if intelligence report exists
      // A 404 on intelligence just means discovery hasn't run yet — not an error
      if (hasIntelligence) done.add(5);
      // Step 6 (Generate Criteria) — complete if criteria exist regardless of intelligence
      if (hasCriteria) done.add(6);
      if (criteria.status === "fulfilled" && criteria.value?.some((c: AcceptanceCriteria) => c.status === "approved"))
        done.add(7);
    } catch {
      // If any check fails, just start at step 1
    }

    setCompletedSteps(done);

    // Find the first incomplete step, or go to step 1 if all early steps are done
    const firstIncomplete = Array.from({ length: STEPS.length }, (_, i) => i).find((i) => !done.has(i));
    setCurrentStep(firstIncomplete ?? 1);
  }, []);

  return (
    <div className="space-y-6">
      {/* Progress Bar */}
      <div className="flex items-center gap-2">
        {STEPS.map((step, i) => (
          <div key={step.label} className="flex items-center gap-2 flex-1">
            <button
              onClick={() => (appId || i === 0 ? setCurrentStep(i) : undefined)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors w-full",
                i === currentStep && "bg-primary text-primary-foreground",
                i !== currentStep && completedSteps.has(i) && "bg-primary/10 text-primary cursor-pointer",
                i !== currentStep &&
                  !completedSteps.has(i) &&
                  appId &&
                  "bg-muted text-muted-foreground cursor-pointer hover:bg-muted/80",
                i !== currentStep && !completedSteps.has(i) && !appId && "bg-muted text-muted-foreground"
              )}
            >
              {completedSteps.has(i) && i !== currentStep ? (
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
          {currentStep === 0 && (
            <RegisterAppStep
              onComplete={(id) => {
                setAppId(id);
                setCompletedSteps((prev) => new Set([...prev, 0]));
                goNext();
              }}
              onSelectExisting={handleSelectApp}
            />
          )}
          {currentStep === 1 && appId && <DataSourcesStep appId={appId} onComplete={goNext} />}
          {currentStep === 2 && appId && <AtlassianStep appId={appId} onComplete={goNext} />}
          {currentStep === 3 && appId && <UploadDocsStep appId={appId} onComplete={goNext} />}
          {currentStep === 4 && appId && <VaultRolesStep appId={appId} onComplete={goNext} />}
          {currentStep === 5 && appId && <DiscoveryStep appId={appId} onComplete={goNext} />}
          {currentStep === 6 && appId && <GenerateCriteriaStep appId={appId} onComplete={goNext} />}
          {currentStep === 7 && appId && <ReviewCriteriaStep appId={appId} onComplete={goNext} />}
          {currentStep === 8 && appId && <GenerateTestsStep appId={appId} />}
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

// ── Step: Register Application (existing) ─────────────────────────────────

function RegisterAppStep({
  onComplete,
  onSelectExisting,
}: {
  onComplete: (appId: string) => void;
  onSelectExisting?: (appId: string) => void;
}) {
  const [name, setName] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [mtlsEnabled, setMtlsEnabled] = useState(false);
  const [mtlsCert, setMtlsCert] = useState("");
  const [mtlsKey, setMtlsKey] = useState("");
  const [mtlsCa, setMtlsCa] = useState("");

  const { data: apps } = useQuery({ queryKey: ["applications"], queryFn: getApplications });

  const createMutation = useMutation({
    mutationFn: (data: Partial<TalosApplication> & { mtlsEnabled?: boolean; mtlsConfig?: Record<string, string> }) =>
      createApplication(data as Partial<TalosApplication>),
    onSuccess: (app) => onComplete(app.id),
  });

  const handleCreate = () => {
    const payload: Partial<TalosApplication> & { mtlsEnabled?: boolean; mtlsConfig?: Record<string, string> } = {
      name,
      repositoryUrl: repoUrl,
      branch: branch || undefined,
      baseUrl,
    };
    if (mtlsEnabled) {
      payload.mtlsEnabled = true;
      payload.mtlsConfig = {
        clientCertPath: mtlsCert,
        clientKeyPath: mtlsKey,
        ...(mtlsCa ? { caCertPath: mtlsCa } : {}),
      };
    }
    createMutation.mutate(payload);
  };

  return (
    <div className="space-y-4">
      {apps && apps.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Select an existing application or create a new one:</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {apps.map((app) => (
              <Button
                key={app.id}
                variant="outline"
                className="justify-start text-left"
                onClick={() => (onSelectExisting ?? onComplete)(app.id)}
              >
                <div className="flex flex-col items-start">
                  <span className="font-medium">{app.name}</span>
                  {app.repositoryUrl && (
                    <span className="text-xs text-muted-foreground truncate max-w-[200px]">{app.repositoryUrl}</span>
                  )}
                </div>
              </Button>
            ))}
          </div>
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">or create new</span>
            </div>
          </div>
        </div>
      )}
      <div className="space-y-3">
        <Input placeholder="Application name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input
          placeholder="Repository URL (https://github.com/...)"
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
        />
        <Input
          placeholder="Branch (leave empty for default branch)"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
        />
        <Input
          placeholder="Base URL (https://staging.example.com)"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
        />

        {/* mTLS Toggle (#324) */}
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Enable mTLS</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={mtlsEnabled}
              className={cn(
                "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                mtlsEnabled ? "bg-primary" : "bg-input"
              )}
              onClick={() => setMtlsEnabled(!mtlsEnabled)}
            >
              <span
                className={cn(
                  "pointer-events-none block h-4 w-4 rounded-full bg-background shadow-sm transition-transform",
                  mtlsEnabled ? "translate-x-4" : "translate-x-0"
                )}
              />
            </button>
          </div>
          {mtlsEnabled && (
            <div className="space-y-2 pt-1">
              <Input
                placeholder="Client Certificate vault ref or path"
                value={mtlsCert}
                onChange={(e) => setMtlsCert(e.target.value)}
              />
              <Input
                placeholder="Client Key vault ref or path"
                value={mtlsKey}
                onChange={(e) => setMtlsKey(e.target.value)}
              />
              <Input
                placeholder="CA Certificate (optional)"
                value={mtlsCa}
                onChange={(e) => setMtlsCa(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Playwright will use these certificates for mutual TLS authentication when testing this application.
              </p>
            </div>
          )}
        </div>

        <Button onClick={handleCreate} disabled={!name || createMutation.isPending}>
          {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create Application
        </Button>
      </div>
    </div>
  );
}

// ── Step 2: Upload Requirements Documents ─────────────────────────────────────

function UploadDocsStep({ appId, onComplete }: { appId: string; onComplete: () => void }) {
  const [files, setFiles] = useState<
    { name: string; status: "pending" | "ingesting" | "done" | "error"; chunks?: number }[]
  >([]);
  const [docType, setDocType] = useState<string>("prd");
  const [isIngesting, setIsIngesting] = useState(false);
  const [activeTab, setActiveTab] = useState<"local" | "m365">("local");
  const [m365Query, setM365Query] = useState("");
  const [m365Results, setM365Results] = useState<M365SearchResult[]>([]);
  const [m365Selected, setM365Selected] = useState<Set<number>>(new Set());
  const [m365Searching, setM365Searching] = useState(false);
  const [m365Fetching, setM365Fetching] = useState(false);

  const { data: sessionStatus } = useQuery<M365SessionStatus>({
    queryKey: ["m365-status"],
    queryFn: m365Status,
    staleTime: 30_000,
  });

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files;
      if (!selected) return;
      const newFiles = Array.from(selected).map((f) => ({ name: f.name, status: "pending" as const, file: f }));
      setFiles((prev) => [...prev, ...newFiles.map(({ name, status }) => ({ name, status }))]);

      for (const { file } of newFiles) {
        const reader = new FileReader();
        reader.onload = async () => {
          const content = reader.result as string;
          const format =
            file.name.endsWith(".yaml") || file.name.endsWith(".yml")
              ? "openapi_yaml"
              : file.name.endsWith(".json")
                ? "openapi_json"
                : "markdown";

          setFiles((prev) => prev.map((f) => (f.name === file.name ? { ...f, status: "ingesting" } : f)));
          setIsIngesting(true);

          try {
            const result = await ingestDocument(appId, { content, format, fileName: file.name, docType });
            setFiles((prev) =>
              prev.map((f) => (f.name === file.name ? { ...f, status: "done", chunks: result.chunksCreated } : f))
            );
          } catch {
            setFiles((prev) => prev.map((f) => (f.name === file.name ? { ...f, status: "error" } : f)));
          } finally {
            setIsIngesting(false);
          }
        };
        reader.readAsText(file);
      }
    },
    [appId, docType]
  );

  const handleM365Search = useCallback(async () => {
    if (!m365Query.trim()) return;
    setM365Searching(true);
    try {
      const response = await m365Search(m365Query);
      setM365Results(response.results);
      setM365Selected(new Set());
    } catch {
      setM365Results([]);
    } finally {
      setM365Searching(false);
    }
  }, [m365Query]);

  const handleM365Fetch = useCallback(async () => {
    setM365Fetching(true);
    const selected = Array.from(m365Selected)
      .map((i) => m365Results[i])
      .filter(Boolean);

    // Fetch all selected documents in parallel
    const results = await Promise.allSettled(
      selected.map(async (result) => {
        const ft = result.fileType && result.fileType !== "unknown" ? result.fileType : "docx";
        const docName = result.title || `m365-${Date.now()}`;
        setFiles((prev) => [...prev, { name: docName, status: "ingesting" }]);
        const fetched = await m365Fetch(result.url, ft);
        const ingested = await ingestDocument(appId, {
          content: fetched.content,
          format: "markdown",
          fileName: `${docName}.md`,
          docType,
        });
        return { name: docName, chunks: ingested.chunksCreated };
      })
    );

    // Update file statuses based on settled results
    for (const result of results) {
      if (result.status === "fulfilled") {
        const { name, chunks } = result.value;
        setFiles((prev) => prev.map((f) => (f.name === name ? { ...f, status: "done", chunks } : f)));
      } else {
        setFiles((prev) => prev.map((f) => (f.status === "ingesting" ? { ...f, status: "error" } : f)));
      }
    }

    setM365Fetching(false);
    setM365Selected(new Set());
  }, [m365Selected, m365Results, appId, docType]);

  return (
    <div className="space-y-4">
      {/* Tab switcher */}
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        <button
          className={cn(
            "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            activeTab === "local" ? "bg-background shadow-sm" : "text-muted-foreground"
          )}
          onClick={() => setActiveTab("local")}
        >
          <Upload className="mr-1.5 inline h-3.5 w-3.5" /> Upload Local Files
        </button>
        <button
          className={cn(
            "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            activeTab === "m365" ? "bg-background shadow-sm" : "text-muted-foreground"
          )}
          onClick={() => setActiveTab("m365")}
        >
          <Globe className="mr-1.5 inline h-3.5 w-3.5" /> Search M365 Documents
        </button>
      </div>

      {/* M365 Session Status Badge */}
      {activeTab === "m365" && sessionStatus && (
        <div className="flex items-center gap-2">
          <Badge
            variant={
              sessionStatus.status === "active"
                ? "default"
                : sessionStatus.status === "disabled"
                  ? "secondary"
                  : "destructive"
            }
          >
            {sessionStatus.status === "active"
              ? "M365 Connected"
              : sessionStatus.status === "disabled"
                ? "M365 Disabled"
                : "M365 " + sessionStatus.status}
          </Badge>
          {sessionStatus.status === "disabled" ? (
            <span className="text-xs text-muted-foreground">
              Set <code className="rounded bg-muted px-1 py-0.5">M365_ENABLED=true</code> in Admin &gt; Environment
              Variables and restart the server.
            </span>
          ) : (
            sessionStatus.message && <span className="text-xs text-muted-foreground">{sessionStatus.message}</span>
          )}
        </div>
      )}

      {/* Document Type Selector (shared) */}
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
        {activeTab === "local" && (
          <label className="cursor-pointer">
            <input type="file" className="hidden" accept=".md,.yaml,.yml,.json" multiple onChange={handleFileSelect} />
            <Button asChild variant="outline">
              <span>
                <Upload className="mr-2 h-4 w-4" /> Select Files
              </span>
            </Button>
          </label>
        )}
      </div>

      {/* M365 Search Panel */}
      {activeTab === "m365" && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Search M365 documents..."
              value={m365Query}
              onChange={(e) => setM365Query(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleM365Search()}
            />
            <Button onClick={handleM365Search} disabled={m365Searching || !m365Query.trim()}>
              {m365Searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
          {m365Results.length > 0 && (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {m365Results.map((r, i) => (
                <label
                  key={i}
                  className="flex items-start gap-2 rounded-md border px-3 py-2 cursor-pointer hover:bg-muted/50"
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={m365Selected.has(i)}
                    onChange={(e) => {
                      const next = new Set(m365Selected);
                      e.target.checked ? next.add(i) : next.delete(i);
                      setM365Selected(next);
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{r.title}</div>
                    <div className="text-xs text-muted-foreground line-clamp-2">{r.snippet}</div>
                    {r.fileType && r.fileType !== "unknown" && (
                      <Badge variant="outline" className="mt-1 text-xs">
                        {r.fileType.toUpperCase()}
                      </Badge>
                    )}
                  </div>
                </label>
              ))}
            </div>
          )}
          {m365Selected.size > 0 && (
            <Button onClick={handleM365Fetch} disabled={m365Fetching}>
              {m365Fetching && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Fetch Selected ({m365Selected.size})
            </Button>
          )}
        </div>
      )}

      {/* File Status List (shared) */}
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
                {f.status === "done" && <Badge variant="default">{f.chunks} chunks</Badge>}
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
        <Input
          placeholder="Username ref (e.g. vault:admin-user)"
          value={usernameRef}
          onChange={(e) => setUsernameRef(e.target.value)}
        />
        <Input
          placeholder="Password ref (e.g. vault:admin-pass)"
          value={passwordRef}
          onChange={(e) => setPasswordRef(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={() => createMutation.mutate()}
          disabled={!roleName || createMutation.isPending}
        >
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
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const discoverMutation = useMutation({
    mutationFn: () => triggerDiscovery(appId),
    onMutate: () => {
      setDiscoveryStatus("running");
      setErrorMsg(null);
    },
    onSuccess: () => setDiscoveryStatus("done"),
    onError: (error: unknown) => {
      setDiscoveryStatus("idle");
      setErrorMsg(getErrorMessage(error));
    },
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Crawl your repository to index source code for test generation context.
      </p>
      {errorMsg && (
        <div className="flex items-center gap-2 rounded-lg border border-red-600/30 bg-red-950/20 px-4 py-2 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {errorMsg}
        </div>
      )}
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
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const generateMutation = useMutation({
    mutationFn: () => generateCriteria(appId),
    onSuccess: (data) => {
      setResult(data);
      setErrorMsg(null);
    },
    onError: (error: unknown) => {
      setErrorMsg(getErrorMessage(error));
    },
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Generate acceptance criteria from your indexed requirements using AI.
      </p>
      {errorMsg && (
        <div className="flex items-center gap-2 rounded-lg border border-red-600/30 bg-red-950/20 px-4 py-2 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {errorMsg}
        </div>
      )}
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
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
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
      setErrorMsg(null);
    },
    onError: (error: unknown) => {
      setErrorMsg(getErrorMessage(error));
    },
  });

  if (isLoading)
    return (
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading criteria...
      </div>
    );

  return (
    <div className="space-y-4">
      {errorMsg && (
        <div className="flex items-center gap-2 rounded-lg border border-red-600/30 bg-red-950/20 px-4 py-2 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {errorMsg}
        </div>
      )}
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
          {suggestMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
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
                  <Badge
                    variant={
                      c.status === "approved" ? "success" : c.status === "deprecated" ? "destructive" : "secondary"
                    }
                  >
                    {c.status}
                  </Badge>
                </div>
              </div>
              {c.description && <p className="text-sm text-muted-foreground">{c.description}</p>}
              {c.scenarios.length > 0 && (
                <div className="space-y-1 text-xs font-mono bg-muted rounded p-2">
                  {c.scenarios.map((s, i) => (
                    <div key={i}>
                      <div>
                        <span className="text-green-600 font-bold">Given</span> {s.given}
                      </div>
                      <div>
                        <span className="text-blue-600 font-bold">When</span> {s.when}
                      </div>
                      <div>
                        <span className="text-purple-600 font-bold">Then</span> {s.then}
                      </div>
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
        <p className="text-sm text-muted-foreground">
          No criteria found. Use AI Suggest to create one, or go back and generate criteria.
        </p>
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
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleGenerateAll = useCallback(async () => {
    if (!criteria) return;
    setGenerating(true);
    setErrorMsg(null);
    let count = 0;
    let lastError: unknown = null;
    for (const c of criteria) {
      try {
        await generateTest({
          applicationId: appId,
          prompt: `Generate a Playwright test for: ${c.title}. Scenarios: ${c.scenarios.map((s) => `Given ${s.given}, When ${s.when}, Then ${s.then}`).join("; ")}`,
          testType: "e2e",
        });
        count++;
        setGeneratedCount(count);
      } catch (err) {
        lastError = err;
        // continue with next criterion
      }
    }
    setGenerating(false);
    if (count > 0) {
      setIsComplete(true);
    }
    if (lastError && count === 0) {
      setErrorMsg(getErrorMessage(lastError));
    }
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

      {errorMsg && (
        <div className="flex items-center gap-2 rounded-lg border border-red-600/30 bg-red-950/20 px-4 py-2 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {errorMsg}
        </div>
      )}

      {!isComplete && (
        <Button onClick={handleGenerateAll} disabled={generating || !criteria?.length}>
          {generating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating ({generatedCount}/{criteria?.length ?? 0})...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" /> Generate Tests for All Criteria
            </>
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

// ── Step: Data Sources Configuration (#336) ───────────────────────────────────

type DataSourceDraft = {
  label: string;
  driverType: string;
  jdbcUrl: string;
  usernameVaultRef: string;
  passwordVaultRef: string;
};

const emptyDraft = (): DataSourceDraft => ({
  label: "",
  driverType: "postgresql",
  jdbcUrl: "",
  usernameVaultRef: "",
  passwordVaultRef: "",
});

function DataSourcesStep({ appId, onComplete }: { appId: string; onComplete: () => void }) {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<DataSourceDraft[]>([emptyDraft()]);
  const [saving, setSaving] = useState(false);

  const { data: existing } = useQuery({
    queryKey: ["data-sources", appId],
    queryFn: () => getDataSources(appId),
  });

  const createMut = useMutation({
    mutationFn: (data: Partial<TalosDataSource>) => createDataSource(appId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["data-sources", appId] }),
  });

  const addDraft = () => setDrafts((prev) => [...prev, emptyDraft()]);
  const removeDraft = (i: number) => setDrafts((prev) => prev.filter((_, idx) => idx !== i));
  const updateDraft = (i: number, field: keyof DataSourceDraft, value: string) => {
    setDrafts((prev) => prev.map((d, idx) => (idx === i ? { ...d, [field]: value } : d)));
  };

  const handleSaveAll = async () => {
    setSaving(true);
    const valid = drafts.filter((d) => d.label && d.jdbcUrl);
    for (const d of valid) {
      await createMut.mutateAsync(d as unknown as Partial<TalosDataSource>);
    }
    setSaving(false);
    onComplete();
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Add JDBC database data sources for schema-aware test generation. Each data source runs in an isolated Docker
        container with read-only access.
      </p>

      {existing && existing.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Existing Data Sources:</p>
          {existing.map((ds) => (
            <div key={ds.id} className="flex items-center gap-2 rounded border p-2">
              <Database className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">{ds.label}</span>
              <Badge variant="secondary">{ds.driverType}</Badge>
            </div>
          ))}
        </div>
      )}

      {drafts.map((draft, i) => (
        <div key={i} className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Data Source {i + 1}</span>
            {drafts.length > 1 && (
              <Button variant="ghost" size="sm" onClick={() => removeDraft(i)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
          <Input
            placeholder="Label (e.g., Production Oracle)"
            value={draft.label}
            onChange={(e) => updateDraft(i, "label", e.target.value)}
          />
          <select
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={draft.driverType}
            onChange={(e) => updateDraft(i, "driverType", e.target.value)}
          >
            <option value="postgresql">PostgreSQL</option>
            <option value="oracle">Oracle</option>
            <option value="mysql">MySQL</option>
            <option value="sqlserver">SQL Server</option>
            <option value="sqlite">SQLite</option>
            <option value="other">Other</option>
          </select>
          <Input
            placeholder="JDBC URL (jdbc:postgresql://host:5432/db)"
            value={draft.jdbcUrl}
            onChange={(e) => updateDraft(i, "jdbcUrl", e.target.value)}
          />
          <Input
            placeholder="Username vault ref (vault:db-user)"
            value={draft.usernameVaultRef}
            onChange={(e) => updateDraft(i, "usernameVaultRef", e.target.value)}
          />
          <Input
            placeholder="Password vault ref (vault:db-pass)"
            value={draft.passwordVaultRef}
            onChange={(e) => updateDraft(i, "passwordVaultRef", e.target.value)}
          />
        </div>
      ))}

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={addDraft}>
          <Plus className="mr-1 h-4 w-4" /> Add Data Source
        </Button>
      </div>

      <Button onClick={handleSaveAll} disabled={saving || !drafts.some((d) => d.label && d.jdbcUrl)}>
        {saving ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...
          </>
        ) : (
          "Save & Continue"
        )}
      </Button>
    </div>
  );
}

// ── Step: Atlassian Configuration (#337) ──────────────────────────────────────

function AtlassianStep({ appId, onComplete }: { appId: string; onComplete: () => void }) {
  const [deploymentType, setDeploymentType] = useState<"cloud" | "datacenter">("cloud");
  const [jiraUrl, setJiraUrl] = useState("");
  const [jiraProject, setJiraProject] = useState("");
  const [jiraUsername, setJiraUsername] = useState("");
  const [jiraApiToken, setJiraApiToken] = useState("");
  const [jiraPersonalToken, setJiraPersonalToken] = useState("");
  const [jiraSslVerify, setJiraSslVerify] = useState(true);
  const [confluenceUrl, setConfluenceUrl] = useState("");
  const [confluenceSpacesRaw, setConfluenceSpacesRaw] = useState("");
  const [confluenceUsername, setConfluenceUsername] = useState("");
  const [confluenceApiToken, setConfluenceApiToken] = useState("");
  const [confluencePersonalToken, setConfluencePersonalToken] = useState("");
  const [confluenceSslVerify, setConfluenceSslVerify] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [preFilledFrom, setPreFilledFrom] = useState<"saved" | "mcp" | null>(null);

  // Load saved Atlassian config for this app
  const { data: savedConfig } = useQuery({
    queryKey: ["atlassian-config", appId],
    queryFn: () => getAtlassianConfig(appId).catch(() => null),
  });

  // Auto-detect Atlassian credentials from configured MCP servers
  const { data: mcpServers } = useQuery({
    queryKey: ["mcp-servers"],
    queryFn: getMcpServers,
  });

  const mcpAtlassian = mcpServers?.find((s) => s.enabled && s.name.toLowerCase().includes("atlassian") && s.env);

  // Pre-fill priority: saved config > MCP server env > empty
  useEffect(() => {
    if (preFilledFrom) return;

    // Try saved config first
    if (savedConfig && savedConfig.jiraUrl) {
      setDeploymentType(savedConfig.deploymentType ?? "cloud");
      setJiraUrl(savedConfig.jiraUrl ?? "");
      setJiraProject(savedConfig.jiraProject ?? "");
      setJiraUsername(savedConfig.jiraUsernameVaultRef ?? "");
      setJiraApiToken(savedConfig.jiraApiTokenVaultRef ?? "");
      setJiraPersonalToken(savedConfig.jiraPersonalTokenVaultRef ?? "");
      setJiraSslVerify(savedConfig.jiraSslVerify ?? true);
      setConfluenceUrl(savedConfig.confluenceUrl ?? "");
      setConfluenceSpacesRaw((savedConfig.confluenceSpaces ?? []).join(", "));
      setConfluenceUsername(savedConfig.confluenceUsernameVaultRef ?? "");
      setConfluenceApiToken(savedConfig.confluenceApiTokenVaultRef ?? "");
      setConfluencePersonalToken(savedConfig.confluencePersonalTokenVaultRef ?? "");
      setConfluenceSslVerify(savedConfig.confluenceSslVerify ?? true);
      setPreFilledFrom("saved");
      return;
    }

    // Fall back to MCP server env vars
    if (mcpAtlassian) {
      const env = mcpAtlassian.env ?? {};
      if (env.JIRA_URL) setJiraUrl(env.JIRA_URL);
      const jiraToken = env.JIRA_PERSONAL_TOKEN || env.JIRA_API_TOKEN;
      const confluenceToken = env.CONFLUENCE_PERSONAL_TOKEN || env.CONFLUENCE_API_TOKEN;
      if (jiraToken) setJiraPersonalToken(jiraToken);
      if (env.JIRA_SSL_VERIFY) setJiraSslVerify(env.JIRA_SSL_VERIFY !== "false");
      if (env.CONFLUENCE_URL) setConfluenceUrl(env.CONFLUENCE_URL);
      if (confluenceToken) setConfluencePersonalToken(confluenceToken);
      if (env.CONFLUENCE_SSL_VERIFY) setConfluenceSslVerify(env.CONFLUENCE_SSL_VERIFY !== "false");
      if (jiraToken || confluenceToken) setDeploymentType("datacenter");
      setPreFilledFrom("mcp");
    }
  }, [savedConfig, mcpAtlassian, preFilledFrom]);

  const saveMut = useMutation({
    mutationFn: (data: Partial<TalosAtlassianConfig>) => saveAtlassianConfig(appId, data),
  });

  const handleSave = async () => {
    setSaving(true);
    await saveMut.mutateAsync({
      deploymentType,
      jiraUrl,
      jiraProject,
      jiraUsernameVaultRef: jiraUsername,
      jiraApiTokenVaultRef: jiraApiToken,
      jiraPersonalTokenVaultRef: jiraPersonalToken,
      jiraSslVerify,
      confluenceUrl,
      confluenceSpaces: confluenceSpacesRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      confluenceUsernameVaultRef: confluenceUsername,
      confluenceApiTokenVaultRef: confluenceApiToken,
      confluencePersonalTokenVaultRef: confluencePersonalToken,
      confluenceSslVerify,
    });
    setSaving(false);
    onComplete();
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      // Save config first so the test endpoint can find it
      await saveMut.mutateAsync({
        deploymentType,
        jiraUrl,
        jiraProject,
        jiraUsernameVaultRef: jiraUsername,
        jiraApiTokenVaultRef: jiraApiToken,
        jiraPersonalTokenVaultRef: jiraPersonalToken,
        jiraSslVerify,
        confluenceUrl,
        confluenceSpaces: confluenceSpacesRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        confluenceUsernameVaultRef: confluenceUsername,
        confluenceApiTokenVaultRef: confluenceApiToken,
        confluencePersonalTokenVaultRef: confluencePersonalToken,
        confluenceSslVerify,
      });
      const result = await testAtlassianConnection(appId);
      setTestResult(result);
    } catch {
      setTestResult({ success: false, message: "Connection test failed" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Connect to Jira and Confluence to import requirements and acceptance criteria into the RAG knowledge base. This
        step is optional.
      </p>

      {preFilledFrom === "saved" && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-600/30 bg-blue-950/20 px-4 py-2 text-sm text-blue-400">
          <Check className="h-4 w-4 shrink-0" />
          Loaded previously saved Atlassian configuration.
        </div>
      )}

      {preFilledFrom === "mcp" && (
        <div className="flex items-center gap-2 rounded-lg border border-green-600/30 bg-green-950/20 px-4 py-2 text-sm text-green-400">
          <Check className="h-4 w-4 shrink-0" />
          Credentials auto-filled from MCP server &quot;{mcpAtlassian?.name}&quot;. Just add a project key and space
          keys below.
        </div>
      )}

      <div className="flex gap-2">
        <Button
          variant={deploymentType === "cloud" ? "default" : "outline"}
          size="sm"
          onClick={() => setDeploymentType("cloud")}
        >
          Cloud
        </Button>
        <Button
          variant={deploymentType === "datacenter" ? "default" : "outline"}
          size="sm"
          onClick={() => setDeploymentType("datacenter")}
        >
          Data Center
        </Button>
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <span className="text-sm font-medium">Jira</span>
        <Input
          placeholder="Jira URL (https://your-org.atlassian.net)"
          value={jiraUrl}
          onChange={(e) => setJiraUrl(e.target.value)}
        />
        <Input
          placeholder="Project key (e.g., PROJ)"
          value={jiraProject}
          onChange={(e) => setJiraProject(e.target.value)}
        />
        {deploymentType === "cloud" ? (
          <>
            <Input
              placeholder="Username vault ref"
              value={jiraUsername}
              onChange={(e) => setJiraUsername(e.target.value)}
            />
            <Input
              type="password"
              placeholder="API token vault ref"
              value={jiraApiToken}
              onChange={(e) => setJiraApiToken(e.target.value)}
            />
          </>
        ) : (
          <Input
            type="password"
            placeholder="Personal access token vault ref"
            value={jiraPersonalToken}
            onChange={(e) => setJiraPersonalToken(e.target.value)}
          />
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={jiraSslVerify} onChange={(e) => setJiraSslVerify(e.target.checked)} />
          Verify SSL
        </label>
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <span className="text-sm font-medium">Confluence</span>
        <Input
          placeholder="Confluence URL (https://your-org.atlassian.net/wiki)"
          value={confluenceUrl}
          onChange={(e) => setConfluenceUrl(e.target.value)}
        />
        <Input
          placeholder="Space keys (comma-separated: DEV, QA)"
          value={confluenceSpacesRaw}
          onChange={(e) => setConfluenceSpacesRaw(e.target.value)}
        />
        {deploymentType === "cloud" ? (
          <>
            <Input
              placeholder="Username vault ref"
              value={confluenceUsername}
              onChange={(e) => setConfluenceUsername(e.target.value)}
            />
            <Input
              type="password"
              placeholder="API token vault ref"
              value={confluenceApiToken}
              onChange={(e) => setConfluenceApiToken(e.target.value)}
            />
          </>
        ) : (
          <Input
            type="password"
            placeholder="Personal access token vault ref"
            value={confluencePersonalToken}
            onChange={(e) => setConfluencePersonalToken(e.target.value)}
          />
        )}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={confluenceSslVerify}
            onChange={(e) => setConfluenceSslVerify(e.target.checked)}
          />
          Verify SSL
        </label>
      </div>

      {testResult && (
        <div className={cn("flex items-center gap-2 text-sm", testResult.success ? "text-green-600" : "text-red-600")}>
          {testResult.success ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
          {testResult.message}
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" onClick={handleTest} disabled={testing || !jiraUrl}>
          {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Test Connection
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...
            </>
          ) : (
            "Save & Continue"
          )}
        </Button>
        <Button variant="ghost" onClick={onComplete}>
          Skip
        </Button>
      </div>
    </div>
  );
}
