import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  chunkText,
  parseDocument,
  parseDocumentAsync,
  MAX_SOURCE_BYTES,
} from "./document-parser";

const fixture = (name: string): Buffer => readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url));
const samplePdf = fixture("sample.pdf");
const sampleDocx = fixture("sample.docx");
const plainArchive = fixture("plain-archive.docx");
const twoPagePdf = fixture("sample-2page.pdf");

describe("document ingestion", () => {
  it("parses Markdown and returns a stable content hash", () => {
    const first = parseDocument({
      filename: "notes.md",
      content: "# Heading\n\nDeployment target: Vercel.\n",
    });
    const second = parseDocument({
      filename: "notes.md",
      content: "# Heading\n\nDeployment target: Vercel.\n",
    });

    expect(first.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.document.kind).toBe("md");
    expect(first.document.chunkMode).toBe("paragraph");
    expect(first.document.contentHash).toBe(second.document.contentHash);
    expect(first.document.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("rejects PDF and DOCX sent through the text path", () => {
    for (const filename of ["report.pdf", "report.docx"]) {
      const result = parseDocument({ filename, content: "irrelevant" });
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.code).toBe("UNSUPPORTED_MEDIA_TYPE");
      expect(result.message).toContain("binary data");
    }
  });

  it("rejects unknown extensions, empty content and binary content", () => {
    expect(parseDocument({ filename: "image.png", content: "x" }).ok).toBe(false);
    expect(parseDocument({ filename: "empty.txt", content: "   " }).ok).toBe(false);
    const binary = parseDocument({ filename: "bad.txt", content: "abc\u0000def" });
    expect(binary.ok).toBe(false);
    if (!binary.ok) expect(binary.code).toBe("MALFORMED_SOURCE");
  });

  it("rejects malformed JSON and normalises valid JSON", () => {
    const bad = parseDocument({ filename: "data.json", content: "{not json" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.code).toBe("MALFORMED_SOURCE");

    const good = parseDocument({
      filename: "data.json",
      content: JSON.stringify({ task: "Reconcile alerts" }),
    });
    expect(good.ok).toBe(true);
    if (good.ok) expect(good.document.text).toContain('"task": "Reconcile alerts"');
  });

  it("rejects oversized sources", () => {
    const result = parseDocument({
      filename: "huge.txt",
      content: "a",
      byteLength: MAX_SOURCE_BYTES + 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("chunks lines with exact character offsets", () => {
    const text = "First line\n  Second line\n\nThird line";
    const chunks = chunkText(text, "line");
    expect(chunks).toHaveLength(3);
    for (const chunk of chunks) {
      expect(text.slice(chunk.charStart, chunk.charEnd)).toBe(chunk.content);
      expect(chunk.content).toBe(chunk.content.trim());
    }
    expect(chunks[1].section).toBe("Line 2");
  });

  it("chunks paragraphs with section labels and exact offsets", () => {
    const text = "# Decision\n\nWe chose Netlify.\n\n## Owner\n\nAarav owns it.";
    const chunks = chunkText(text, "paragraph");
    expect(chunks.length).toBe(4);
    for (const chunk of chunks) {
      expect(text.slice(chunk.charStart, chunk.charEnd)).toBe(chunk.content);
    }
    expect(chunks[1].section).toBe("Decision");
  });

  it("is deterministic across repeated chunking", () => {
    const text = "one\n\ntwo\n\nthree";
    expect(chunkText(text, "paragraph")).toEqual(chunkText(text, "paragraph"));
  });
});

describe("binary ingestion", () => {
  it("extracts real page text from a PDF and records the page number", async () => {
    const result = await parseDocumentAsync({ filename: "report.pdf", bytes: samplePdf });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.kind).toBe("pdf");
    expect(result.document.text).toContain("Deployment target: Vercel.");
    expect(result.document.pages).toHaveLength(1);

    const chunks = chunkText(result.document.text, result.document.chunkMode, result.document.pages);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].page).toBe(1);
    expect(chunks[0].section).toBe("Page 1");
    expect(result.document.text.slice(chunks[0].charStart, chunks[0].charEnd)).toBe(chunks[0].content);
  });

  it("maps each chunk to its real page in a multi-page PDF", async () => {
    const result = await parseDocumentAsync({ filename: "two-pages.pdf", bytes: twoPagePdf });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.pages).toHaveLength(2);
    expect(result.document.text).toContain("Decision: move the pilot to Vercel.");
    expect(result.document.text).toContain("second-page checklist");

    const chunks = chunkText(result.document.text, result.document.chunkMode, result.document.pages);
    const pages = chunks.map((chunk) => chunk.page);
    expect(pages).toContain(1);
    expect(pages).toContain(2);
    const pageTwo = chunks.find((chunk) => chunk.page === 2)!;
    expect(pageTwo.section).toBe("Page 2");
    expect(pageTwo.content).toContain("second-page checklist");
    expect(pageTwo.charStart).toBeGreaterThanOrEqual(result.document.pages![1].charStart);
  });

  it("extracts DOCX paragraph text without inventing page numbers", async () => {
    const result = await parseDocumentAsync({ filename: "notes.docx", bytes: sampleDocx });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.kind).toBe("docx");
    expect(result.document.text).toContain("Blocker: staging credentials expired.");
    expect(result.document.text).toContain("Assignee: Unassigned");
    expect(result.document.pages).toBeUndefined();
    expect(chunkText(result.document.text, result.document.chunkMode)[0].page).toBeNull();
  });

  it("rejects a file whose signature does not match its extension", async () => {
    const result = await parseDocumentAsync({ filename: "disguised.pdf", bytes: sampleDocx });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("MALFORMED_SOURCE");
  });

  it("rejects a zip archive renamed to .docx", async () => {
    const result = await parseDocumentAsync({ filename: "archive.docx", bytes: plainArchive });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("MALFORMED_SOURCE");
  });

  it("rejects an empty binary payload and an oversized one", async () => {
    const empty = await parseDocumentAsync({ filename: "empty.pdf", bytes: new Uint8Array() });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.code).toBe("EMPTY_SOURCE");

    const huge = await parseDocumentAsync({
      filename: "huge.pdf",
      bytes: new Uint8Array(MAX_SOURCE_BYTES + 1),
    });
    expect(huge.ok).toBe(false);
    if (!huge.ok) expect(huge.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("still decodes text formats through the same validation path", async () => {
    const result = await parseDocumentAsync({
      filename: "notes.txt",
      bytes: new TextEncoder().encode("Deployment target: Netlify."),
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.document.text).toContain("Netlify");
  });
});
