"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  getDataSources,
  createDataSource,
  updateDataSource,
  deleteDataSource,
  testDataSourceConnection,
  type TalosDataSource,
} from "@/lib/api";
import { Database, Plus, Trash2, Loader2, Check, X, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Data Source Settings Panel (#338) ─────────────────────────────────────────

export function DataSourceSettings({ appId }: { appId: string }) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const { data: sources, isLoading } = useQuery({
    queryKey: ["data-sources", appId],
    queryFn: () => getDataSources(appId),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteDataSource(appId, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["data-sources", appId] }),
  });

  if (isLoading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading data sources...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Data Sources</h3>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="mr-1 h-4 w-4" /> Add Data Source
        </Button>
      </div>

      {sources?.length === 0 && !showAdd && (
        <p className="text-sm text-muted-foreground">No data sources configured. Add one to enable schema-aware test generation.</p>
      )}

      {sources?.map((ds) => (
        <Card key={ds.id}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm">{ds.label}</CardTitle>
                <Badge variant="secondary">{ds.driverType}</Badge>
                <Badge variant={ds.isActive ? "default" : "outline"}>{ds.isActive ? "Active" : "Inactive"}</Badge>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => setEditingId(editingId === ds.id ? null : ds.id)}>
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => deleteMut.mutate(ds.id)}>
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            </div>
          </CardHeader>
          {editingId === ds.id && (
            <CardContent>
              <DataSourceForm appId={appId} existing={ds} onComplete={() => setEditingId(null)} />
            </CardContent>
          )}
        </Card>
      ))}

      {showAdd && (
        <Card>
          <CardHeader><CardTitle className="text-sm">New Data Source</CardTitle></CardHeader>
          <CardContent>
            <DataSourceForm appId={appId} onComplete={() => setShowAdd(false)} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DataSourceForm({ appId, existing, onComplete }: { appId: string; existing?: TalosDataSource; onComplete: () => void }) {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState(existing?.label ?? "");
  const [driverType, setDriverType] = useState(existing?.driverType ?? "postgresql");
  const [jdbcUrl, setJdbcUrl] = useState(existing?.jdbcUrl ?? "");
  const [usernameVaultRef, setUsernameVaultRef] = useState(existing?.usernameVaultRef ?? "");
  const [passwordVaultRef, setPasswordVaultRef] = useState(existing?.passwordVaultRef ?? "");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleSave = async () => {
    setSaving(true);
    if (existing) {
      await updateDataSource(appId, existing.id, { label, driverType: driverType as TalosDataSource["driverType"], jdbcUrl, usernameVaultRef, passwordVaultRef });
    } else {
      await createDataSource(appId, { label, driverType: driverType as TalosDataSource["driverType"], jdbcUrl, usernameVaultRef, passwordVaultRef });
    }
    await queryClient.invalidateQueries({ queryKey: ["data-sources", appId] });
    setSaving(false);
    onComplete();
  };

  const handleTest = async () => {
    if (!existing) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testDataSourceConnection(appId, existing.id);
      setTestResult(result);
    } catch {
      setTestResult({ success: false, message: "Connection test failed" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-3">
      <Input placeholder="Label" value={label} onChange={(e) => setLabel(e.target.value)} />
      <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={driverType} onChange={(e) => setDriverType(e.target.value as typeof driverType)}>
        <option value="postgresql">PostgreSQL</option>
        <option value="oracle">Oracle</option>
        <option value="mysql">MySQL</option>
        <option value="sqlserver">SQL Server</option>
        <option value="sqlite">SQLite</option>
        <option value="other">Other</option>
      </select>
      <Input placeholder="JDBC URL" value={jdbcUrl} onChange={(e) => setJdbcUrl(e.target.value)} />
      <Input placeholder="Username vault ref" value={usernameVaultRef} onChange={(e) => setUsernameVaultRef(e.target.value)} />
      <Input placeholder="Password vault ref" value={passwordVaultRef} onChange={(e) => setPasswordVaultRef(e.target.value)} />

      {testResult && (
        <div className={cn("flex items-center gap-2 text-sm", testResult.success ? "text-green-600" : "text-red-600")}>
          {testResult.success ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
          {testResult.message}
        </div>
      )}

      <div className="flex gap-2">
        {existing && (
          <Button variant="outline" size="sm" onClick={handleTest} disabled={testing}>
            {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Test Connection
          </Button>
        )}
        <Button size="sm" onClick={handleSave} disabled={saving || !label || !jdbcUrl}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {existing ? "Update" : "Create"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onComplete}>Cancel</Button>
      </div>
    </div>
  );
}
