import { describe, expect, it } from "vitest";
import { createSeedStore } from "@/lib/demo/seed";
import type { Chunk, Source } from "@/lib/demo/types";
import { classifyChunk, extractDrafts, EXTRACTION_RULES } from "./engine";

function sourceWith(text: string): { source: Source; chunk: Chunk } {
  const source: Source = {
    id: "src-rule-test",
    projectId: "proj-rule-test",
    title: "rule-test.md",
    kind: "md",
    access: "project",
    allowedRoles: ["lead", "reviewer", "treasurer", "incoming"],
    content: text,
    chunks: [],
    hash: "sha256:test",
    createdAt: "2026-11-10T00:00:00.000Z",
    createdBy: "Test",
    synthetic: true,
    extracted: false,
  };
  const chunk: Chunk = {
    id: "chunk-rule-test-001",
    sourceId: source.id,
    projectId: source.projectId,
    index: 0,
    page: null,
    section: "Rule test",
    content: text,
    charStart: 0,
    charEnd: text.length,
    hash: "sha256:chunk",
  };
  source.chunks = [chunk];
  return { source, chunk };
}

function classify(text: string) {
  const { source, chunk } = sourceWith(text);
  return classifyChunk(source, chunk);
}

describe("extraction rule engine", () => {
  it("registers a stable, ordered rule set", () => {
    expect(EXTRACTION_RULES.map((rule) => rule.key)).toEqual([
      "ownership.gap",
      "decision.missing-rationale",
      "risk.knowledge-concentration",
      "risk.blocker",
      "dependency",
      "decision.deployment-target",
      "decision.explicit",
      "task",
      "ownership.statement",
      "gap.open-question",
    ]);
  });

  it("always binds the quotation to the exact chunk", () => {
    const text = "Deployment target: Railway.";
    const draft = classify(text)!;
    expect(draft.quote).toBe(text);
    expect(draft.chunkId).toBe("chunk-rule-test-001");
    expect(draft.sourceId).toBe("src-rule-test");
    expect(draft.location).toContain("Rule test");
  });

  it("classifies an unassigned owner as an ownership gap before a task", () => {
    const draft = classify("CC-42 · Reconcile alerts · Status: Open · Assignee: Unassigned")!;
    expect(draft.type).toBe("TASK");
    expect(draft.status).toBe("MISSING_EVIDENCE");
    expect(draft.subjectKey).toBe("ownership-gap");
  });

  it("never invents a missing decision rationale", () => {
    const draft = classify("The meeting does not record why the new importer was chosen.")!;
    expect(draft.type).toBe("DECISION");
    expect(draft.status).toBe("MISSING_EVIDENCE");
    expect(draft.rationale).toBeUndefined();
  });

  it("extracts risks, blockers, dependencies and ownership statements", () => {
    expect(classify("Aarav is the only person who knows the import process.")?.type).toBe(
      "RISK",
    );
    expect(classify("Blocker: staging credentials expired.")?.type).toBe("BLOCKER");
    expect(classify("The pilot depends on rider-alert reconciliation.")?.type).toBe(
      "DEPENDENCY",
    );
    expect(classify("Aarav maintains the route import workflow.")?.type).toBe("OWNERSHIP");
  });

  it("extracts deployment decisions and explicit decisions", () => {
    expect(classify("Deployment target: Vercel.")?.attributes?.target).toBe("vercel");
    expect(classify("Decision: move the pilot to Netlify.")?.type).toBe("DECISION");
  });

  it("extracts tasks with owner, status and due date", () => {
    const draft = classify(
      "CC-31 · Document route import · Status: In progress · Assignee: Aarav · Due: 2026-11-04 · Priority: high",
    )!;
    expect(draft.type).toBe("TASK");
    expect(draft.owner).toBe("Aarav");
    expect(draft.dueDate).toBe("2026-11-04");
    expect(draft.priority).toBe("high");
    expect(draft.attributes?.taskStatus).toBe("in progress");
  });

  it("extracts open questions", () => {
    expect(classify("Who can own rider-alert reconciliation?")?.type).toBe("QUESTION");
  });

  it("returns null for text that matches no rule", () => {
    expect(classify("The weather was pleasant.")).toBeNull();
    expect(classify("   ")).toBeNull();
  });

  it("flags conflicting deployment targets without approving either", () => {
    const drafts = extractDrafts([
      sourceWith("Deployment target: Vercel.").source,
      sourceWith("Deployment target: Netlify.").source,
    ]);
    expect(drafts).toHaveLength(2);
    expect(drafts.every((draft) => draft.status === "CONFLICTING")).toBe(true);
    expect(drafts.every((draft) => draft.attributes?.conflict === "netlify,vercel")).toBe(true);
  });

  it("produces deterministic output for the seed sources", () => {
    const store = createSeedStore();
    expect(extractDrafts(store.sources)).toEqual(extractDrafts(store.sources));
  });
});
