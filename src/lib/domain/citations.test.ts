import { describe, expect, it } from "vitest";
import { createSeedStore } from "@/lib/demo/seed";
import {
  buildCitation,
  validateCitation,
  validateClaimCitations,
} from "./citations";

describe("chunk-bound citation validation", () => {
  const store = createSeedStore();
  const github = store.sources.find((source) => source.id === "src-github")!;
  const meeting = store.sources.find((source) => source.id === "src-meeting")!;
  const chunk = github.chunks.find((item) =>
    item.content.includes("Deployment target: Vercel."),
  )!;

  it("accepts an exact quotation from the cited chunk", () => {
    const result = validateCitation(github, {
      sourceId: github.id,
      chunkId: chunk.id,
      quote: "Deployment target: Vercel.",
    });
    expect(result.valid).toBe(true);
  });

  it("rejects invented quotations", () => {
    const result = validateCitation(github, {
      sourceId: github.id,
      chunkId: chunk.id,
      quote: "Deployment target: A made-up platform.",
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("exact substring");
  });

  it("rejects a real quotation attached to the wrong chunk", () => {
    const otherChunk = meeting.chunks[0];
    const result = validateCitation(github, {
      sourceId: github.id,
      chunkId: otherChunk.id,
      quote: "Deployment target: Vercel.",
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("does not exist");
  });

  it("rejects a source-id mismatch even when the quote is real", () => {
    const result = validateCitation(github, {
      sourceId: meeting.id,
      chunkId: chunk.id,
      quote: "Deployment target: Vercel.",
    });
    expect(result.valid).toBe(false);
  });

  it("rejects citations outside the claim's project", () => {
    const claim = store.claims.find((item) => item.id === "k-busmap")!;
    const result = validateClaimCitations(
      { ...claim, projectId: "proj-other" },
      store.sources,
    );
    expect(result.valid).toBe(false);
  });

  it("records a stable quote hash on built citations", () => {
    const citation = buildCitation(
      "cite-test",
      "k-test",
      github,
      {
        sourceId: github.id,
        chunkId: chunk.id,
        quote: "Deployment target: Vercel.",
      },
      "README · Deployment",
    );
    expect(citation.quoteHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(citation.verification).toBe("PENDING");
  });
});
