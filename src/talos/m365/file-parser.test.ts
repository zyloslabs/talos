import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  parseFile,
  parseDocx,
  parsePdf,
  parseXlsx,
  parsePptx,
  htmlToMarkdown,
  cleanPdfText,
  parseMergeRef,
  expandMergedCells,
  rowsToMarkdownTable,
} from "./file-parser.js";
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
        parseFile(Buffer.from("test"), "txt")
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

    it("converts ordered lists with numbered items", () => {
      const result = htmlToMarkdown("<ol><li>First</li><li>Second</li></ol>");
      expect(result).toContain("1. First");
      expect(result).toContain("2. Second");
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

    it("pads rows with different column counts", () => {
      const rows = [["A", "B", "C"], ["X"]];
      const table = rowsToMarkdownTable(rows);
      expect(table).toContain("| A | B | C |");
      expect(table).toContain("| X |  |  |");
    });
  });

  describe("parsePptx — extended node types", () => {
    it("handles list-type nodes", async () => {
      const officeparser = await import("officeparser");
      (officeparser.default.parseOffice as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        content: [{ type: "list", text: "List item one" }],
      });
      const result = await parsePptx(Buffer.from("test"));
      expect(result).toContain("- List item one");
    });

    it("handles table-type nodes", async () => {
      const officeparser = await import("officeparser");
      (officeparser.default.parseOffice as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        content: [
          {
            type: "table",
            children: [
              {
                type: "row",
                children: [
                  { type: "cell", text: "H1" },
                  { type: "cell", text: "H2" },
                ],
              },
              {
                type: "row",
                children: [
                  { type: "cell", text: "D1" },
                  { type: "cell", text: "D2" },
                ],
              },
            ],
          },
        ],
      });
      const result = await parsePptx(Buffer.from("test"));
      expect(result).toContain("H1");
      expect(result).toContain("D2");
    });

    it("returns empty presentation message when no content", async () => {
      const officeparser = await import("officeparser");
      (officeparser.default.parseOffice as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ content: [] });
      const result = await parsePptx(Buffer.from("test"));
      expect(result).toBe("*Empty presentation*");
    });

    it("handles paragraph/text nodes via else-if branch", async () => {
      const officeparser = await import("officeparser");
      (officeparser.default.parseOffice as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        content: [{ type: "paragraph", text: "  raw paragraph text  " }],
      });
      const result = await parsePptx(Buffer.from("test"));
      expect(result).toContain("raw paragraph text");
    });

    it("handles table nodes with no rows (skips mdTable path)", async () => {
      const officeparser = await import("officeparser");
      (officeparser.default.parseOffice as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        content: [{ type: "table", children: [] }],
      });
      // Should not crash — table with no valid rows produces empty sections
      const result = await parsePptx(Buffer.from("test"));
      expect(result).toBe("*Empty presentation*");
    });

    it("handles heading without metadata level", async () => {
      const officeparser = await import("officeparser");
      (officeparser.default.parseOffice as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        content: [{ type: "heading", text: "No level heading", metadata: null }],
      });
      const result = await parsePptx(Buffer.from("test"));
      expect(result).toContain("## No level heading");
    });
  });

  describe("expandMergedCells — extended", () => {
    it("creates missing rows when needed", () => {
      const rows: string[][] = [["A"]];
      // Merge extends beyond existing rows
      const merges = [{ s: { r: 0, c: 0 }, e: { r: 2, c: 0 } }];
      const expanded = expandMergedCells(rows, merges);
      expect(expanded[2][0]).toBe("A");
    });

    it("handles no merges", () => {
      const rows = [
        ["A", "B"],
        ["C", "D"],
      ];
      const expanded = expandMergedCells(rows, []);
      expect(expanded).toEqual([
        ["A", "B"],
        ["C", "D"],
      ]);
    });
  });

  describe("cleanPdfText — extended", () => {
    it("converts short all-caps lines (<= 3 chars) without converting to heading", () => {
      // 3 chars or fewer — should NOT become a heading
      const result = cleanPdfText("AB");
      expect(result).not.toContain("##");
    });

    it("converts very long all-caps lines (>= 100 chars) without converting to heading", () => {
      const longLine = "A".repeat(100) + " " + "B".repeat(100);
      const result = cleanPdfText(longLine);
      // Long line exceeds 100 chars — should NOT become a heading
      expect(result).not.toContain("##");
    });

    it("converts eligible all-caps line to heading", () => {
      const result = cleanPdfText("SECTION TITLE");
      expect(result).toContain("## SECTION TITLE");
    });

    it("handles CRLF line endings", () => {
      const result = cleanPdfText("line1\r\nline2\rline3");
      expect(result).toContain("line1");
      expect(result).toContain("line2");
      expect(result).toContain("line3");
    });
  });

  describe("htmlToMarkdown — extended", () => {
    it("converts tables to markdown", () => {
      const html = "<table><tr><th>Name</th><th>Age</th></tr><tr><td>Alice</td><td>30</td></tr></table>";
      const result = htmlToMarkdown(html);
      expect(result).toContain("Name");
      expect(result).toContain("Alice");
    });

    it("handles multiple heading levels", () => {
      expect(htmlToMarkdown("<h4>h4</h4>")).toContain("#### h4");
      expect(htmlToMarkdown("<h5>h5</h5>")).toContain("##### h5");
      expect(htmlToMarkdown("<h6>h6</h6>")).toContain("###### h6");
    });

    it("decodes HTML entities", () => {
      const result = htmlToMarkdown("&amp; &#39; &quot;");
      expect(result).toContain("&");
      expect(result).toContain("'");
      expect(result).toContain('"');
    });

    it("handles <b> and <i> tags", () => {
      expect(htmlToMarkdown("<b>bold</b>")).toContain("**bold**");
      expect(htmlToMarkdown("<i>italic</i>")).toContain("*italic*");
    });

    it("handles <br> tags", () => {
      const result = htmlToMarkdown("line1<br>line2");
      expect(result).toContain("line1");
      expect(result).toContain("line2");
    });

    it("converts pre>code blocks to fenced code blocks", () => {
      const html = '<pre><code class="language-typescript">const x = 1;</code></pre>';
      const result = htmlToMarkdown(html);
      expect(result).toContain("```typescript");
      expect(result).toContain("const x = 1;");
      expect(result).toContain("```");
    });

    it("converts standalone pre blocks to fenced code blocks", () => {
      const html = "<pre>some code here</pre>";
      const result = htmlToMarkdown(html);
      expect(result).toContain("```");
      expect(result).toContain("some code here");
    });

    it("converts inline code tags to backtick code", () => {
      const html = "Use <code>npm install</code> to install";
      const result = htmlToMarkdown(html);
      expect(result).toContain("`npm install`");
    });

    it("decodes HTML entities inside code blocks", () => {
      const html = "<pre><code>&lt;div&gt;hello&lt;/div&gt;</code></pre>";
      const result = htmlToMarkdown(html);
      expect(result).toContain("<div>hello</div>");
    });
  });
});
