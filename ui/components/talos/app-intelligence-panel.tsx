"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getIntelligenceReport,
  refreshIntelligenceReport,
  type AppIntelligenceReport,
} from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";
import {
  Database,
  FileText,
  Loader2,
  PackageSearch,
  RefreshCw,
  ShieldCheck,
  UserCheck,
} from "lucide-react";

export function AppIntelligencePanel({ appId }: { appId: string }) {
  const queryClient = useQueryClient();

  const { data: report, isLoading, error } = useQuery({
    queryKey: ["intelligence", appId],
    queryFn: () => getIntelligenceReport(appId),
    retry: false,
  });

  const refreshMutation = useMutation({
    mutationFn: () => refreshIntelligenceReport(appId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["intelligence", appId] });
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            <PackageSearch className="h-5 w-5" />
            App Intelligence
          </CardTitle>
          <CardDescription>
            {report
              ? `Scanned ${formatRelativeTime(report.scannedAt)}`
              : "Scan repository to detect tech stack, databases, and test users"}
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refreshMutation.mutate()}
          disabled={refreshMutation.isPending}
        >
          {refreshMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span className="ml-1">{report ? "Rescan" : "Scan"}</span>
        </Button>
      </CardHeader>

      <CardContent className="space-y-6">
        {refreshMutation.isError && (
          <p className="text-sm text-destructive">
            Scan failed: {(refreshMutation.error as Error).message}
          </p>
        )}

        {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}

        {error && !report && !isLoading && (
          <p className="text-sm text-muted-foreground">
            No intelligence report yet. Click &quot;Scan&quot; to analyze the repository.
          </p>
        )}

        {report && (
          <>
            {/* Tech Stack */}
            <TechStackSection items={report.techStack} />

            {/* Databases */}
            <DatabaseSection items={report.databases} appId={appId} />

            {/* Test Users */}
            <TestUserSection items={report.testUsers} appId={appId} />

            {/* Documentation */}
            <DocumentationSection items={report.documentation} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Section Components ──────────────────────────────────────────────────────

function TechStackSection({ items }: { items: AppIntelligenceReport["techStack"] }) {
  if (items.length === 0) return null;

  const grouped = items.reduce(
    (acc, item) => {
      const cat = item.category;
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(item);
      return acc;
    },
    {} as Record<string, typeof items>
  );

  const categoryLabels: Record<string, string> = {
    framework: "Frameworks",
    library: "Libraries",
    language: "Languages",
    build: "Build Tools",
    test: "Testing",
    lint: "Linting",
    other: "Other",
  };

  return (
    <div>
      <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
        <PackageSearch className="h-4 w-4" /> Tech Stack
      </h4>
      <div className="space-y-2">
        {Object.entries(grouped).map(([category, categoryItems]) => (
          <div key={category}>
            <p className="text-xs text-muted-foreground mb-1">
              {categoryLabels[category] ?? category}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {categoryItems.map((item) => (
                <Badge key={item.name} variant="secondary" className="text-xs">
                  {item.name}
                  {item.version && (
                    <span className="ml-1 text-muted-foreground">v{item.version}</span>
                  )}
                </Badge>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DatabaseSection({
  items,
  appId,
}: {
  items: AppIntelligenceReport["databases"];
  appId: string;
}) {
  if (items.length === 0) return null;

  return (
    <div>
      <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
        <Database className="h-4 w-4" /> Detected Databases
      </h4>
      <div className="space-y-2">
        {items.map((db, i) => (
          <div
            key={`${db.type}-${i}`}
            className="flex items-center justify-between rounded-md border p-2 text-sm"
          >
            <div>
              <span className="font-medium">{db.type}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {db.connectionPattern}
              </span>
              {db.environment && (
                <Badge variant="outline" className="ml-2 text-xs">
                  {db.environment}
                </Badge>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => {
                window.location.href = `/talos/setup?appId=${appId}&step=datasource`;
              }}
            >
              Configure
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function TestUserSection({
  items,
  appId,
}: {
  items: AppIntelligenceReport["testUsers"];
  appId: string;
}) {
  if (items.length === 0) return null;

  return (
    <div>
      <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
        <UserCheck className="h-4 w-4" /> Test User References
      </h4>
      <div className="space-y-1">
        {items.map((user, i) => (
          <div
            key={`${user.variableName}-${i}`}
            className="flex items-center justify-between rounded-md border p-2 text-sm"
          >
            <div className="flex items-center gap-2">
              <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{user.variableName}</code>
              {user.roleHint && (
                <Badge variant="outline" className="text-xs">
                  {user.roleHint}
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">{user.source}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => {
                window.location.href = `/talos/vault?appId=${appId}`;
              }}
            >
              <ShieldCheck className="h-3 w-3 mr-1" />
              Create Vault Role
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function DocumentationSection({ items }: { items: AppIntelligenceReport["documentation"] }) {
  if (items.length === 0) return null;

  const typeIcons: Record<string, string> = {
    readme: "📖",
    "api-spec": "🔌",
    guide: "📘",
    contributing: "🤝",
    changelog: "📝",
    other: "📄",
  };

  return (
    <div>
      <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
        <FileText className="h-4 w-4" /> Documentation
      </h4>
      <div className="space-y-1">
        {items.map((doc) => (
          <div key={doc.filePath} className="flex items-center gap-2 text-sm py-1">
            <span>{typeIcons[doc.type] ?? "📄"}</span>
            <span className="font-mono text-xs">{doc.filePath}</span>
            {doc.title && (
              <span className="text-xs text-muted-foreground">— {doc.title}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
