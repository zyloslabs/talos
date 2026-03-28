/**
 * FileParser — Routes by extension, uses mammoth (DOCX), pdf-parse (PDF),
 * ExcelJS (XLSX), officeparser (PPTX).
 * Adapted from copilot365-int for Talos M365 integration.
 */

import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import ExcelJS from "exceljs";
import officeParser from "officeparser";
import { ParseError, type FileType } from "./types.js";

export interface MergeRange {
  s: { r: number; c: number };
  e: { r: number; c: number };
}

export async function parseFile(buffer: Buffer, type: FileType): Promise<string> {
  switch (type) {
    case "docx":
      return parseDocx(buffer);
    case "pdf":
      return parsePdf(buffer);
    case "xlsx":
      return parseXlsx(buffer);
    case "pptx":
      return parsePptx(buffer);
    default:
      throw new ParseError(`Unsupported file type: ${type as string}`, type);
  }
}

export async function parseDocx(buffer: Buffer): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await mammoth.convertToHtml({ buffer: buffer as any });
    return htmlToMarkdown(result.value);
  } catch (err) {
    throw new ParseError(`Failed to parse DOCX: ${err instanceof Error ? err.message : String(err)}`, "docx");
  }
}

export async function parsePdf(buffer: Buffer): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await pdfParse(buffer as any);
    return cleanPdfText(data.text);
  } catch (err) {
    throw new ParseError(`Failed to parse PDF: ${err instanceof Error ? err.message : String(err)}`, "pdf");
  }
}

export async function parseXlsx(buffer: Buffer): Promise<string> {
  try {
    const workbook = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(buffer as any);
    const sheets: string[] = [];

    for (const worksheet of workbook.worksheets) {
      const rows: string[][] = [];
      const merges: MergeRange[] = [];

      for (const mergeRef of Object.keys((worksheet.model as unknown as Record<string, unknown>).merges ?? {})) {
        const range = parseMergeRef(mergeRef);
        if (range) merges.push(range);
      }

      worksheet.eachRow({ includeEmpty: false }, (row) => {
        const cells: string[] = [];
        for (let col = 1; col <= worksheet.columnCount; col++) {
          const cell = row.getCell(col);
          cells.push(String(cell.value ?? ""));
        }
        rows.push(cells);
      });

      if (rows.length === 0) continue;

      const expandedRows = expandMergedCells(rows, merges);
      const mdTable = rowsToMarkdownTable(expandedRows);
      if (mdTable) {
        sheets.push(`## ${worksheet.name}\n\n${mdTable}`);
      }
    }

    if (sheets.length === 0) {
      return "*Empty spreadsheet*";
    }
    return sheets.join("\n\n");
  } catch (err) {
    if (err instanceof ParseError) throw err;
    throw new ParseError(`Failed to parse XLSX: ${err instanceof Error ? err.message : String(err)}`, "xlsx");
  }
}

export function parseMergeRef(ref: string): MergeRange | null {
  const match = ref.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
  if (!match) return null;
  return {
    s: { r: parseInt(match[2], 10) - 1, c: colLetterToIndex(match[1]) },
    e: { r: parseInt(match[4], 10) - 1, c: colLetterToIndex(match[3]) },
  };
}

function colLetterToIndex(letters: string): number {
  let index = 0;
  for (let i = 0; i < letters.length; i++) {
    index = index * 26 + (letters.charCodeAt(i) - 64);
  }
  return index - 1;
}

export async function parsePptx(buffer: Buffer): Promise<string> {
  try {
    const ast = await officeParser.parseOffice(buffer);
    const sections: string[] = [];

    for (const node of ast.content) {
      if (node.type === "heading") {
        const level = (node.metadata as { level?: number } | undefined)?.level ?? 2;
        const prefix = "#".repeat(Math.min(level + 1, 6));
        sections.push(`${prefix} ${node.text ?? ""}`);
      } else if (node.type === "list") {
        sections.push(`- ${node.text ?? ""}`);
      } else if (node.type === "table") {
        const rows = (node.children ?? [])
          .filter((r) => r.type === "row")
          .map((row) =>
            (row.children ?? [])
              .filter((c) => c.type === "cell")
              .map((c) => (c.text ?? "").replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\n/g, " "))
          );
        if (rows.length > 0) {
          const mdTable = rowsToMarkdownTable(rows);
          if (mdTable) sections.push(mdTable);
        }
      } else if (node.text?.trim()) {
        sections.push(node.text.trim());
      }
    }

    if (sections.length === 0) {
      return "*Empty presentation*";
    }
    return sections.join("\n\n");
  } catch (err) {
    throw new ParseError(`Failed to parse PPTX: ${err instanceof Error ? err.message : String(err)}`, "pptx");
  }
}

export function expandMergedCells(rows: string[][], merges: MergeRange[]): string[][] {
  const result = rows.map((row) => [...row]);

  for (const merge of merges) {
    const { s, e } = merge;
    const value = result[s.r]?.[s.c] ?? "";
    for (let r = s.r; r <= e.r; r++) {
      for (let c = s.c; c <= e.c; c++) {
        if (!result[r]) result[r] = [];
        result[r][c] = String(value);
      }
    }
  }
  return result;
}

export function rowsToMarkdownTable(rows: string[][]): string {
  if (rows.length === 0) return "";

  const maxCols = Math.max(...rows.map((r) => r.length));
  const normalized = rows.map((row) => {
    const padded = [...row];
    while (padded.length < maxCols) padded.push("");
    return padded.map((cell) =>
      String(cell ?? "")
        .replace(/\\/g, "\\\\")
        .replace(/\|/g, "\\|")
        .replace(/\n/g, " ")
    );
  });

  if (normalized.length === 0) return "";

  const header = normalized[0];
  const separator = header.map(() => "---");
  const body = normalized.slice(1);

  const lines = [
    `| ${header.join(" | ")} |`,
    `| ${separator.join(" | ")} |`,
    ...body.map((row) => `| ${row.join(" | ")} |`),
  ];

  return lines.join("\n");
}

export function htmlToMarkdown(html: string): string {
  let md = html;

  for (let i = 6; i >= 1; i--) {
    const hashes = "#".repeat(i);
    md = md.replace(new RegExp(`<h${i}[^>]*>(.*?)</h${i}>`, "gi"), `\n${hashes} $1\n`);
  }

  md = md.replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**");
  md = md.replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**");
  md = md.replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*");
  md = md.replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*");
  md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)");
  md = md.replace(/<ul[^>]*>/gi, "\n");
  md = md.replace(/<\/ul>/gi, "\n");
  md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n");
  md = md.replace(/<ol[^>]*>/gi, "\n");
  md = md.replace(/<\/ol>/gi, "\n");
  md = convertHtmlTables(md);
  md = md.replace(/<p[^>]*>(.*?)<\/p>/gi, "\n$1\n");
  md = md.replace(/<br\s*\/?>/gi, "\n");

  // SECURITY: Strip ALL remaining HTML tags FIRST, before decoding entities.
  // This prevents entity-encoded tags (e.g., &lt;script&gt;) from becoming
  // live HTML after decoding. Multiple passes handle nested/reconstructed tags.
  let prev = "";
  while (prev !== md) {
    prev = md;
    md = md.replace(/<[^>]+>/g, "");
  }

  // Decode HTML entities. Angle-bracket entities (&lt; &gt;) are left
  // encoded to prevent HTML element injection in downstream contexts.
  // Order matters: decode &amp; LAST since other entities contain '&'.
  md = md.replace(/&#39;/g, "'");
  md = md.replace(/&quot;/g, '"');
  md = md.replace(/&amp;/g, "&");

  // Escape any backslashes that could be interpreted in downstream contexts
  md = md.replace(/\\/g, "\\\\");

  md = md.replace(/\n{3,}/g, "\n\n");

  return md.trim();
}

function convertHtmlTables(html: string): string {
  return html.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_match, tableContent: string) => {
    const rows: string[][] = [];
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    while ((rowMatch = rowRegex.exec(tableContent)) !== null) {
      const cells: string[] = [];
      const cellRegex = /<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;
      let cellMatch;
      while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
        let cellText = cellMatch[1];
        let prevCell = "";
        while (prevCell !== cellText) {
          prevCell = cellText;
          cellText = cellText.replace(/<[^>]+>/g, "");
        }
        cells.push(cellText.trim());
      }
      if (cells.length > 0) rows.push(cells);
    }
    return rows.length > 0 ? "\n" + rowsToMarkdownTable(rows) + "\n" : "";
  });
}

export function cleanPdfText(text: string): string {
  let cleaned = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  cleaned = cleaned.replace(/^([A-Z][A-Z\s]{2,})$/gm, (match) => {
    const trimmed = match.trim();
    if (trimmed.length > 3 && trimmed.length < 100) {
      return `\n## ${trimmed}\n`;
    }
    return match;
  });
  cleaned = cleaned.replace(/[ \t]+/g, " ");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  return cleaned.trim();
}
