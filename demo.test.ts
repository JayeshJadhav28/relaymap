import { describe, expect, it } from "vitest";
import { knowledge, sources } from "./demo-data";
import { calculateReadiness, extractFindings, getVisibleSources, redactForRole, validateCitation } from "./relay";

describe("Relay evidence and demo access", () => {
  it("accepts only exact excerpts from their cited source", () => {
    const source = sources.find((item) => item.id === "src-github")!;
    expect(validateCitation(source, { sourceId: source.id, quote: "Deployment target: Vercel." })).toBe(true);
    expect(validateCitation(source, { sourceId: source.id, quote: "A made-up deployment target" })).toBe(false);
    expect(validateCitation(source, { sourceId: "src-meeting", quote: "Deployment target: Vercel." })).toBe(false);
  });

  it("redacts restricted records and citations from general members", () => {
    const permitted = new Set(getVisibleSources(sources, "member").map((source) => source.id));
    const visible = redactForRole(knowledge, permitted, "member");
    expect(visible.some((item) => item.id === "k-finance")).toBe(false);
    expect(visible.flatMap((item) => item.evidence).some((cite) => cite.sourceId === "src-finance")).toBe(false);
  });

  it("includes synthetic finance only for explicitly authorized demo roles", () => {
    expect(getVisibleSources(sources, "treasurer").some((source) => source.id === "src-finance")).toBe(true);
    expect(getVisibleSources(sources, "incoming").some((source) => source.id === "src-finance")).toBe(false);
  });

  it("calculates readiness from the accessible findings and explains the score", () => {
    const result = calculateReadiness(knowledge.filter((item) => item.id !== "k-finance"), 4);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.reasons).toHaveLength(3);
  });

  it("marks direct disagreements as conflicting and never auto-verifies extracted claims", () => {
    const found = extractFindings([
      { id: "source-1", filename: "readme.md", content: "Deployment target: Vercel." },
      { id: "source-2", filename: "meeting.md", content: "Decision: We moved the production deployment to Netlify." },
      { id: "source-3", filename: "tasks.csv", content: "CC-42 · Reconcile rider alerts · Assignee: Unassigned" },
    ]);
    expect(found.filter((item) => item.title.includes("deployment target")).every((item) => item.status === "CONFLICTING")).toBe(true);
    expect(found.find((item) => item.status === "MISSING_EVIDENCE")?.quote).toContain("Assignee: Unassigned");
    expect(found.some((item) => (item.status as string) === "VERIFIED")).toBe(false);
  });
});
