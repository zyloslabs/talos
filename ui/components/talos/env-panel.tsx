"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getEnvEntries, setEnvEntry, deleteEnvEntry, getEnvRaw, type EnvEntry } from "@/lib/api";
import { Eye, EyeOff, Save, Trash2, AlertTriangle, CheckCircle2, Plus, Pencil } from "lucide-react";

// ── Known configurable parameters (mirrors .env.example schema) ───────────────

type KnownVar = {
  key: string;
  label: string;
  description: string;
  required: boolean;
  category: string;
};

const KNOWN_VARS: KnownVar[] = [
  {
    key: "GITHUB_CLIENT_ID",
    label: "GitHub Client ID",
    description: "Required for GitHub Copilot device auth flow",
    required: true,
    category: "Authentication",
  },
  {
    key: "GITHUB_TOKEN",
    label: "GitHub Token",
    description: "GitHub token for Copilot SDK API key auth (alternative to device auth)",
    required: false,
    category: "Authentication",
  },
  {
    key: "GITHUB_PERSONAL_ACCESS_TOKEN",
    label: "GitHub Personal Access Token",
    description: "PAT for GitHub API access (discovery engine, MCP server). Requires repo + read:org scopes.",
    required: false,
    category: "Authentication",
  },
  {
    key: "COPILOT_GITHUB_TOKEN",
    label: "Copilot GitHub Token",
    description: "Alternative token for Copilot SDK auth (fallback if GITHUB_TOKEN not set)",
    required: false,
    category: "Authentication",
  },

  {
    key: "BRAVE_API_KEY",
    label: "Brave Search API Key",
    description: "Enables the web-search tool (https://api.search.brave.com). Shared with openzigs.",
    required: false,
    category: "Integrations",
  },
  {
    key: "TALOS_ADMIN_TOKEN",
    label: "Admin Token",
    description: "Bearer token to secure the admin API (optional)",
    required: false,
    category: "Security",
  },
  {
    key: "PORT",
    label: "Backend Port",
    description: "Port for the Talos backend server — default 3000, requires restart",
    required: false,
    category: "Server",
  },
  {
    key: "TALOS_DATA_DIR",
    label: "Data Directory",
    description: "Path to storage directory — default ~/.talos, requires restart",
    required: false,
    category: "Server",
  },
  {
    key: "TALOS_ALLOWED_DIRS",
    label: "Allowed Directories",
    description: "Comma-separated directories the filesystem tool can access",
    required: false,
    category: "Filesystem",
  },
];

const KNOWN_KEYS = new Set(KNOWN_VARS.map((v) => v.key));
const CATEGORIES = [...new Set(KNOWN_VARS.map((v) => v.category))];

// ── KnownVarRow ───────────────────────────────────────────────────────────────

function KnownVarRow({ varDef, entry }: { varDef: KnownVar; entry: EnvEntry | undefined }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [rawValue, setRawValue] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  const isSet = entry !== undefined;
  const isMasked = entry?.masked ?? false;
  // Values that come from the OS process environment cannot be deleted through the env panel.
  const isSystemEnv = entry?.source === "process";

  const saveMut = useMutation({
    mutationFn: (value: string) => setEnvEntry(varDef.key, value),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["env"] }); setEditing(false); },
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteEnvEntry(varDef.key),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["env"] }),
  });

  const fetchRaw = async (): Promise<string> => {
    if (rawValue !== null) return rawValue;
    const data = await getEnvRaw(varDef.key);
    setRawValue(data.value);
    return data.value;
  };

  const handleReveal = async () => {
    if (!revealed && isMasked) await fetchRaw();
    setRevealed((r) => !r);
  };

  const handleEdit = async () => {
    const value = isMasked ? await fetchRaw() : (entry?.value ?? "");
    setEditValue(value);
    setEditing(true);
  };

  const displayValue = (): string => {
    if (!entry) return "";
    if (isMasked && revealed && rawValue !== null) return rawValue;
    return entry.value;
  };

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <code className="text-sm font-mono font-medium">{varDef.key}</code>
            {varDef.required && !isSet && (
              <Badge variant="destructive" className="text-xs">required</Badge>
            )}
            {isSet && <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />}
            {isSystemEnv && (
              <Badge variant="outline" className="text-xs text-muted-foreground">System env</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{varDef.description}</p>
        </div>
        {!editing && (
          <div className="flex items-center gap-1 shrink-0">
            {isSet && isMasked && (
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={handleReveal}>
                {revealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={handleEdit}>
              <Pencil className="h-3 w-3 mr-1" />
              {isSet ? "Edit" : "Set"}
            </Button>
            {isSet && !isSystemEnv && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => deleteMut.mutate()}
                disabled={deleteMut.isPending}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
      </div>

      {!editing && isSet && (
        <p className="text-xs font-mono text-muted-foreground truncate pl-1">{displayValue()}</p>
      )}
      {!editing && isSet && isSystemEnv && (
        <p className="text-xs text-muted-foreground italic pl-1">
          Set in system environment — enter a value above to override with a file-stored value.
        </p>
      )}
      {!editing && !isSet && (
        <p className="text-xs text-muted-foreground italic pl-1">Not configured</p>
      )}

      {editing && (
        <div className="flex gap-2">
          <Input
            className="flex-1 font-mono text-sm h-8"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            placeholder={`Enter ${varDef.label}`}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") saveMut.mutate(editValue);
              if (e.key === "Escape") setEditing(false);
            }}
          />
          <Button size="sm" className="h-8" onClick={() => saveMut.mutate(editValue)} disabled={saveMut.isPending}>
            <Save className="h-3 w-3 mr-1" />Save
          </Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

// ── EnvPanel ──────────────────────────────────────────────────────────────────

export function EnvPanel() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["env"], queryFn: getEnvEntries });
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  const addMut = useMutation({
    mutationFn: () => setEnvEntry(newKey, newValue),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["env"] }); setNewKey(""); setNewValue(""); },
  });

  const deleteMut = useMutation({
    mutationFn: (key: string) => deleteEnvEntry(key),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["env"] }),
  });

  const warnings = data?.warnings?.missingRequired;
  const entriesMap = new Map<string, EnvEntry>((data?.entries ?? []).map((e: EnvEntry) => [e.key, e]));
  const customEntries: EnvEntry[] = (data?.entries ?? []).filter((e: EnvEntry) => !KNOWN_KEYS.has(e.key));

  return (
    <div className="space-y-6">
      {warnings && warnings.length > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-yellow-500/10 border border-yellow-500/30 text-yellow-700 dark:text-yellow-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <p className="text-sm">
            Missing required: <strong>{warnings.join(", ")}</strong>
            {warnings.includes("GITHUB_CLIENT_ID") && " — set GITHUB_CLIENT_ID to enable authentication."}
          </p>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : (
        <>
          {CATEGORIES.map((category) => (
            <div key={category} className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
                {category}
              </h4>
              <div className="space-y-2">
                {KNOWN_VARS.filter((v) => v.category === category).map((varDef) => (
                  <KnownVarRow key={varDef.key} varDef={varDef} entry={entriesMap.get(varDef.key)} />
                ))}
              </div>
            </div>
          ))}

          {customEntries.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
                Other Variables
              </h4>
              <div className="space-y-2">
                {customEntries.map((entry) => (
                  <div key={entry.key} className="flex items-center gap-2 p-2 rounded border">
                    <code className="text-sm font-mono min-w-[200px] shrink-0">{entry.key}</code>
                    <span className="flex-1 text-sm font-mono text-muted-foreground truncate">{entry.value}</span>
                    <Badge variant={entry.masked ? "secondary" : "outline"} className="text-xs">
                      {entry.masked ? "secret" : "plain"}
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={() => deleteMut.mutate(entry.key)}
                      disabled={deleteMut.isPending}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div className="border-t pt-4 space-y-2">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <Plus className="h-4 w-4" /> Add Custom Variable
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
          />
          <Button size="sm" onClick={() => addMut.mutate()} disabled={!newKey || addMut.isPending}>
            Add
          </Button>
        </div>
      </div>
    </div>
  );
}
