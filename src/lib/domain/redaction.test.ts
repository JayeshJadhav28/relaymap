import { describe, expect, it } from "vitest";
import { createSeedStore } from "@/lib/demo/seed";
import {
  redactClaimsForRole,
  redactClaimsForSourceIds,
  visibleSourceIdsForRole,
  visibleSourcesForRole,
} from "./redaction";

describe("role-aware redaction", () => {
  const store = createSeedStore();

  it("hides the finance source and every claim that cites it from the incoming role", () => {
    const result = redactClaimsForRole(store.claims, store.sources, "incoming");
    expect(result.visible.some((claim) => claim.id === "k-finance")).toBe(false);
    expect(result.excluded.some((claim) => claim.id === "k-finance")).toBe(true);
    expect(result.excludedCount).toBeGreaterThan(0);
    expect(
      result.visible.flatMap((claim) => claim.citations).some((citation) => citation.sourceId === "src-finance"),
    ).toBe(false);
  });

  it("allows the project lead and treasurer to see the finance record", () => {
    for (const role of ["lead", "treasurer"] as const) {
      const result = redactClaimsForRole(store.claims, store.sources, role);
      expect(result.visible.some((claim) => claim.id === "k-finance")).toBe(true);
    }
  });

  it("never partially hides a claim's citations", () => {
    const sources = store.sources.filter((source) => source.id !== "src-github");
    const sourceIds = new Set(sources.map((source) => source.id));
    const visible = redactClaimsForSourceIds(store.claims, sourceIds);
    for (const claim of visible) {
      for (const citation of claim.citations) {
        expect(sourceIds.has(citation.sourceId)).toBe(true);
      }
    }
    expect(visible.some((claim) => claim.id === "k-busmap")).toBe(true);
    expect(visible.some((claim) => claim.id === "k-deploy")).toBe(false);
  });

  it("filters sources before they reach a page", () => {
    expect(visibleSourcesForRole(store.sources, "reviewer").map((source) => source.id)).not.toContain(
      "src-finance",
    );
    expect([...visibleSourceIdsForRole(store.sources, "lead")]).toContain("src-finance");
  });
});
