"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { getMcpServers, createMcpServer, updateMcpServer, deleteMcpServer, type McpServer } from "@/lib/api";
import { Plus, Trash2, Pencil, Server, Database, Globe, Plug, ChevronDown, X } from "lucide-react";

// ── MCP Server Presets ────────────────────────────────────────────────────────

type McpPreset = {
  name: string;
  label: string;
  description: string;
  category: string;
  type: "stdio" | "http" | "sse" | "docker";
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  envPlaceholders?: Record<string, string>;
  tags?: string[];
  /** If true, user can create multiple instances (e.g. JDBC connections) */
  allowMultiple?: boolean;
  /** Runtime the host must have installed to run this server */
  runtime: "node" | "docker" | "java" | "python";
  /** Link to the server's source / docs */
  docsUrl?: string;
};

const MCP_PRESETS: McpPreset[] = [
  // ── GitHub ──
  {
    name: "github",
    label: "GitHub (Cloud)",
    description:
      "Official GitHub MCP server for github.com repositories. Provides issue, PR, code search, and repo management tools. (Replaces deprecated @modelcontextprotocol/server-github as of April 2025.)",
    category: "github",
    // Official server is a Go static binary, distributed as a Docker image
    runtime: "docker",
    type: "stdio",
    command: "docker",
    args: ["run", "-i", "--rm", "-e", "GITHUB_PERSONAL_ACCESS_TOKEN", "ghcr.io/github/github-mcp-server"],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: "" },
    envPlaceholders: { GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_... or github_pat_..." },
    tags: ["github", "cloud", "issues", "prs"],
    docsUrl: "https://github.com/github/github-mcp-server",
  },
  {
    name: "github-enterprise",
    label: "GitHub Enterprise",
    description:
      "Official GitHub MCP server for GitHub Enterprise Server (GHE) or EMU. Set GITHUB_HOST to your enterprise hostname (without https://).",
    category: "github",
    runtime: "docker",
    type: "stdio",
    command: "docker",
    args: [
      "run",
      "-i",
      "--rm",
      "-e",
      "GITHUB_PERSONAL_ACCESS_TOKEN",
      "-e",
      "GITHUB_HOST",
      "ghcr.io/github/github-mcp-server",
    ],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: "", GITHUB_HOST: "" },
    envPlaceholders: {
      GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_... or github_pat_...",
      GITHUB_HOST: "git.yourcompany.com",
    },
    tags: ["github", "enterprise", "emu", "ghe"],
    docsUrl: "https://github.com/github/github-mcp-server",
  },
  // ── JDBC / Database ──
  {
    name: "jdbc",
    label: "JDBC Database",
    description:
      "Connect to Oracle, PostgreSQL, MySQL, SQL Server, or any JDBC database via Docker. Supports multiple connections — create one server per database.",
    category: "jdbc",
    runtime: "docker",
    type: "stdio",
    command: "docker",
    args: ["run", "--rm", "-i", "-e", "JDBC_URL", "-e", "JDBC_USER", "-e", "JDBC_PASSWORD", "guang1/jdbc-mcp:latest"],
    env: { JDBC_URL: "", JDBC_USER: "", JDBC_PASSWORD: "" },
    envPlaceholders: {
      JDBC_URL: "jdbc:oracle:thin:@host:1521:SID",
      JDBC_USER: "username",
      JDBC_PASSWORD: "password",
    },
    tags: ["database", "jdbc", "oracle", "postgresql", "mysql"],
    allowMultiple: true,
    docsUrl: "https://hub.docker.com/r/guang1/jdbc-mcp",
  },
  // ── Cloud / DevOps ──
  {
    name: "aws-api",
    label: "AWS API",
    description:
      "Official AWS API MCP server for interacting with AWS services. Run via Docker to avoid a local Python install.",
    category: "cloud",
    runtime: "docker",
    type: "stdio",
    command: "docker",
    args: [
      "run",
      "-i",
      "--rm",
      "-e",
      "AWS_REGION",
      "-e",
      "AWS_ACCESS_KEY_ID",
      "-e",
      "AWS_SECRET_ACCESS_KEY",
      "mcp/aws-api-mcp-server",
    ],
    env: { AWS_REGION: "", AWS_ACCESS_KEY_ID: "", AWS_SECRET_ACCESS_KEY: "" },
    envPlaceholders: {
      AWS_REGION: "us-east-1",
      AWS_ACCESS_KEY_ID: "AKIA...",
      AWS_SECRET_ACCESS_KEY: "secret",
    },
    tags: ["aws", "cloud"],
    docsUrl: "https://hub.docker.com/r/mcp/aws-api-mcp-server",
  },
  {
    name: "docker-mcp",
    label: "Docker",
    description:
      "Docker MCP server for container management. Mounts the Docker socket to manage containers on the host.",
    category: "devtools",
    runtime: "docker",
    type: "stdio",
    command: "docker",
    args: ["run", "-i", "--rm", "-v", "/var/run/docker.sock:/var/run/docker.sock", "mcp/docker"],
    tags: ["docker", "containers"],
    docsUrl: "https://hub.docker.com/r/mcp/docker",
  },
  // ── Collaboration ──
  {
    name: "atlassian",
    label: "Atlassian (Jira/Confluence)",
    description:
      "Jira and Confluence MCP server for Cloud and Data Center. Provide credentials for each product you use.",
    category: "collaboration",
    runtime: "docker",
    type: "stdio",
    command: "docker",
    args: [
      "run",
      "-i",
      "--rm",
      "-e",
      "CONFLUENCE_URL",
      "-e",
      "CONFLUENCE_USERNAME",
      "-e",
      "CONFLUENCE_API_TOKEN",
      "-e",
      "JIRA_URL",
      "-e",
      "JIRA_USERNAME",
      "-e",
      "JIRA_API_TOKEN",
      "mcp/atlassian",
    ],
    env: {
      CONFLUENCE_URL: "",
      CONFLUENCE_USERNAME: "",
      CONFLUENCE_API_TOKEN: "",
      JIRA_URL: "",
      JIRA_USERNAME: "",
      JIRA_API_TOKEN: "",
    },
    envPlaceholders: {
      CONFLUENCE_URL: "https://yourorg.atlassian.net",
      CONFLUENCE_USERNAME: "user@company.com",
      CONFLUENCE_API_TOKEN: "your-api-token",
      JIRA_URL: "https://yourorg.atlassian.net",
      JIRA_USERNAME: "user@company.com",
      JIRA_API_TOKEN: "your-api-token",
    },
    tags: ["jira", "confluence", "atlassian"],
    docsUrl: "https://hub.docker.com/r/mcp/atlassian",
  },
  {
    name: "salesforce",
    label: "Salesforce",
    description: "Salesforce MCP server for CRM data access via SOQL and REST API.",
    category: "cloud",
    runtime: "node",
    type: "stdio",
    command: "npx",
    args: ["-y", "@salesforce/mcp"],
    env: { SF_INSTANCE_URL: "", SF_ACCESS_TOKEN: "" },
    envPlaceholders: {
      SF_INSTANCE_URL: "https://yourorg.my.salesforce.com",
      SF_ACCESS_TOKEN: "your-access-token",
    },
    tags: ["salesforce", "crm"],
    allowMultiple: true,
    docsUrl: "https://www.npmjs.com/package/@salesforce/mcp",
  },
  // ── Dev Tools ──
  {
    name: "context7",
    label: "Context7 (Library Docs)",
    description: "Query up-to-date library and framework documentation via Context7.",
    category: "devtools",
    runtime: "node",
    type: "stdio",
    command: "npx",
    args: ["-y", "@upstash/context7-mcp"],
    tags: ["docs", "libraries"],
    docsUrl: "https://context7.com/docs/mcp",
  },
  {
    name: "playwright",
    label: "Playwright (Browser)",
    description: "Browser automation and testing via the official Microsoft Playwright MCP server.",
    category: "devtools",
    runtime: "node",
    type: "stdio",
    command: "npx",
    args: ["-y", "@playwright/mcp@latest"],
    tags: ["browser", "testing", "playwright"],
    docsUrl: "https://github.com/microsoft/playwright-mcp",
  },
];

const CATEGORY_ICONS: Record<string, typeof Server> = {
  github: Globe,
  jdbc: Database,
  cloud: Globe,
  devtools: Plug,
  collaboration: Server,
};

const CATEGORY_LABELS: Record<string, string> = {
  github: "GitHub",
  jdbc: "Database / JDBC",
  cloud: "Cloud & SaaS",
  devtools: "Developer Tools",
  collaboration: "Collaboration",
};

const RUNTIME_LABELS: Record<string, string> = {
  node: "Node.js",
  docker: "Docker",
  java: "Java",
  python: "Python",
};

const RUNTIME_COLORS: Record<string, string> = {
  node: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
  docker: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  java: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
  python: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20",
};

// ── Env Editor ────────────────────────────────────────────────────────────────

function EnvEditor({
  env,
  placeholders,
  onChange,
}: {
  env: Record<string, string>;
  placeholders?: Record<string, string>;
  onChange: (env: Record<string, string>) => void;
}) {
  const keys = Object.keys(env);

  return (
    <div className="space-y-2">
      {keys.map((key) => (
        <div key={key} className="flex gap-2 items-center">
          <code className="text-xs font-mono min-w-[180px] shrink-0 text-muted-foreground">{key}</code>
          <Input
            className="flex-1 font-mono text-sm h-8"
            type={
              key.toLowerCase().includes("password") ||
              key.toLowerCase().includes("secret") ||
              key.toLowerCase().includes("token")
                ? "password"
                : "text"
            }
            value={env[key]}
            placeholder={placeholders?.[key] ?? `Enter ${key}`}
            onChange={(e) => onChange({ ...env, [key]: e.target.value })}
          />
        </div>
      ))}
    </div>
  );
}

// ── Add From Preset Dialog ────────────────────────────────────────────────────

function AddFromPreset({
  existingNames,
  onAdd,
  onCancel,
}: {
  existingNames: Set<string>;
  onAdd: (preset: McpPreset, name: string, env: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const [selectedPreset, setSelectedPreset] = useState<McpPreset | null>(null);
  const [instanceName, setInstanceName] = useState("");
  const [envValues, setEnvValues] = useState<Record<string, string>>({});

  const selectPreset = (preset: McpPreset) => {
    setSelectedPreset(preset);
    setEnvValues({ ...(preset.env ?? {}) });
    // Auto-generate a unique instance name for multi-instance presets
    if (preset.allowMultiple) {
      let suffix = 1;
      let candidate = `${preset.name}-${suffix}`;
      while (existingNames.has(candidate)) {
        suffix++;
        candidate = `${preset.name}-${suffix}`;
      }
      setInstanceName(candidate);
    } else {
      setInstanceName(preset.name);
    }
  };

  const categories = [...new Set(MCP_PRESETS.map((p) => p.category))];

  if (!selectedPreset) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium">Add MCP Server</h4>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        {categories.map((cat) => {
          const CategoryIcon = CATEGORY_ICONS[cat] ?? Server;
          const presets = MCP_PRESETS.filter((p) => p.category === cat);
          const allAdded = presets.every((p) => !p.allowMultiple && existingNames.has(p.name));
          if (allAdded) return null;
          return (
            <div key={cat} className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <CategoryIcon className="h-3 w-3" />
                {CATEGORY_LABELS[cat] ?? cat}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {presets.map((preset) => {
                  const alreadyAdded = !preset.allowMultiple && existingNames.has(preset.name);
                  return (
                    <button
                      key={preset.name}
                      type="button"
                      disabled={alreadyAdded}
                      onClick={() => selectPreset(preset)}
                      className="flex flex-col gap-0.5 p-3 rounded-md border text-left hover:bg-muted/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{preset.label}</span>
                        <span
                          className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${RUNTIME_COLORS[preset.runtime] ?? ""}`}
                        >
                          {RUNTIME_LABELS[preset.runtime] ?? preset.runtime}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground line-clamp-2">{preset.description}</span>
                      {alreadyAdded && (
                        <Badge variant="outline" className="text-xs w-fit mt-1">
                          Already added
                        </Badge>
                      )}
                      {preset.allowMultiple && (
                        <Badge variant="secondary" className="text-xs w-fit mt-1">
                          Multiple connections
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium">Configure: {selectedPreset.label}</h4>
          <p className="text-xs text-muted-foreground">{selectedPreset.description}</p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setSelectedPreset(null)}>
          Back
        </Button>
      </div>

      {/* Runtime prerequisite notice */}
      <div
        className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${RUNTIME_COLORS[selectedPreset.runtime] ?? "bg-muted/50"}`}
      >
        <span className="font-semibold shrink-0">
          Requires {RUNTIME_LABELS[selectedPreset.runtime] ?? selectedPreset.runtime}
        </span>
        <span className="text-muted-foreground">
          {selectedPreset.runtime === "docker" && "Docker must be installed and running on the host that runs Talos."}
          {selectedPreset.runtime === "node" && "Node.js ≥18 and npx must be available on the host PATH."}
          {selectedPreset.runtime === "java" && "A Java Runtime (JRE ≥11) must be installed on the host."}
          {selectedPreset.runtime === "python" && "Python ≥3.9 and uvx/pip must be available on the host PATH."}
          {selectedPreset.docsUrl && (
            <>
              {" "}
              —{" "}
              <a
                href={selectedPreset.docsUrl}
                target="_blank"
                rel="noreferrer"
                className="underline hover:no-underline"
              >
                docs
              </a>
            </>
          )}
        </span>
      </div>
      <div>
        <label className="text-sm font-medium block mb-1">Server Name</label>
        <Input
          value={instanceName}
          onChange={(e) => setInstanceName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
          placeholder="server-name"
          className="font-mono"
        />
        {selectedPreset.allowMultiple && (
          <p className="text-xs text-muted-foreground mt-1">
            This server type supports multiple connections. Give each a unique name.
          </p>
        )}
      </div>
      {Object.keys(envValues).length > 0 && (
        <div>
          <label className="text-sm font-medium block mb-2">Credentials & Configuration</label>
          <EnvEditor env={envValues} placeholders={selectedPreset.envPlaceholders} onChange={setEnvValues} />
        </div>
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onAdd(selectedPreset, instanceName, envValues)} disabled={!instanceName}>
          <Plus className="h-3 w-3 mr-1" />
          Add Server
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Server Card ───────────────────────────────────────────────────────────────

function ServerCard({
  server,
  onToggle,
  onEdit,
  onDelete,
}: {
  server: McpServer;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const CategoryIcon = CATEGORY_ICONS[server.category ?? ""] ?? Server;

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center gap-2">
        <CategoryIcon className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{server.name}</span>
            <Badge variant="outline" className="text-xs">
              {server.type}
            </Badge>
            {server.category && (
              <Badge variant="secondary" className="text-xs">
                {CATEGORY_LABELS[server.category] ?? server.category}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Switch checked={server.enabled} onCheckedChange={onToggle} />
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            aria-label="Expand server details"
            onClick={() => setExpanded(!expanded)}
          >
            <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" aria-label="Edit server" onClick={onEdit}>
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            aria-label="Delete server"
            onClick={onDelete}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
      {expanded && (
        <div className="text-xs space-y-1 pl-6">
          {server.command && (
            <div>
              <span className="text-muted-foreground">Command:</span>{" "}
              <code className="font-mono">
                {server.command} {server.args?.join(" ")}
              </code>
            </div>
          )}
          {server.url && (
            <div>
              <span className="text-muted-foreground">URL:</span> <code className="font-mono">{server.url}</code>
            </div>
          )}
          {server.env && Object.keys(server.env).length > 0 && (
            <div>
              <span className="text-muted-foreground">Environment:</span>
              <div className="mt-1 space-y-0.5">
                {Object.entries(server.env).map(([k, v]) => (
                  <div key={k} className="font-mono">
                    <span className="text-muted-foreground">{k}=</span>
                    {k.toLowerCase().includes("password") ||
                    k.toLowerCase().includes("secret") ||
                    k.toLowerCase().includes("token")
                      ? "••••••••"
                      : v || <span className="italic text-muted-foreground">not set</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {server.tags && server.tags.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {server.tags.map((t) => (
                <Badge key={t} variant="outline" className="text-xs">
                  {t}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Edit Dialog ───────────────────────────────────────────────────────────────

function EditServerForm({
  server,
  onSave,
  onCancel,
}: {
  server: McpServer;
  onSave: (updates: Partial<McpServer>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(server.name);
  const [command, setCommand] = useState(server.command ?? "");
  const [args, setArgs] = useState(server.args?.join(" ") ?? "");
  const [url, setUrl] = useState(server.url ?? "");
  const [env, setEnv] = useState<Record<string, string>>(server.env ?? {});
  const [newEnvKey, setNewEnvKey] = useState("");

  return (
    <div className="space-y-3 rounded-lg border p-4 bg-muted/30">
      <h4 className="text-sm font-medium">Edit: {server.name}</h4>
      <div>
        <label className="text-xs font-medium block mb-1">Name</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} className="font-mono h-8" />
      </div>
      {(server.type === "stdio" || server.type === "docker") && (
        <>
          <div>
            <label className="text-xs font-medium block mb-1">Command</label>
            <Input value={command} onChange={(e) => setCommand(e.target.value)} className="font-mono h-8" />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1">Arguments (space-separated)</label>
            <Input value={args} onChange={(e) => setArgs(e.target.value)} className="font-mono h-8" />
          </div>
        </>
      )}
      {(server.type === "http" || server.type === "sse") && (
        <div>
          <label className="text-xs font-medium block mb-1">URL</label>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="font-mono h-8"
            placeholder="http://localhost:3001/mcp"
          />
        </div>
      )}
      {Object.keys(env).length > 0 && (
        <div>
          <label className="text-xs font-medium block mb-2">Environment Variables</label>
          <EnvEditor env={env} onChange={setEnv} />
        </div>
      )}
      <div className="flex gap-2">
        <Input
          value={newEnvKey}
          onChange={(e) => setNewEnvKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))}
          placeholder="Add env var..."
          className="font-mono h-8 max-w-[200px]"
        />
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          disabled={!newEnvKey}
          onClick={() => {
            setEnv({ ...env, [newEnvKey]: "" });
            setNewEnvKey("");
          }}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>
      <div className="flex gap-2 pt-2">
        <Button
          size="sm"
          onClick={() =>
            onSave({
              name,
              command: command || undefined,
              args: args ? args.split(/\s+/) : [],
              url: url || undefined,
              env,
            })
          }
        >
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Main MCP Panel ────────────────────────────────────────────────────────────

export function McpPanel() {
  const qc = useQueryClient();
  const { data: servers, isLoading } = useQuery({ queryKey: ["mcp-servers"], queryFn: getMcpServers });
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: (data: Partial<McpServer>) => createMcpServer(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mcp-servers"] });
      setShowAdd(false);
    },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<McpServer> }) => updateMcpServer(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mcp-servers"] });
      setEditingId(null);
    },
  });
  const delMut = useMutation({
    mutationFn: (id: string) => deleteMcpServer(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mcp-servers"] }),
  });
  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => updateMcpServer(id, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mcp-servers"] }),
  });

  const existingNames = new Set((servers ?? []).map((s: McpServer) => s.name));

  const handleAddFromPreset = (preset: McpPreset, name: string, env: Record<string, string>) => {
    createMut.mutate({
      name,
      type: preset.type,
      command: preset.command,
      args: preset.args,
      url: preset.url,
      env,
      enabled: true,
      category: preset.category,
      tags: preset.tags,
    } as Partial<McpServer>);
  };

  // Group servers by category
  const grouped = (servers ?? []).reduce<Record<string, McpServer[]>>((acc, s: McpServer) => {
    const cat = s.category ?? "general";
    (acc[cat] ??= []).push(s);
    return acc;
  }, {});

  const categoryOrder = ["github", "jdbc", "cloud", "collaboration", "devtools", "general"];
  const sortedCategories = Object.keys(grouped).sort(
    (a, b) =>
      (categoryOrder.indexOf(a) === -1 ? 99 : categoryOrder.indexOf(a)) -
      (categoryOrder.indexOf(b) === -1 ? 99 : categoryOrder.indexOf(b))
  );

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="space-y-4">
      {(servers ?? []).length === 0 && !showAdd && (
        <div className="text-center py-8 space-y-2">
          <Server className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No MCP servers configured.</p>
          <p className="text-xs text-muted-foreground">
            Add servers to extend Talos with external tools and data sources.
          </p>
        </div>
      )}

      {sortedCategories.map((cat) => {
        const catServers = grouped[cat];
        const CategoryIcon = CATEGORY_ICONS[cat] ?? Server;
        return (
          <div key={cat} className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
              <CategoryIcon className="h-3 w-3" />
              {CATEGORY_LABELS[cat] ?? cat}
              <Badge variant="outline" className="text-xs ml-auto">
                {catServers.length}
              </Badge>
            </div>
            <div className="space-y-2">
              {catServers.map((s: McpServer) =>
                editingId === s.id ? (
                  <EditServerForm
                    key={s.id}
                    server={s}
                    onSave={(updates) => updateMut.mutate({ id: s.id, data: updates })}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <ServerCard
                    key={s.id}
                    server={s}
                    onToggle={() => toggleMut.mutate({ id: s.id, enabled: !s.enabled })}
                    onEdit={() => setEditingId(s.id)}
                    onDelete={() => delMut.mutate(s.id)}
                  />
                )
              )}
            </div>
          </div>
        );
      })}

      {showAdd ? (
        <div className="border-t pt-4">
          <AddFromPreset existingNames={existingNames} onAdd={handleAddFromPreset} onCancel={() => setShowAdd(false)} />
        </div>
      ) : (
        <div className="border-t pt-4">
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="h-3 w-3 mr-1" />
            Add MCP Server
          </Button>
        </div>
      )}
    </div>
  );
}
