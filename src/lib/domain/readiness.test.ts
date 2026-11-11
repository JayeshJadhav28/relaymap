import { describe, expect, it } from "vitest";
import { createSeedStore } from "@/lib/demo/seed";
import { READINESS_CAVEAT, READINESS_WEIGHTS, calculateReadiness } from "./readiness";

describe("deterministic readiness", () => {
  const store = createSeedStore();
  const input = {
    claims: store.claims,
    sources: store.sources,
    handovers: [],
    acknowledgements: [],
  };

  it("returns the fixed rubric and a bounded score", () => {
    const result = calculateReadiness(input);
    expect(result.components).toHaveLength(6);
    expect(result.components.reduce((sum, item) => sum + item.max, 0)).toBe(100);
    expect(Object.values(READINESS_WEIGHTS).reduce((sum, value) => sum + value, 0)).toBe(100);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.caveat).toBe(READINESS_CAVEAT);
    expect(result.reasons.at(-1)).toBe(READINESS_CAVEAT);
  });

  it("produces identical output for identical input", () => {
    expect(calculateReadiness(input)).toEqual(calculateReadiness(input));
  });

  it("returns zero and an explicit reason when nothing is accessible", () => {
    const result = calculateReadiness({
      claims: [],
      sources: [],
      handovers: [],
      acknowledgements: [],
    });
    expect(result.score).toBe(0);
    expect(result.reasons[0]).toContain("No accessible knowledge");
    result.components.forEach((component) => expect(component.earned).toBe(0));
  });

  it("does not award acknowledgement points before publication", () => {
    const result = calculateReadiness(input);
    const acknowledgement = result.components.find(
      (component) => component.key === "acknowledgement",
    )!;
    expect(acknowledgement.earned).toBe(0);
    expect(acknowledgement.reason).toContain("No handover has been published");
  });

  it("never lets a component exceed its maximum", () => {
    const result = calculateReadiness(input);
    for (const component of result.components) {
      expect(component.earned).toBeLessThanOrEqual(component.max);
      expect(component.earned).toBeGreaterThanOrEqual(0);
    }
  });
});
