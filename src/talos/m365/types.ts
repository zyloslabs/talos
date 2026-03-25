/**
 * M365 Integration Types
 *
 * Adapted from copilot365-int for Talos M365 Copilot integration.
 */

export type FileType = "docx" | "pdf" | "xlsx" | "pptx";

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
  fileType?: FileType | "unknown";
}

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  onRetry?: (attempt: number, error: Error) => void;
}

export class ScrapeError extends Error {
  constructor(
    message: string,
    public readonly selector: string,
    public readonly step: string,
  ) {
    super(message);
    this.name = "ScrapeError";
  }
}

export class ParseError extends Error {
  constructor(
    message: string,
    public readonly fileType: FileType,
  ) {
    super(message);
    this.name = "ParseError";
  }
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}
