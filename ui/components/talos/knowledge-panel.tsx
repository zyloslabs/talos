"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import {
  getKnowledgeStats, getKnowledgeDocuments, searchKnowledge,
  reindexKnowledge, deleteKnowledgeDocument,
  type KnowledgeStats, type KnowledgeDocument,
} from "@/lib/api";
import { RefreshCw, Search, Trash2, FileText, Database, Hash } from "lucide-react";

export function KnowledgePanel() {
  const qc = useQueryClient();
  const { data: stats } = useQuery({ queryKey: ["knowledge-stats"], queryFn: getKnowledgeStats });
  const { data: docs, isLoading } = useQuery({ queryKey: ["knowledge-docs"], queryFn: getKnowledgeDocuments });
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ content: string; score: number; filePath: string }[] | null>(null);

  const reindexMut = useMutation({
    mutationFn: reindexKnowledge,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["knowledge-stats"] });
      qc.invalidateQueries({ queryKey: ["knowledge-docs"] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (docId: string) => deleteKnowledgeDocument(docId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["knowledge-stats"] });
      qc.invalidateQueries({ queryKey: ["knowledge-docs"] });
    },
  });

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    const result = await searchKnowledge(searchQuery, 5);
    setSearchResults(result.results);
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard icon={<FileText className="h-4 w-4" />} label="Documents" value={stats?.documentCount ?? 0} />
        <StatCard icon={<Hash className="h-4 w-4" />} label="Chunks" value={stats?.chunkCount ?? 0} />
        <StatCard
          icon={<Database className="h-4 w-4" />}
          label="Last Indexed"
          value={stats?.lastIndexedAt ? new Date(stats.lastIndexedAt).toLocaleDateString() : "Never"}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => reindexMut.mutate()} disabled={reindexMut.isPending}>
          <RefreshCw className={`h-3 w-3 mr-1 ${reindexMut.isPending ? "animate-spin" : ""}`} />
          {reindexMut.isPending ? "Re-indexing..." : "Re-index All"}
        </Button>
      </div>

      {/* Search */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium">Vector Search</h4>
        <div className="flex gap-2">
          <Input
            placeholder="Search knowledge base..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <Button size="sm" onClick={handleSearch}>
            <Search className="h-3 w-3 mr-1" />Search
          </Button>
        </div>
        {searchResults && (
          <div className="space-y-2 mt-2">
            {searchResults.length === 0 ? (
              <p className="text-sm text-muted-foreground">No results found.</p>
            ) : (
              searchResults.map((r, i) => (
                <div key={i} className="border rounded p-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-muted-foreground">{r.filePath}</span>
                    <Badge variant="outline" className="text-xs">Score: {r.score.toFixed(3)}</Badge>
                  </div>
                  <p className="text-sm line-clamp-3">{r.content}</p>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Document List */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium">Indexed Documents</h4>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : !docs || docs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No documents indexed. Run discovery on an application to populate the knowledge base.</p>
        ) : (
          docs.map((doc: KnowledgeDocument) => (
            <div key={doc.id} className="flex items-center justify-between border rounded p-2">
              <div className="min-w-0 flex-1">
                <span className="text-sm font-mono truncate block">{doc.filePath}</span>
                <span className="text-xs text-muted-foreground">{doc.chunkCount} chunks · {doc.type}</span>
              </div>
              <Button size="sm" variant="ghost" onClick={() => deleteMut.mutate(doc.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="border rounded-lg p-3 space-y-1">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
