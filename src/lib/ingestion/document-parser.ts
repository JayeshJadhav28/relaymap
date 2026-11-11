import { createHash } from "node:crypto";
import type { SourceKind } from "@/lib/demo/types";

export const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
export const MAX_SOURCE_CHARS = 500_000;

const KINDS: Record<string, { kind: SourceKind; mode: "line" | "paragraph" }> = {
  ".txt": { kind: "txt", mode: "line" },
  ".text": { kind: "txt", mode: "line" },
  ".md": { kind: "md", mode: "paragraph" },
  ".markdown": { kind: "md", mode: "paragraph" },
  ".csv": { kind: "csv", mode: "line" },
  ".json": { kind: "json", mode: "paragraph" },
};

export type ParsedDocument = {
  filename: string;
  kind: SourceKind;
  text: string;
  contentHash: string;
  chunkMode: "line" | "paragraph";
  bytes: number;
  /**
   * Real pagination, only populated when the format provides it (PDF). DOCX
   * has no fixed pages, so it reports paragraph sections instead of inventing
   * page numbers.
   */
  pages?: PageRange[];
};

export type PageRange = {
  page: number;
  charStart: number;
  charEnd: number;
};

export type ParseFailure = {
  ok: false;
  code:
    | "UNSUPPORTED_MEDIA_TYPE"
    | "EMPTY_SOURCE"
    | "PAYLOAD_TOO_LARGE"
    | "MALFORMED_SOURCE"
    | "PARSER_UNAVAILABLE";
  message: string;
};

export type ParseResult = { ok: true; document: ParsedDocument } | ParseFailure;

function extensionOf(filename: string): string {
  const index = filename.lastIndexOf(".");
  return index === -1 ? "" : filename.slice(index).toLowerCase();
}

export function parseDocument(input: {
  filename: string;
  content: string;
  byteLength?: number;
}): ParseResult {
  const filename = input.filename.trim();
  if (!filename) {
    return { ok: false, code: "UNSUPPORTED_MEDIA_TYPE", message: "A filename is required." };
  }
  const extension = extensionOf(filename);
  const descriptor = KINDS[extension];

  if (!descriptor) {
    if (extension === ".pdf" || extension === ".docx") {
      return {
        ok: false,
        code: "UNSUPPORTED_MEDIA_TYPE",
        message:
          "PDF and DOCX sources must be uploaded as binary data. Send base64 content so the file signature and parser can be verified.",
      };
    }
    return {
      ok: false,
      code: "UNSUPPORTED_MEDIA_TYPE",
      message: "Supported source formats are .txt, .md, .markdown, .csv, .json, .pdf and .docx.",
    };
  }

  const bytes = input.byteLength ?? Buffer.byteLength(input.content, "utf8");
  if (bytes > MAX_SOURCE_BYTES) {
    return {
      ok: false,
      code: "PAYLOAD_TOO_LARGE",
      message: `The source exceeds the ${Math.round(MAX_SOURCE_BYTES / 1024)} KB demo limit.`,
    };
  }
  if (bytes === 0 || input.content.trim().length === 0) {
    return { ok: false, code: "EMPTY_SOURCE", message: "The source is empty." };
  }
  if (input.content.length > MAX_SOURCE_CHARS) {
    return { ok: false, code: "PAYLOAD_TOO_LARGE", message: "The source is too long." };
  }
  if (input.content.includes("\u0000")) {
    return {
      ok: false,
      code: "MALFORMED_SOURCE",
      message: "The source contains binary content and was rejected.",
    };
  }

  let text = input.content.replace(/\r\n?/g, "\n");
  if (descriptor.kind === "json") {
    try {
      const parsed: unknown = JSON.parse(text);
      text = JSON.stringify(parsed, null, 2);
    } catch {
      return { ok: false, code: "MALFORMED_SOURCE", message: "The JSON source is not valid JSON." };
    }
  }

  const contentHash =
    "sha256:" + createHash("sha256").update(text, "utf8").digest("hex");

  return {
    ok: true,
    document: {
      filename,
      kind: descriptor.kind,
      text,
      contentHash,
      chunkMode: descriptor.mode,
      bytes,
    },
  };
}

function pageAt(pages: PageRange[] | undefined, offset: number): number | null {
  if (!pages) return null;
  const match = pages.find((range) => offset >= range.charStart && offset < range.charEnd);
  return match ? match.page : null;
}

/**
 * Binary-aware parsing. Text formats are decoded and delegated to the
 * synchronous parser, so both entry points share identical validation. PDF and
 * DOCX require a matching file signature before any parser runs.
 */
export async function parseDocumentAsync(input: {
  filename: string;
  bytes: Uint8Array;
}): Promise<ParseResult> {
  const filename = input.filename.trim();
  if (!filename) {
    return { ok: false, code: "UNSUPPORTED_MEDIA_TYPE", message: "A filename is required." };
  }

  const bytes = input.bytes;
  if (bytes.byteLength === 0) {
    return { ok: false, code: "EMPTY_SOURCE", message: "The source is empty." };
  }
  if (bytes.byteLength > MAX_SOURCE_BYTES) {
    return {
      ok: false,
      code: "PAYLOAD_TOO_LARGE",
      message: `The source exceeds the ${Math.round(MAX_SOURCE_BYTES / 1024)} KB demo limit.`,
    };
  }

  const extension = extensionOf(filename);

  if (extension !== ".pdf" && extension !== ".docx") {
    const content = new TextDecoder("utf-8").decode(bytes);
    return parseDocument({ filename, content, byteLength: bytes.byteLength });
  }

  const expected = extension === ".pdf" ? "pdf" : "docx";
  let detected: string | undefined;
  try {
    const { fileTypeFromBuffer } = await import("file-type");
    detected = (await fileTypeFromBuffer(bytes))?.ext;
  } catch {
    return {
      ok: false,
      code: "PARSER_UNAVAILABLE",
      message: "The file-signature checker could not be loaded.",
    };
  }

  // file-type identifies DOCX by inspecting the zip entries. A plain zip with
  // a .docx name is rejected rather than handed to the parser.
  if (!detected || detected !== expected) {
    return {
      ok: false,
      code: "MALFORMED_SOURCE",
      message: `The file signature does not match the .${expected} extension.`,
    };
  }

  let text: string;
  let pages: PageRange[] | undefined;

  try {
    if (expected === "pdf") {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const document = await getDocumentProxy(new Uint8Array(bytes));
      const result = await extractText(document, { mergePages: false });

      const parts: string[] = [];
      const ranges: PageRange[] = [];
      let offset = 0;

      result.text.forEach((pageText, index) => {
        const cleaned = pageText.replace(/\r\n?/g, "\n").trim();
        if (index > 0) {
          parts.push("\n\n");
          offset += 2;
        }
        const charStart = offset;
        parts.push(cleaned);
        offset += cleaned.length;
        ranges.push({ page: index + 1, charStart, charEnd: offset });
      });

      text = parts.join("");
      pages = ranges;
    } else {
      const mammoth = (await import("mammoth")).default;
      const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
      text = result.value.replace(/\r\n?/g, "\n");
    }
  } catch {
    return {
      ok: false,
      code: "MALFORMED_SOURCE",
      message: "The document could not be parsed and was rejected.",
    };
  }

  const normalised = text.replace(/[ \t]+\n/g, "\n").trim();
  if (!normalised) {
    return {
      ok: false,
      code: "EMPTY_SOURCE",
      message:
        expected === "pdf"
          ? "No extractable text was found. Scanned PDFs require OCR, which this build does not perform."
          : "The document contains no extractable text.",
    };
  }
  if (normalised.length > MAX_SOURCE_CHARS) {
    return { ok: false, code: "PAYLOAD_TOO_LARGE", message: "The extracted text is too long." };
  }

  const contentHash = "sha256:" + createHash("sha256").update(normalised, "utf8").digest("hex");

  return {
    ok: true,
    document: {
      filename,
      kind: expected,
      text: normalised,
      contentHash,
      chunkMode: "paragraph",
      bytes: bytes.byteLength,
      pages,
    },
  };
}

export type TextChunk = {
  index: number;
  page: number | null;
  section: string;
  content: string;
  charStart: number;
  charEnd: number;
};

function sectionAt(text: string, offset: number): string {
  const before = text.slice(0, offset);
  const headings = [...before.matchAll(/^#{1,6}\s+(.+)$/gm)];
  if (!headings.length) return "Document";
  return headings[headings.length - 1][1].trim().slice(0, 120);
}

/**
 * Deterministic chunking with exact character offsets. Paragraph mode is used
 * for Markdown/JSON, line mode for plain text, CSV and interview transcripts.
 */
export function chunkText(
  text: string,
  mode: "line" | "paragraph",
  pages?: PageRange[],
): TextChunk[] {
  const ranges: { start: number; end: number }[] = [];

  if (mode === "line") {
    const matcher = /[^\n]+/g;
    let match: RegExpExecArray | null;
    while ((match = matcher.exec(text)) !== null) {
      const raw = match[0];
      const lead = raw.length - raw.trimStart().length;
      const start = match.index + lead;
      const end = start + raw.trim().length;
      if (end > start) ranges.push({ start, end });
    }
  } else {
    let cursor = 0;
    for (const block of text.split(/\n{2,}/)) {
      if (!block.trim()) {
        cursor += block.length + 2;
        continue;
      }
      const start = text.indexOf(block, cursor);
      if (start === -1) continue;
      const lead = block.length - block.trimStart().length;
      const trimmedStart = start + lead;
      const trimmedEnd = trimmedStart + block.trim().length;
      ranges.push({ start: trimmedStart, end: trimmedEnd });
      cursor = start + block.length;
    }
  }

  return ranges.map((range, index) => {
    const page = pageAt(pages, range.start);
    return {
      index,
      page,
      section:
        page !== null
          ? `Page ${page}`
          : mode === "line"
            ? `Line ${index + 1}`
            : sectionAt(text, range.start),
      content: text.slice(range.start, range.end),
      charStart: range.start,
      charEnd: range.end,
    };
  });
}
