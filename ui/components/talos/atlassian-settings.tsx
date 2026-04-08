"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  getAtlassianConfig,
  saveAtlassianConfig,
  deleteAtlassianConfig,
  testAtlassianConnection,
  importAtlassianData,
  type TalosAtlassianConfig,
} from "@/lib/api";
import { Loader2, Check, X, Trash2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Atlassian Settings Panel (#339) ───────────────────────────────────────────

export function AtlassianSettings({ appId }: { appId: string }) {
  const queryClient = useQueryClient();
  const {
    data: config,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["atlassian-config", appId],
    queryFn: () => getAtlassianConfig(appId),
    retry: false,
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteAtlassianConfig(appId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["atlassian-config", appId] }),
  });

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
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    success: boolean;
    imported: Array<{ source: string; title: string; type: string }>;
    totalChunks: number;
    errors: string[];
  } | null>(null);

  useEffect(() => {
    if (config) {
      setDeploymentType(config.deploymentType);
      setJiraUrl(config.jiraUrl);
      setJiraProject(config.jiraProject);
      setJiraUsername(config.jiraUsernameVaultRef);
      setJiraApiToken(config.jiraApiTokenVaultRef);
      setJiraPersonalToken(config.jiraPersonalTokenVaultRef);
      setJiraSslVerify(config.jiraSslVerify);
      setConfluenceUrl(config.confluenceUrl);
      setConfluenceSpacesRaw(config.confluenceSpaces.join(", "));
      setConfluenceUsername(config.confluenceUsernameVaultRef);
      setConfluenceApiToken(config.confluenceApiTokenVaultRef);
      setConfluencePersonalToken(config.confluencePersonalTokenVaultRef);
      setConfluenceSslVerify(config.confluenceSslVerify);
    }
  }, [config]);

  const saveMut = useMutation({
    mutationFn: (data: Partial<TalosAtlassianConfig>) => saveAtlassianConfig(appId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["atlassian-config", appId] }),
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
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testAtlassianConnection(appId);
      setTestResult(result);
    } catch {
      setTestResult({ success: false, message: "Connection test failed" });
    } finally {
      setTesting(false);
    }
  };

  const handleReimport = async () => {
    setImporting(true);
    setImportResult(null);
    try {
      const result = await importAtlassianData(appId);
      setImportResult(result);
    } catch (err) {
      setImportResult({ success: false, imported: [], totalChunks: 0, errors: [err instanceof Error ? err.message : "Import failed"] });
    } finally {
      setImporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Atlassian Integration</h3>
        {config && (
          <Button variant="destructive" size="sm" onClick={() => deleteMut.mutate()}>
            <Trash2 className="mr-1 h-4 w-4" /> Remove
          </Button>
        )}
      </div>

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

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Jira</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Jira URL" value={jiraUrl} onChange={(e) => setJiraUrl(e.target.value)} />
          <Input placeholder="Project key" value={jiraProject} onChange={(e) => setJiraProject(e.target.value)} />
          {deploymentType === "cloud" ? (
            <>
              <Input
                placeholder="Username vault ref"
                value={jiraUsername}
                onChange={(e) => setJiraUsername(e.target.value)}
              />
              <Input
                placeholder="API token vault ref"
                value={jiraApiToken}
                onChange={(e) => setJiraApiToken(e.target.value)}
              />
            </>
          ) : (
            <Input
              placeholder="Personal access token vault ref"
              value={jiraPersonalToken}
              onChange={(e) => setJiraPersonalToken(e.target.value)}
            />
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={jiraSslVerify} onChange={(e) => setJiraSslVerify(e.target.checked)} />
            Verify SSL
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Confluence</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Confluence URL"
            value={confluenceUrl}
            onChange={(e) => setConfluenceUrl(e.target.value)}
          />
          <Input
            placeholder="Space keys (comma-separated)"
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
                placeholder="API token vault ref"
                value={confluenceApiToken}
                onChange={(e) => setConfluenceApiToken(e.target.value)}
              />
            </>
          ) : (
            <Input
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
        </CardContent>
      </Card>

      {testResult && (
        <div className={cn("flex items-center gap-2 text-sm", testResult.success ? "text-green-600" : "text-red-600")}>
          {testResult.success ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
          {testResult.message}
        </div>
      )}

      {/* Re-import section (#472) */}
      {config && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Data Re-Import</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {config.updatedAt && (
              <p className="text-xs text-muted-foreground">
                Last import: {new Date(config.updatedAt).toLocaleString()}
              </p>
            )}
            <Button size="sm" onClick={handleReimport} disabled={importing}>
              {importing ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing...</>
              ) : (
                <><RefreshCw className="mr-2 h-4 w-4" /> Re-import Data</>
              )}
            </Button>
            {importResult && (
              <div className={cn("text-sm space-y-1", importResult.success ? "text-green-600" : "text-red-600")}>
                {importResult.success ? (
                  <p><Check className="inline h-4 w-4 mr-1" />Imported {importResult.totalChunks} chunks from {importResult.imported.length} source(s)</p>
                ) : (
                  <p><X className="inline h-4 w-4 mr-1" />{importResult.errors.join("; ")}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
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
            "Save"
          )}
        </Button>
      </div>
    </div>
  );
}
