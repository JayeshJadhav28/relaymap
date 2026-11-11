/**
 * Chunk-bound citation validation.
 *
 * Adapted from relay.ts::validateCitation in relay-knowledge-continuity (MIT).
 * Copyright (c) 2026 Relay contributors.
 * Source: https://github.com/hemantrai-tech/relay-knowledge-continuity
 *
 * The original verified a quote against a whole source blob. RelayMap requires
 * the quote to be an exact substring of the cited chunk so a claim can never
 * point at a location that does not exist.
 */
import type { Chunk, Citation, Source } from "@/lib/demo/types";
import { quoteHash } from "./hash";

export type CitationInput = {
  sourceId: string;
  chunkId: string;
  quote: string;
  page?: number | null;
};

export type CitationValidation = {
  valid: boolean;
  reason?: string;
};

export function findChunk(source: Source, chunkId: string): Chunk | undefined {
  return source.chunks.find((chunk) => chunk.id === chunkId);
}

export function validateCitation(
  source: Source | undefined,
  citation: CitationInput,
): CitationValidation {
  if (!source) return { valid: false, reason: "The cited source does not exist." };
  if (source.id !== citation.sourceId) {
    return { valid: false, reason: "The citation names a different source id." };
  }
  if (!citation.quote.trim()) {
    return { valid: false, reason: "The quotation is empty." };
  }
  if (citation.quote.length > 2000) {
    return { valid: false, reason: "The quotation exceeds 2,000 characters." };
  }

  const chunk = findChunk(source, citation.chunkId);
  if (!chunk) return { valid: false, reason: "The cited chunk does not exist." };
  if (chunk.sourceId !== source.id) {
    return { valid: false, reason: "The chunk belongs to a different source." };
  }
  if (!chunk.content.includes(citation.quote)) {
    return { valid: false, reason: "The quotation is not an exact substring of the cited chunk." };
  }
  if (
    citation.page != null &&
    chunk.page != null &&
    citation.page !== chunk.page
  ) {
    return { valid: false, reason: "The citation page does not match the cited chunk." };
  }
  return { valid: true };
}

export function buildCitation(
  id: string,
  claimId: string,
  source: Source,
  input: CitationInput,
  location: string,
  verification: Citation["verification"] = "PENDING",
): Citation {
  return {
    id,
    claimId,
    sourceId: input.sourceId,
    chunkId: input.chunkId,
    quote: input.quote,
    page: input.page ?? null,
    location,
    verification,
    quoteHash: quoteHash(input.quote),
  };
}

/** Every citation on a claim must resolve to an exact chunk quotation. */
export function validateClaimCitations(
  claim: { citations: Citation[]; projectId: string },
  sources: Source[],
): CitationValidation {
  if (claim.citations.length === 0) {
    return { valid: false, reason: "The claim has no citations." };
  }
  const byId = new Map(sources.map((source) => [source.id, source]));
  for (const citation of claim.citations) {
    const source = byId.get(citation.sourceId);
    if (!source) return { valid: false, reason: "A cited source is missing or not accessible." };
    if (source.projectId !== claim.projectId) {
      return { valid: false, reason: "A citation points outside the claim's project." };
    }
    const result = validateCitation(source, citation);
    if (!result.valid) return result;
  }
  return { valid: true };
}
