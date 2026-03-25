/**
 * M365 Integration Module — Barrel Exports
 */

export { BrowserAuth, type BrowserAuthOptions } from "./browser-auth.js";
export { CopilotScraper } from "./scraper.js";
export { EphemeralStore } from "./ephemeral.js";
export { parseFile, parseDocx, parsePdf, parseXlsx, parsePptx, htmlToMarkdown, expandMergedCells, rowsToMarkdownTable } from "./file-parser.js";
export { SELECTORS, type SelectorsConfig } from "./selectors.js";
export { ScrapeError, ParseError, AuthError, type FileType, type SearchResult, type RetryOptions } from "./types.js";
