/**
 * Export Engine
 *
 * Exports tests and packages in various formats.
 */

import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import archiver from "archiver";
import type { TalosApplication, TestExport } from "../types.js";
import type { TalosRepository } from "../repository.js";
import type { ExportConfig } from "../config.js";
import { PackageBuilder, type PackageContents, type BuildOptions } from "./package-builder.js";
import { CredentialSanitizer } from "./credential-sanitizer.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ExportEngineOptions = {
  config: ExportConfig;
  repository: TalosRepository;
};

export type ExportFormat = "zip" | "directory" | "single-file" | "json";

export type ExportOptions = {
  format: ExportFormat;
  outputPath?: string;
  includeConfig?: boolean;
  includeReports?: boolean;
  tests?: string[]; // Specific test IDs to export
  sanitize?: boolean;
} & BuildOptions;

export type ExportResult = {
  success: boolean;
  export?: TestExport;
  outputPath?: string;
  files?: string[];
  size?: number;
  error?: string;
};

// ── Export Engine ─────────────────────────────────────────────────────────────

export class ExportEngine {
  private config: ExportConfig;
  private repository: TalosRepository;
  private packageBuilder: PackageBuilder;
  private sanitizer: CredentialSanitizer;

  constructor(options: ExportEngineOptions) {
    this.config = options.config;
    this.repository = options.repository;
    this.packageBuilder = new PackageBuilder({
      config: options.config,
      repository: options.repository,
    });
    this.sanitizer = new CredentialSanitizer();
  }

  /**
   * Export tests for an application.
   */
  async export(applicationId: string, options: ExportOptions): Promise<ExportResult> {
    const app = this.repository.getApplication(applicationId);
    if (!app) {
      return { success: false, error: `Application not found: ${applicationId}` };
    }

    try {
      switch (options.format) {
        case "zip":
          return this.exportAsZip(app, options);
        case "directory":
          return this.exportAsDirectory(app, options);
        case "single-file":
          return this.exportAsSingleFile(app, options);
        case "json":
          return this.exportAsJson(app, options);
        default:
          return { success: false, error: `Unsupported format: ${options.format}` };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Export as a ZIP archive.
   */
  private async exportAsZip(app: TalosApplication, options: ExportOptions): Promise<ExportResult> {
    const package_ = this.packageBuilder.build(app.id, {
      ...options,
      sanitizeCredentials: options.sanitize !== false,
    });

    // Get output path
    const basePath = this.config.outputDir.replace("~", process.env.HOME ?? "");
    const fileName = `${this.slugify(app.name)}-${Date.now()}.zip`;
    const outputPath = options.outputPath ?? path.join(basePath, fileName);

    // Ensure directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    // Create real ZIP archive using archiver (#525)
    const size = await this.writeZipArchive(outputPath, package_);

    const exportRecord = this.createExportRecord(app.id, "zip", package_, outputPath);

    return {
      success: true,
      export: exportRecord,
      outputPath,
      files: package_.files.map((f) => f.path),
      size,
    };
  }

  /**
   * Export as a directory with all files.
   */
  private async exportAsDirectory(app: TalosApplication, options: ExportOptions): Promise<ExportResult> {
    const package_ = this.packageBuilder.build(app.id, {
      ...options,
      sanitizeCredentials: options.sanitize !== false,
    });

    // Get output path
    const basePath = this.config.outputDir.replace("~", process.env.HOME ?? "");
    const dirName = `${this.slugify(app.name)}-${Date.now()}`;
    const outputPath = options.outputPath ?? path.join(basePath, dirName);

    // Create directory structure
    await fs.mkdir(outputPath, { recursive: true });

    // Write all files
    for (const file of package_.files) {
      const filePath = path.join(outputPath, file.path);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, file.content);
    }

    const exportRecord = this.createExportRecord(app.id, "directory", package_, outputPath);

    return {
      success: true,
      export: exportRecord,
      outputPath,
      files: package_.files.map((f) => path.join(outputPath, f.path)),
      size: package_.totalSize,
    };
  }

  /**
   * Export as a single file with all tests concatenated.
   */
  private async exportAsSingleFile(app: TalosApplication, options: ExportOptions): Promise<ExportResult> {
    let tests = this.repository.getTestsByApplication(app.id);

    // Filter to specific tests if requested
    if (options.tests?.length) {
      tests = tests.filter((t) => options.tests!.includes(t.id));
    }

    // Build single file content
    const lines: string[] = [
      `// ${app.name} - E2E Tests`,
      `// Exported from Talos on ${new Date().toISOString()}`,
      "",
      "import { test, expect, Page } from '@playwright/test';",
      "",
    ];

    for (const testItem of tests) {
      let code = testItem.code;

      // Sanitize if requested
      if (options.sanitize !== false) {
        const result = this.sanitizer.sanitize(code);
        code = result.sanitizedCode;
      }

      // Wrap if needed
      if (!code.includes("test(") && !code.includes("test.describe(")) {
        code = `test('${testItem.name}', async ({ page }) => {\n${code}\n});`;
      }

      lines.push(`// ${testItem.name}`, code, "");
    }

    const content = lines.join("\n");

    // Get output path
    const basePath = this.config.outputDir.replace("~", process.env.HOME ?? "");
    const fileName = `${this.slugify(app.name)}-tests.spec.ts`;
    const outputPath = options.outputPath ?? path.join(basePath, fileName);

    // Ensure directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    // Write file
    await fs.writeFile(outputPath, content);

    return {
      success: true,
      outputPath,
      files: [outputPath],
      size: content.length,
    };
  }

  /**
   * Export as JSON for API consumption.
   */
  private async exportAsJson(app: TalosApplication, options: ExportOptions): Promise<ExportResult> {
    let tests = this.repository.getTestsByApplication(app.id);

    // Filter to specific tests if requested
    if (options.tests?.length) {
      tests = tests.filter((t) => options.tests!.includes(t.id));
    }

    const exportData = {
      application: {
        id: app.id,
        name: app.name,
        repoUrl: app.repositoryUrl,
        baseUrl: app.baseUrl,
      },
      tests: tests.map((t) => {
        let code = t.code;

        if (options.sanitize !== false) {
          const result = this.sanitizer.sanitize(code);
          code = result.sanitizedCode;
        }

        return {
          id: t.id,
          name: t.name,
          type: t.type,
          tags: t.tags,
          code,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        };
      }),
      exportedAt: new Date().toISOString(),
      format: "talos-export-v1",
    };

    const content = JSON.stringify(exportData, null, 2);

    // Get output path
    const basePath = this.config.outputDir.replace("~", process.env.HOME ?? "");
    const fileName = `${this.slugify(app.name)}-export.json`;
    const outputPath = options.outputPath ?? path.join(basePath, fileName);

    // Ensure directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    // Write file
    await fs.writeFile(outputPath, content);

    return {
      success: true,
      outputPath,
      files: [outputPath],
      size: content.length,
    };
  }

  /**
   * Import tests from a JSON export.
   */
  async import(
    applicationId: string,
    jsonPath: string
  ): Promise<{
    success: boolean;
    imported: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let imported = 0;

    try {
      const content = await fs.readFile(jsonPath, "utf-8");
      const data = JSON.parse(content);

      if (data.format !== "talos-export-v1") {
        return { success: false, imported: 0, errors: ["Unsupported export format"] };
      }

      for (const testData of data.tests) {
        try {
          this.repository.createTest({
            applicationId,
            name: testData.name,
            code: testData.code,
            type: testData.type ?? "e2e",
            tags: testData.tags,
            metadata: {
              importedFrom: jsonPath,
              importedAt: new Date().toISOString(),
              originalId: testData.id,
            },
          });
          imported++;
        } catch (error) {
          errors.push(`Failed to import "${testData.name}": ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      return { success: errors.length === 0, imported, errors };
    } catch (error) {
      return {
        success: false,
        imported: 0,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * Write a ZIP archive to disk using archiver streams.
   * Returns the final compressed file size in bytes.
   */
  private writeZipArchive(outputPath: string, package_: PackageContents): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const output = createWriteStream(outputPath);
      const archive = archiver("zip", { zlib: { level: 9 } });

      let settled = false;
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        fn();
      };

      output.on("close", () => settle(() => resolve(archive.pointer())));
      output.on("error", (err) => settle(() => reject(err)));
      archive.on("warning", (err) => {
        // ENOENT is non-fatal per archiver docs; surface anything else.
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
          settle(() => reject(err));
        }
      });
      archive.on("error", (err) => settle(() => reject(err)));

      archive.pipe(output);

      for (const file of package_.files) {
        // Normalize POSIX-style paths inside the archive for cross-platform unzip
        const entryName = file.path.split(path.sep).join("/");
        archive.append(file.content, { name: entryName });
      }

      void archive.finalize();
    });
  }

  /**
   * Create an export record.
   */
  private createExportRecord(
    applicationId: string,
    format: ExportFormat,
    package_: PackageContents,
    outputPath: string
  ): TestExport {
    return {
      id: `export-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      applicationId,
      format,
      testCount: package_.testCount,
      createdAt: new Date(),
      outputPath,
      sizeBytes: package_.totalSize,
    };
  }

  /**
   * List previous exports.
   */
  async listExports(): Promise<
    Array<{
      path: string;
      name: string;
      size: number;
      createdAt: Date;
    }>
  > {
    const basePath = this.config.outputDir.replace("~", process.env.HOME ?? "");

    try {
      await fs.mkdir(basePath, { recursive: true });
      const entries = await fs.readdir(basePath, { withFileTypes: true });
      const exports: Array<{
        path: string;
        name: string;
        size: number;
        createdAt: Date;
      }> = [];

      for (const entry of entries) {
        const fullPath = path.join(basePath, entry.name);
        const stats = await fs.stat(fullPath);

        exports.push({
          path: fullPath,
          name: entry.name,
          size: entry.isDirectory() ? 0 : stats.size,
          createdAt: stats.mtime,
        });
      }

      return exports.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    } catch {
      return [];
    }
  }

  /**
   * Delete an export.
   */
  async deleteExport(outputPath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(outputPath);

      if (stats.isDirectory()) {
        await fs.rm(outputPath, { recursive: true });
      } else {
        await fs.unlink(outputPath);
      }

      return true;
    } catch {
      return false;
    }
  }

  private slugify(str: string): string {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }
}
