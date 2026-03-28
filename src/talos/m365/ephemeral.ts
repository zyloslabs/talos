/**
 * EphemeralStore — Path-traversal-safe file storage for M365 documents.
 * Adapted from copilot365-int for Talos M365 integration.
 */

import { mkdir, writeFile, readdir, readFile, rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

export class EphemeralStore {
  private readonly docsDir: string;

  constructor(docsDir = "./docs") {
    this.docsDir = resolve(docsDir);
  }

  getDocsDir(): string {
    return this.docsDir;
  }

  async initialize(): Promise<void> {
    await mkdir(this.docsDir, { recursive: true });
  }

  sanitizeFilename(name: string): string {
    let sanitized = name
      .replace(/\.\./g, "")
      .replace(/[\/\\]/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/^\.+/, "");

    sanitized = sanitized.trim();
    if (!sanitized) {
      throw new Error("Empty filename after sanitization");
    }
    return sanitized;
  }

  async saveMd(filename: string, content: string): Promise<string> {
    const safe = this.sanitizeFilename(filename);
    const ext = safe.endsWith(".md") ? "" : ".md";
    const filePath = join(this.docsDir, `${safe}${ext}`);

    const resolved = resolve(filePath);
    if (!resolved.startsWith(this.docsDir)) {
      throw new Error("Path traversal detected");
    }

    await this.initialize();
    await writeFile(resolved, content, "utf-8");
    return resolved;
  }

  async listFiles(): Promise<string[]> {
    try {
      return await readdir(this.docsDir);
    } catch {
      return [];
    }
  }

  async readFile(filename: string): Promise<string> {
    const safe = this.sanitizeFilename(filename);
    const filePath = join(this.docsDir, safe);

    const resolved = resolve(filePath);
    if (!resolved.startsWith(this.docsDir)) {
      throw new Error("Path traversal detected");
    }

    return readFile(resolved, "utf-8");
  }

  async listFilesWithAge(): Promise<{ name: string; ageMs: number }[]> {
    try {
      const names = await readdir(this.docsDir);
      const now = Date.now();
      return await Promise.all(
        names.map(async (name) => {
          try {
            const s = await stat(join(this.docsDir, name));
            return { name, ageMs: Math.max(0, now - s.mtimeMs) };
          } catch {
            return { name, ageMs: 0 };
          }
        })
      );
    } catch {
      return [];
    }
  }

  async cleanupOlderThan(ageMs: number): Promise<number> {
    const files = await this.listFilesWithAge();
    const toDelete = files.filter((f) => f.ageMs >= ageMs);
    await Promise.all(toDelete.map((f) => rm(join(this.docsDir, f.name), { force: true })));
    return toDelete.length;
  }

  async cleanup(): Promise<void> {
    try {
      await rm(this.docsDir, { recursive: true, force: true });
    } catch {
      // Directory may not exist
    }
    await mkdir(this.docsDir, { recursive: true });
  }

  async destroy(): Promise<void> {
    try {
      await rm(this.docsDir, { recursive: true, force: true });
    } catch {
      // Directory may not exist
    }
  }
}
