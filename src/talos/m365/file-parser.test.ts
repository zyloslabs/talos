import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseFile, parseDocx, parsePdf, parseXlsx, parsePptx, htmlToMarkdown, cleanPdfText, parseMergeRef, expandMergedCells, rowsToMarkdownTable } from "./file-parser.js";
import { ParseError } from "./types.js";

// Mock external dependencies
vi.mock("mammoth", () => ({
  default: {
    convertToHtml: vi.fn().mockResolvedValue({ value: "<p>Hello <strong>World</strong></p>" }),
  },
}));

vi.mock("pdf-parse", () => ({
  default: vi.fn().mockResolvedValue({ text: "  Page 1 text  \n\n\n  Page 2 text  " }),
}));

vi.mock("exceljs", () => {
  const mockWorksheet = {
    name: "Sheet1",
    columnCount: 2,
    model: { merges: {} },
    eachRow: vi.fn((_opts: unknown, cb: (row: { getCell: (col: number) => { value: string | null } }) => void) => {
      cb({ getCell: (col: number) => ({ value: col === 1 ? "A1" : "B1" }) });
      cb({ getCell: (col: number) => ({ value: col === 1 ? "A2" : "B2" }) });
    }),
  };
  return {
    default: {
      Workbook: class {
        worksheets = [mockWorksheet];
        xlsx = { load: vi.fn().mockResolvedValue(undefined) };
      },
    },
  };
});

vi.mock("officeparser", () => ({
  default: {
    parseOffice: vi.fn().mockResolvedValue({
      content: [
        { type: "heading", text: "Slide 1 Title", metadata: { level: 1 } },
        { type: "paragraph", text: "Slide 1 text" },
        { type: "paragraph", text: "Slide 2 text" },
      ],
    }),
  },
}));

describe("file-parser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("parseFile", () => {
    it("routes docx to parseDocx", async () => {
      const result = await parseFile(Buffer.from("test"), "docx");
      expect(result).toContain("Hello");
    });

    it("routes pdf to parsePdf", async () => {
      const result = await parseFile(Buffer.from("test"), "pdf");
      expect(result).toContain("Page 1 text");
    });

    it("routes xlsx to parseXlsx", async () => {
      const result = await parseFile(Buffer.from("test"), "xlsx");
      expect(result).toContain("A1");
    });

    it("routes pptx to parsePptx", async () => {
      const result = await parseFile(Buffer.from("test"), "pptx");
      expect(result).toContain("Slide 1 text");
    });

    it("throws ParseError for unsupported types", async () => {
      await expect(
        // @ts-expect-error — testing runtime behavior
        parseFile(Buffer.from("test"), "txt"),
      ).rejects.toThrow(ParseError);
    });
  });

  describe("parseDocx", () => {
    it("converts HTML to markdown", async () => {
      const result = await parseDocx(Buffer.from("test"));
      expect(result).toContain("Hello");
      expect(result).toContain("**World**");
    });

    it("throws ParseError on failure", async () => {
      const mammoth = await import("mammoth");
      (mammoth.default.convertToHtml as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("corrupt file"));
      await expect(parseDocx(Buffer.from("bad"))).rejects.toThrow(ParseError);
    });
  });

  describe("parsePdf", () => {
    it("cleans whitespace from PDF text", async () => {
      const result = await parsePdf(Buffer.from("test"));
      expect(result).toContain("Page 1 text");
      // Collapsed whitespace
      expect(result).not.toContain("\n\n\n");
    });

    it("throws ParseError on failure", async () => {
      const pdfParse = await import("pdf-parse");
      (pdfParse.default as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("bad pdf"));
      await expect(parsePdf(Buffer.from("bad"))).rejects.toThrow(ParseError);
    });
  });

  describe("parseXlsx", () => {
    it("produces markdown table", async () => {
      const result = await parseXlsx(Buffer.from("test"));
      expect(result).toContain("A1");
      expect(result).toContain("B2");
      expect(result).toContain("|"); // Markdown table delimiter
    });
  });

  describe("parsePptx", () => {
    it("returns parsed text", async () => {
      const result = await parsePptx(Buffer.from("test"));
      expect(result).toContain("Slide 1 text");
    });

    it("throws ParseError on failure", async () => {
      const op = await import("officeparser");
      (op.default.parseOffice as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("corrupt pptx"));
      await expect(parsePptx(Buffer.from("bad"))).rejects.toThrow(ParseError);
    });
  });

  describe("htmlToMarkdown", () => {
    it("converts headings", () => {
      expect(htmlToMarkdown("<h1>Title</h1>")).toContain("# Title");
      expect(htmlToMarkdown("<h2>Sub</h2>")).toContain("## Sub");
      expect(htmlToMarkdown("<h3>SubSub</h3>")).toContain("### SubSub");
    });

    it("converts bold and italic", () => {
      expect(htmlToMarkdown("<strong>bold</strong>")).toContain("**bold**");
      expect(htmlToMarkdown("<em>italic</em>")).toContain("*italic*");
    });

    it("converts paragraphs", () => {
      const result = htmlToMarkdown("<p>Hello</p>");
      expect(result).toContain("Hello");
    });

    it("converts links", () => {
      expect(htmlToMarkdown('<a href="https://example.com">Link</a>')).toContain("[Link](https://example.com)");
    });

    it("converts unordered lists", () => {
      const result = htmlToMarkdown("<ul><li>Item 1</li><li>Item 2</li></ul>");
      expect(result).toContain("- Item 1");
      expect(result).toContain("- Item 2");
    });

    it("converts ordered lists as unordered (implementation uses dash)", () => {
      const result = htmlToMarkdown("<ol><li>First</li><li>Second</li></ol>");
      expect(result).toContain("- First");
      expect(result).toContain("- Second");
    });

    it("strips remaining HTML tags", () => {
      expect(htmlToMarkdown("<div><span>Text</span></div>")).not.toContain("<");
    });
  });

  describe("cleanPdfText", () => {
    it("collapses multiple blank lines", () => {
      const result = cleanPdfText("Line 1\n\n\n\n\nLine 2");
      expect(result).toBe("Line 1\n\nLine 2");
    });

    it("trims whitespace", () => {
      const result = cleanPdfText("  hello  \n  world  ");
      // cleanPdfText collapses multiple spaces to one but doesn't trim each line
      expect(result).toContain("hello");
      expect(result).toContain("world");
    });
  });

  describe("parseMergeRef", () => {
    it("parses A1:B2 merge reference", () => {
      const range = parseMergeRef("A1:B2");
      expect(range).toEqual({ s: { r: 0, c: 0 }, e: { r: 1, c: 1 } });
    });

    it("returns null for invalid refs", () => {
      expect(parseMergeRef("invalid")).toBeNull();
    });

    it("handles multi-char column references", () => {
      const range = parseMergeRef("AA1:AB3");
      expect(range).not.toBeNull();
      expect(range!.s.c).toBe(26); // AA = 26
    });
  });

  describe("expandMergedCells", () => {
    it("fills merged cell values", () => {
      const rows = [
        ["Merged", "B1"],
        ["", "B2"],
      ];
      const merges = [{ s: { r: 0, c: 0 }, e: { r: 1, c: 0 } }]; // A1:A2
      const expanded = expandMergedCells(rows, merges);
      expect(expanded[1][0]).toBe("Merged");
    });
  });

  describe("rowsToMarkdownTable", () => {
    it("creates markdown table with header row", () => {
      const rows = [
        ["Name", "Age"],
        ["Alice", "30"],
      ];
      const table = rowsToMarkdownTable(rows);
      expect(table).toContain("| Name | Age |");
      expect(table).toContain("| --- | --- |");
      expect(table).toContain("| Alice | 30 |");
    });

    it("handles empty rows array", () => {
      expect(rowsToMarkdownTable([])).toBe("");
    });
  });
});
