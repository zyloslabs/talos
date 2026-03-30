/**
 * App Intelligence Scanner — Orchestrator
 *
 * Coordinates the four detectors (tech stack, databases, test users, documentation)
 * against a repository's file tree and content fetcher.
 */

import { randomUUID } from "node:crypto";
import type { AppIntelligenceReport } from "../types.js";
import type { GitHubTree } from "./github-api-client.js";
import { detectTechStack } from "./detectors/tech-stack-detector.js";
import { detectDatabases } from "./detectors/database-scanner.js";
import { detectTestUsers } from "./detectors/test-user-scanner.js";
import { detectDocumentation } from "./detectors/documentation-collector.js";

// ── Config file names the scanner cares about ─────────────────────────────────

const SCANNABLE_FILES = new Set([
  "package.json",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "requirements.txt",
  "Pipfile",
  "pyproject.toml",
  "go.mod",
  "Cargo.toml",
  "Gemfile",
  "composer.json",
  "docker-compose.yml",
  "docker-compose.yaml",
  "schema.prisma",
  "ormconfig.ts",
  "ormconfig.js",
  "ormconfig.json",
  "knexfile.ts",
  "knexfile.js",
  "drizzle.config.ts",
  "drizzle.config.js",
  "settings.py",
  "application.properties",
  "application.yml",
  "application.yaml",
  "database.yml",
  "playwright.config.ts",
  "playwright.config.js",
  "cypress.config.ts",
  "cypress.config.js",
  "cypress.json",
]);

function isScannableFile(path: string): boolean {
  const basename = path.split("/").pop() ?? "";
  if (SCANNABLE_FILES.has(basename)) return true;
  // .env* files
  if (basename.startsWith(".env")) return true;
  return false;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type AppIntelligenceScannerOptions = {
  applicationId: string;
  clock?: () => Date;
};

export type ContentFetcher = (path: string) => Promise<string>;

// ── Scanner ───────────────────────────────────────────────────────────────────

export class AppIntelligenceScanner {
  private applicationId: string;
  private clock: () => Date;

  constructor(options: AppIntelligenceScannerOptions) {
    this.applicationId = options.applicationId;
    this.clock = options.clock ?? (() => new Date());
  }

  /**
   * Run all detectors against the given file tree.
   *
   * @param tree - The GitHub repository tree (from `getTree()`)
   * @param fetchContent - Function to fetch file content by path
   */
  async scan(tree: GitHubTree, fetchContent: ContentFetcher): Promise<AppIntelligenceReport> {
    const allFiles = tree.tree.filter((f) => f.type === "file");

    // 1. Identify files we need to fetch content for
    const filesToFetch = allFiles.filter((f) => isScannableFile(f.path));

    // 2. Fetch content for scannable files (with error tolerance)
    const fileEntries: { path: string; content: string }[] = [];
    for (const file of filesToFetch) {
      try {
        const content = await fetchContent(file.path);
        fileEntries.push({ path: file.path, content });
      } catch {
        // Skip files we can't fetch
      }
    }

    // 3. Run detectors
    const { techStack, configFiles } = detectTechStack(fileEntries);
    const databases = detectDatabases(fileEntries);
    const testUsers = detectTestUsers(fileEntries);
    const documentation = detectDocumentation(allFiles);

    return {
      id: randomUUID(),
      applicationId: this.applicationId,
      techStack,
      databases,
      testUsers,
      documentation,
      configFiles,
      scannedAt: this.clock(),
    };
  }
}
