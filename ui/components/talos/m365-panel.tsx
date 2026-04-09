"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  m365Search,
  m365Fetch,
  m365Status,
  ingestDocument,
  getKnowledgeDocuments,
  type M365SearchResult,
  type KnowledgeDocument,
} from "@/lib/api";
import { Search, Loader2, FileText, Check, Download, Cloud } from "lucide-react";
import { cn } from "@/lib/utils";

// ── M365 Document Search & Import Panel (#475) ───────────────────────────────

export function M365Panel({ appId }: { appId: string }) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<M365SearchResult[] | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const [importedUrls, setImportedUrls] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const { data: sessionStatus } = useQuery({
    queryKey: ["m365-status"],
    queryFn: m365Status,
    retry: false,
  });

  const { data: existingDocs } = useQuery({
    queryKey: ["knowledge-docs"],
    queryFn: getKnowledgeDocuments,
  });

  const existingPaths = new Set(
    existingDocs?.map((d: KnowledgeDocument) => d.filePath) ?? []
  );

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const res = await m365Search(query);
      setResults(res.results);
    } catch (err) {
      setResults([]);
      setError(`Search failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSearching(false);
    }
  };

  const handleImport = async (result: M365SearchResult) => {
    setImporting(result.url);
    try {
      const fetched = await m365Fetch(result.url, result.fileType ?? "document");
      if (fetched.content && appId) {
        await ingestDocument(appId, {
          content: fetched.content,
          format: "markdown",
          fileName: result.title || "m365-document",
          docType: "functional_spec",
          tags: ["m365", "imported"],
        });
        setImportedUrls((prev) => new Set(prev).add(result.url));
      }
    } catch (err) {
      setError(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setImporting(null);
    }
  };

  const isDisabled = sessionStatus?.status !== "active";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cloud className="h-5 w-5 text-blue-500" />
          <h3 className="text-lg font-semibold">Microsoft 365 Documents</h3>
        </div>
        <Badge variant={isDisabled ? "outline" : "default"}>
          {isDisabled ? "Not Connected" : "Connected"}
        </Badge>
      </div>

      {isDisabled && (
        <p className="text-sm text-muted-foreground">
          M365 integration is not active. Enable it in the environment settings (M365_ENABLED=true) and complete browser authentication.
        </p>
      )}

      <div className="flex gap-2">
        <Input
          placeholder="Search SharePoint, OneDrive, Teams..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          disabled={isDisabled}
        />
        <Button size="sm" onClick={handleSearch} disabled={isDisabled || searching}>
          {searching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <><Search className="h-4 w-4 mr-1" /> Search</>
          )}
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {results && (
        <div className="space-y-2">
          {results.length === 0 ? (
            <p className="text-sm text-muted-foreground">No documents found.</p>
          ) : (
            results.map((r, i) => {
              const alreadyIngested = existingPaths.has(r.title) || importedUrls.has(r.url);
              return (
                <Card key={i}>
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="text-sm font-medium truncate">{r.title}</span>
                          {r.fileType && <Badge variant="outline" className="text-xs">{r.fileType}</Badge>}
                          {alreadyIngested && <Badge variant="secondary" className="text-xs">Ingested</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">{r.snippet}</p>
                      </div>
                      <Button
                        size="sm"
                        variant={alreadyIngested ? "outline" : "default"}
                        onClick={() => handleImport(r)}
                        disabled={importing === r.url}
                      >
                        {importing === r.url ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : alreadyIngested ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <><Download className="h-3 w-3 mr-1" /> Import</>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
