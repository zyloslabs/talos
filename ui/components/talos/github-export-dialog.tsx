"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { exportToGitHub } from "@/lib/api";
import { GitBranch, ExternalLink, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface GitHubExportDialogProps {
  applicationId: string;
  currentExportRepo?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ExportState = "idle" | "loading" | "success" | "error";

// ── Component ──────────────────────────────────────────────────────────────────

export function GitHubExportDialog({
  applicationId,
  currentExportRepo,
  open,
  onOpenChange,
}: GitHubExportDialogProps) {
  const [targetRepo, setTargetRepo] = useState(currentExportRepo ?? "");
  const [branch, setBranch] = useState("main");
  const [createIfNotExists, setCreateIfNotExists] = useState(true);
  const [exportState, setExportState] = useState<ExportState>("idle");
  const [repoUrl, setRepoUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const exportMutation = useMutation({
    mutationFn: () =>
      exportToGitHub(applicationId, {
        targetRepo,
        branch,
        createIfNotExists,
      }),
    onMutate: () => {
      setExportState("loading");
      setErrorMessage(null);
    },
    onSuccess: (data) => {
      setExportState("success");
      setRepoUrl(data.repoUrl);
    },
    onError: (err: Error) => {
      setExportState("error");
      setErrorMessage(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetRepo.trim() || !targetRepo.includes("/")) return;
    exportMutation.mutate();
  };

  const handleClose = () => {
    // Reset to idle on close (but keep form values)
    setExportState("idle");
    setErrorMessage(null);
    onOpenChange(false);
  };

  const repoValid = targetRepo.trim().length > 0 && targetRepo.includes("/");

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Export to GitHub
          </DialogTitle>
          <DialogDescription>
            Push your generated Playwright test suite to a GitHub repository.
          </DialogDescription>
        </DialogHeader>

        {exportState === "success" && repoUrl ? (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 rounded-md bg-green-50 p-4 dark:bg-green-950">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
              <div>
                <p className="text-sm font-medium text-green-800 dark:text-green-300">
                  Tests exported successfully
                </p>
                <p className="text-xs text-green-700 dark:text-green-400">
                  {exportMutation.data?.filesUpdated ?? 0} file(s) pushed
                  {exportMutation.data?.created ? " — new repository created" : ""}
                </p>
              </div>
            </div>
            <a
              href={repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              View on GitHub
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <div className="flex justify-end">
              <Button onClick={handleClose}>Done</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            {exportState === "error" && errorMessage && (
              <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="text-sm">{errorMessage}</p>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="target-repo" className="text-sm font-medium">
                Target repository
              </label>
              <Input
                id="target-repo"
                placeholder="owner/repo"
                value={targetRepo}
                onChange={(e) => setTargetRepo(e.target.value)}
                disabled={exportState === "loading"}
                required
              />
              {targetRepo && !repoValid && (
                <p className="text-xs text-destructive">Must be in owner/repo format</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="branch" className="text-sm font-medium">
                Branch
              </label>
              <Input
                id="branch"
                placeholder="main"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                disabled={exportState === "loading"}
              />
            </div>

            <label className="flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                checked={createIfNotExists}
                onChange={(e) => setCreateIfNotExists(e.target.checked)}
                disabled={exportState === "loading"}
                className="h-4 w-4 rounded border-input"
              />
              <span className="text-sm">Create repository if it doesn&apos;t exist</span>
              <Badge variant="outline" className="ml-auto text-xs">
                Recommended
              </Badge>
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={handleClose} disabled={exportState === "loading"}>
                Cancel
              </Button>
              <Button type="submit" disabled={!repoValid || exportState === "loading"}>
                {exportState === "loading" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Exporting…
                  </>
                ) : (
                  <>
                    <GitBranch className="mr-2 h-4 w-4" />
                    Export
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
