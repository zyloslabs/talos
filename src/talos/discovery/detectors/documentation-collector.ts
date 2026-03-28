/**
 * Documentation Collector
 *
 * Identifies documentation files from the repository file tree:
 * README.md, docs/**\/*.md, OpenAPI specs, swagger files, CONTRIBUTING.md, etc.
 */

import type { DetectedDocument } from "../../types.js";

type FileTreeEntry = { path: string };

// ── Patterns ──────────────────────────────────────────────────────────────────

const README_PATTERN = /^(.*\/)?readme(\.\w+)?$/i;
const CONTRIBUTING_PATTERN = /^(.*\/)?contributing(\.\w+)?$/i;
const CHANGELOG_PATTERN = /^(.*\/)?changelog(\.\w+)?$/i;
const API_DOC_PATTERN = /^(.*\/)?api(\.\w+)?$/i;
const OPENAPI_PATTERN = /(?:\.(openapi|swagger)|(^|\/)openapi)\.(ya?ml|json)$/i;
const SWAGGER_FILE_PATTERN = /(?:^|\/)swagger\.(ya?ml|json)$/i;
const DOCS_DIR_PATTERN = /^docs?\//i;

// ── Public API ────────────────────────────────────────────────────────────────

export function detectDocumentation(fileTree: FileTreeEntry[]): DetectedDocument[] {
  const results: DetectedDocument[] = [];
  const seen = new Set<string>();

  for (const file of fileTree) {
    const lower = file.path.toLowerCase();
    const basename = file.path.split("/").pop() ?? "";

    // READMEs
    if (README_PATTERN.test(file.path)) {
      addResult(results, seen, {
        filePath: file.path,
        type: "readme",
        title: getDocTitle(basename),
      });
      continue;
    }

    // CONTRIBUTING
    if (CONTRIBUTING_PATTERN.test(file.path)) {
      addResult(results, seen, {
        filePath: file.path,
        type: "contributing",
      });
      continue;
    }

    // CHANGELOG
    if (CHANGELOG_PATTERN.test(file.path)) {
      addResult(results, seen, {
        filePath: file.path,
        type: "changelog",
      });
      continue;
    }

    // OpenAPI / Swagger specs
    if (OPENAPI_PATTERN.test(file.path) || SWAGGER_FILE_PATTERN.test(file.path)) {
      addResult(results, seen, {
        filePath: file.path,
        type: "api-spec",
      });
      continue;
    }

    // API.md
    if (API_DOC_PATTERN.test(basename) && /\.(md|mdx|rst|txt)$/i.test(basename)) {
      addResult(results, seen, {
        filePath: file.path,
        type: "api-spec",
      });
      continue;
    }

    // docs/ directory markdown files
    if (DOCS_DIR_PATTERN.test(file.path) && /\.(md|mdx|rst|txt)$/i.test(lower)) {
      addResult(results, seen, {
        filePath: file.path,
        type: "guide",
        title: getDocTitle(basename),
      });
      continue;
    }
  }

  return results;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function addResult(results: DetectedDocument[], seen: Set<string>, item: DetectedDocument): void {
  if (seen.has(item.filePath)) return;
  seen.add(item.filePath);
  results.push(item);
}

function getDocTitle(basename: string): string {
  // Strip extension and convert to title case
  const name = basename.replace(/\.\w+$/, "");
  return name.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
