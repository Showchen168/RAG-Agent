jest.mock("pdf-parse", () => {
  // Simulate pdf-parse with per-page pagerender callback support
  const mockPdfParse = jest
    .fn()
    .mockImplementation(
      async (
        _buffer: Buffer,
        options?: { pagerender?: (pageData: unknown) => Promise<string> },
      ) => {
        // Simulate a 3-page PDF document
        const pageTexts = [
          "Page 1 content",
          "Page 2 content",
          "Page 3 content",
        ];

        // If a pagerender callback is provided, call it for each page
        if (options?.pagerender) {
          const renderedTexts: string[] = [];
          for (let i = 0; i < pageTexts.length; i++) {
            const fakePageData = {
              getTextContent: () =>
                Promise.resolve({
                  items: [
                    { str: pageTexts[i], transform: [0, 0, 0, 0, 0, 100] },
                  ],
                }),
            };
            const text = await options.pagerender(fakePageData);
            renderedTexts.push(text);
          }
          return {
            numpages: 3,
            text: renderedTexts.join("\n\n"),
          };
        }

        // Fallback: no pagerender callback, return combined text
        return {
          numpages: 3,
          text: pageTexts.join("\n\n"),
        };
      },
    );
  return mockPdfParse;
});
jest.mock("mammoth", () => ({
  convertToHtml: jest
    .fn()
    .mockResolvedValue({ value: "<h1>Title</h1><p>Body text</p>" }),
  extractRawText: jest.fn().mockResolvedValue({ value: "Raw text fallback" }),
}));
jest.mock("officeparser", () => ({
  parseOffice: jest.fn().mockResolvedValue({
    toText: () => "PPTX slide content",
  }),
}));
jest.mock("xlsx", () => ({
  read: jest.fn().mockReturnValue({
    SheetNames: ["Sheet1"],
    Sheets: {
      Sheet1: { "!ref": "A1:B2" },
    },
  }),
  utils: {
    sheet_to_csv: jest.fn().mockReturnValue("Name,Age\nAlice,30"),
  },
}));

import {
  detectFileType,
  parseFile,
  MAX_FILE_SIZE,
  ACCEPTED_EXTENSIONS,
  ACCEPTED_MIME_TYPES,
} from "../file-parser";

describe("file-parser", () => {
  describe("detectFileType", () => {
    it("should detect PDF from MIME type", () => {
      expect(detectFileType("application/pdf", "doc.pdf")).toBe("pdf");
    });

    it("should detect DOCX from MIME type", () => {
      expect(
        detectFileType(
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "doc.docx",
        ),
      ).toBe("docx");
    });

    it("should detect XLSX from MIME type", () => {
      expect(
        detectFileType(
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "data.xlsx",
        ),
      ).toBe("xlsx");
    });

    it("should detect PPTX from MIME type", () => {
      expect(
        detectFileType(
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          "slide.pptx",
        ),
      ).toBe("pptx");
    });

    it("should detect text files from MIME type", () => {
      expect(detectFileType("text/plain", "readme.txt")).toBe("txt");
      expect(detectFileType("text/markdown", "notes.md")).toBe("md");
    });

    it("should detect image files from MIME type", () => {
      expect(detectFileType("image/png", "pic.png")).toBe("png");
      expect(detectFileType("image/jpeg", "photo.jpeg")).toBe("jpeg");
    });

    it("should fallback to extension when MIME is unknown", () => {
      expect(detectFileType("application/octet-stream", "doc.pdf")).toBe("pdf");
      expect(detectFileType("application/octet-stream", "data.xlsx")).toBe(
        "xlsx",
      );
    });

    it("should return null for unsupported types", () => {
      expect(detectFileType("application/zip", "archive.zip")).toBeNull();
    });

    it("should handle uppercase extensions", () => {
      expect(detectFileType("application/octet-stream", "DOC.PDF")).toBe("pdf");
    });

    it("should detect old Excel MIME", () => {
      expect(detectFileType("application/vnd.ms-excel", "old.xls")).toBe(
        "xlsx",
      );
    });
  });

  describe("parseFile", () => {
    it("should parse PDF files and preserve per-page text", async () => {
      const result = await parseFile(Buffer.from("fake-pdf"), "pdf");
      // Should have combined text from all pages
      expect(result.text).toContain("Page 1 content");
      expect(result.text).toContain("Page 2 content");
      expect(result.text).toContain("Page 3 content");
      // Should have 3 separate pages with correct page numbers
      expect(result.pages).toHaveLength(3);
      expect(result.pages[0].pageNumber).toBe(1);
      expect(result.pages[0].text).toBe("Page 1 content");
      expect(result.pages[1].pageNumber).toBe(2);
      expect(result.pages[1].text).toBe("Page 2 content");
      expect(result.pages[2].pageNumber).toBe(3);
      expect(result.pages[2].text).toBe("Page 3 content");
    });

    it("should filter out empty pages in PDF", async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse");
      // Override mock for this test to simulate empty pages
      pdfParse.mockImplementationOnce(
        async (
          _buffer: Buffer,
          options?: {
            pagerender?: (pageData: unknown) => Promise<string>;
          },
        ) => {
          const pageTexts = ["Content on page 1", "", "Content on page 3"];
          if (options?.pagerender) {
            const renderedTexts: string[] = [];
            for (let i = 0; i < pageTexts.length; i++) {
              const fakePageData = {
                getTextContent: () =>
                  Promise.resolve({
                    items: pageTexts[i]
                      ? [
                          {
                            str: pageTexts[i],
                            transform: [0, 0, 0, 0, 0, 100],
                          },
                        ]
                      : [],
                  }),
              };
              const text = await options.pagerender(fakePageData);
              renderedTexts.push(text);
            }
            return { numpages: 3, text: renderedTexts.join("\n\n") };
          }
          return { numpages: 3, text: pageTexts.join("\n\n") };
        },
      );

      const result = await parseFile(Buffer.from("fake-pdf"), "pdf");
      // Empty pages should be filtered out
      expect(result.pages).toHaveLength(2);
      expect(result.pages[0].pageNumber).toBe(1);
      expect(result.pages[0].text).toBe("Content on page 1");
      expect(result.pages[1].pageNumber).toBe(3);
      expect(result.pages[1].text).toBe("Content on page 3");
    });

    it("should handle single-page PDF", async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse");
      pdfParse.mockImplementationOnce(
        async (
          _buffer: Buffer,
          options?: {
            pagerender?: (pageData: unknown) => Promise<string>;
          },
        ) => {
          if (options?.pagerender) {
            const fakePageData = {
              getTextContent: () =>
                Promise.resolve({
                  items: [
                    {
                      str: "Single page text",
                      transform: [0, 0, 0, 0, 0, 100],
                    },
                  ],
                }),
            };
            const text = await options.pagerender(fakePageData);
            return { numpages: 1, text };
          }
          return { numpages: 1, text: "Single page text" };
        },
      );

      const result = await parseFile(Buffer.from("fake-pdf"), "pdf");
      expect(result.pages).toHaveLength(1);
      expect(result.pages[0].pageNumber).toBe(1);
      expect(result.pages[0].text).toBe("Single page text");
    });

    it("should parse DOCX files", async () => {
      const result = await parseFile(Buffer.from("fake-docx"), "docx");
      expect(result.text).toContain("Title");
      expect(result.pages).toHaveLength(1);
    });

    it("should parse PPTX files", async () => {
      const result = await parseFile(Buffer.from("fake-pptx"), "pptx");
      expect(result.text).toBe("PPTX slide content");
    });

    it("should parse XLSX files", async () => {
      const result = await parseFile(Buffer.from("fake-xlsx"), "xlsx");
      expect(result.text).toContain("Sheet1");
    });

    it("should parse text files", async () => {
      const content = "這是純文字內容";
      const result = await parseFile(Buffer.from(content), "txt");
      expect(result.text).toBe(content);
    });

    it("should parse markdown files", async () => {
      const content = "# Title\n\nContent here";
      const result = await parseFile(Buffer.from(content), "md");
      expect(result.text).toBe(content);
    });

    it("should handle image files", async () => {
      const result = await parseFile(Buffer.from("fake-image"), "png");
      expect(result.text).toBe("");
      expect(result.pages[0].image).toBeDefined();
    });

    it("should handle JPEG images", async () => {
      const result = await parseFile(Buffer.from("fake-image"), "jpeg");
      expect(result.text).toBe("");
      expect(result.pages[0].image).toBeDefined();
    });

    it("should handle JPG images", async () => {
      const result = await parseFile(Buffer.from("fake-image"), "jpg");
      expect(result.text).toBe("");
    });
  });

  describe("constants", () => {
    it("should have MAX_FILE_SIZE as 50MB", () => {
      expect(MAX_FILE_SIZE).toBe(50 * 1024 * 1024);
    });

    it("should have valid ACCEPTED_EXTENSIONS", () => {
      expect(ACCEPTED_EXTENSIONS).toContain(".pdf");
      expect(ACCEPTED_EXTENSIONS).toContain(".docx");
      expect(ACCEPTED_EXTENSIONS).toContain(".xlsx");
    });

    it("should have valid ACCEPTED_MIME_TYPES", () => {
      expect(ACCEPTED_MIME_TYPES).toContain("application/pdf");
      expect(ACCEPTED_MIME_TYPES.length).toBeGreaterThan(5);
    });
  });
});
