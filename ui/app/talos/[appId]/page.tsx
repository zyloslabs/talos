"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getApplication } from "@/lib/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppIntelligencePanel } from "@/components/talos/app-intelligence-panel";
import { DataSourceSettings } from "@/components/talos/data-source-settings";
import { AtlassianSettings } from "@/components/talos/atlassian-settings";
import { KnowledgePanel } from "@/components/talos/knowledge-panel";
import { SyncScheduleSettings } from "@/components/talos/sync-schedule-settings";
import { Loader2 } from "lucide-react";

export default function AppDetailPage() {
  const { appId } = useParams<{ appId: string }>();

  const { data: app, isLoading, error } = useQuery({
    queryKey: ["application", appId],
    queryFn: () => getApplication(appId),
    enabled: !!appId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !app) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        Application not found.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">Application</p>
        <h1 className="mt-1 text-3xl font-semibold">{app.name}</h1>
        {app.description && <p className="mt-1 text-sm text-muted-foreground">{app.description}</p>}
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="datasources">Data Sources</TabsTrigger>
          <TabsTrigger value="atlassian">Atlassian</TabsTrigger>
          <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
          <TabsTrigger value="sync">Sync Schedules</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <AppIntelligencePanel appId={appId} />
        </TabsContent>

        <TabsContent value="datasources" className="mt-6">
          <DataSourceSettings appId={appId} />
        </TabsContent>

        <TabsContent value="atlassian" className="mt-6">
          <AtlassianSettings appId={appId} />
        </TabsContent>

        <TabsContent value="knowledge" className="mt-6">
          <KnowledgePanel appId={appId} />
        </TabsContent>

        <TabsContent value="sync" className="mt-6">
          <SyncScheduleSettings appId={appId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
