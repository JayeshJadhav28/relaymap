import type { Chunk, Source } from "@/lib/demo/types";
import type { ExtractionDraft } from "./types";

export function firstMatch(text: string, pattern: RegExp): string | undefined {
  return text.match(pattern)?.[1]?.trim();
}

export function cleanTitle(value: string): string {
  const title = value.replace(/^[\s\-*#]+/, "").replace(/\s+/g, " ").trim();
  return title.length > 90 ? `${title.slice(0, 87)}...` : title;
}

export function locationFor(source: Source, chunk: Chunk): string {
  const where = chunk.section || `chunk ${chunk.index + 1}`;
  return `${source.title} · ${where}`;
}

/**
 * Every draft carries the exact chunk text as its quotation. Because the
 * quotation is taken directly from the chunk, a rule cannot invent evidence.
 */
export function baseDraft(
  source: Source,
  chunk: Chunk,
  values: Omit<ExtractionDraft, "quote" | "chunkId" | "sourceId" | "location">,
): ExtractionDraft {
  return {
    ...values,
    quote: chunk.content.trim(),
    chunkId: chunk.id,
    sourceId: source.id,
    location: locationFor(source, chunk),
  };
}
