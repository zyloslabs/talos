"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getEnvEntries, setEnvEntry, deleteEnvEntry, getEnvRaw, type EnvEntry } from "@/lib/api";
import { Eye, EyeOff, Plus, Save, Trash2, AlertTriangle } from "lucide-react";

export function EnvPanel() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["env"], queryFn: getEnvEntries });
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  const saveMut = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) => setEnvEntry(key, value),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["env"] }); setEditingKey(null); setEditValue(""); },
  });

  const deleteMut = useMutation({
    mutationFn: (key: string) => deleteEnvEntry(key),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["env"] }),
  });

  const addMut = useMutation({
    mutationFn: () => setEnvEntry(newKey, newValue),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["env"] }); setNewKey(""); setNewValue(""); },
  });

  const handleReveal = async (key: string) => {
    if (revealedKeys.has(key)) {
      setRevealedKeys((prev) => { const next = new Set(prev); next.delete(key); return next; });
      return;
    }
    const raw = await getEnvRaw(key);
    setRevealedKeys((prev) => new Set(prev).add(key));
    // Store the raw value in a data attribute for display
    const entry = data?.entries.find((e: EnvEntry) => e.key === key);
    if (entry) (entry as EnvEntry & { _raw?: string })._raw = raw.value;
  };

  const handleEdit = async (entry: EnvEntry) => {
    setEditingKey(entry.key);
    if (entry.masked) {
      const raw = await getEnvRaw(entry.key);
      setEditValue(raw.value);
    } else {
      setEditValue(entry.value);
    }
  };

  const warnings = data?.warnings?.missingRequired;

  return (
    <div className="space-y-4">
      {warnings && warnings.length > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-yellow-500/10 border border-yellow-500/30 text-yellow-700 dark:text-yellow-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <p className="text-sm">
            Missing required environment variables: <strong>{warnings.join(", ")}</strong>.
            {warnings.includes("GITHUB_CLIENT_ID") && " GITHUB_CLIENT_ID is required for authentication."}
          </p>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : (
        <div className="space-y-2">
          {data?.entries.map((entry: EnvEntry) => (
            <div key={entry.key} className="flex items-center gap-2 p-2 rounded border">
              <code className="text-sm font-mono min-w-[200px] shrink-0">{entry.key}</code>
              {editingKey === entry.key ? (
                <>
                  <Input
                    className="flex-1 font-mono text-sm"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    type="text"
                  />
                  <Button size="sm" onClick={() => saveMut.mutate({ key: entry.key, value: editValue })} disabled={saveMut.isPending}>
                    <Save className="h-3 w-3 mr-1" />Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingKey(null)}>Cancel</Button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm font-mono text-muted-foreground truncate">
                    {entry.masked && !revealedKeys.has(entry.key)
                      ? entry.value
                      : (entry as EnvEntry & { _raw?: string })._raw ?? entry.value}
                  </span>
                  {entry.masked && (
                    <Button size="sm" variant="ghost" onClick={() => handleReveal(entry.key)}>
                      {revealedKeys.has(entry.key) ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </Button>
                  )}
                  <Badge variant={entry.masked ? "secondary" : "outline"} className="text-xs">
                    {entry.masked ? "secret" : "plain"}
                  </Badge>
                  <Button size="sm" variant="ghost" onClick={() => handleEdit(entry)}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteMut.mutate(entry.key)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </>
              )}
            </div>
          ))}
          {(!data?.entries || data.entries.length === 0) && (
            <p className="text-sm text-muted-foreground p-2">No environment variables configured. Add your first variable below.</p>
          )}
        </div>
      )}

      <div className="border-t pt-4 space-y-2">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <Plus className="h-4 w-4" /> Add Variable
        </h4>
        <div className="flex gap-2">
          <Input
            placeholder="KEY_NAME"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))}
            className="font-mono max-w-[200px]"
          />
          <Input
            placeholder="Value"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            className="flex-1 font-mono"
            type="text"
          />
          <Button size="sm" onClick={() => addMut.mutate()} disabled={!newKey || addMut.isPending}>
            Add
          </Button>
        </div>
      </div>
    </div>
  );
}
