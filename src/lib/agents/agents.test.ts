import { describe, expect, it } from "vitest";
import { answerFromKnowledge } from "./buddy";
import { generateGapQuestions } from "./interviewer";
import { buildScribeDraft } from "./scribe";
import { createSeedStore } from "@/lib/demo/seed";

describe("interviewer", () => {
  const store = createSeedStore();

  it("asks about a conflict, a missing rationale and unowned work", () => {
    const questions = generateGapQuestions(store.claims);
    const gaps = new Set(questions.map((question) => question.gap));
    expect(gaps.has("conflict")).toBe(true);
    expect(gaps.has("missing_rationale")).toBe(true);
    expect(gaps.has("ownership")).toBe(true);
  });

  it("deduplicates against questions that already exist", () => {
    const first = generateGapQuestions(store.claims);
    const second = generateGapQuestions(
      store.claims,
      first.map((question) => question.question),
    );
    expect(second).toHaveLength(0);
  });

  it("never asks for secret values", () => {
    const text = generateGapQuestions(store.claims)
      .map((question) => question.question.toLowerCase())
      .join(" ");
    expect(text).not.toMatch(/password|secret|token|api key/);
  });
});

describe("scribe", () => {
  const store = createSeedStore();

  it("assembles only approved claims and never auto-approves", () => {
    const draft = buildScribeDraft({
      project: store.project,
      claims: store.claims,
      sources: store.sources,
      audienceRole: "incoming",
    });

    expect(draft.requiresHumanApproval).toBe(true);
    expect(draft.approvedClaimCount).toBeGreaterThan(0);
    expect(draft.assembly.sections.length).toBe(6);
    expect(draft.assembly.excludedCount).toBeGreaterThan(0);

    const includedIds = draft.assembly.sections.flatMap((section) =>
      section.claims.map((claim) => claim.id),
    );
    expect(includedIds).not.toContain("k-finance");
    for (const id of includedIds) {
      expect(store.claims.find((claim) => claim.id === id)?.status).toBe("APPROVED");
    }
  });

  it("reports conflicts as blocking issues", () => {
    const draft = buildScribeDraft({
      project: store.project,
      claims: store.claims,
      sources: store.sources,
      audienceRole: "incoming",
    });
    expect(draft.conflicts.length).toBeGreaterThan(0);
    expect(draft.blockingIssues.join(" ")).toContain("conflicting claim");
  });
});

describe("buddy", () => {
  const store = createSeedStore();

  it("answers from recorded knowledge and cites exact quotations", () => {
    const answer = answerFromKnowledge("Which deployment target is current?", store.claims);
    expect(answer.insufficientEvidence).toBe(false);
    expect(answer.claims.length).toBeGreaterThan(0);
    expect(answer.citations.length).toBeGreaterThan(0);
    for (const citation of answer.citations) {
      expect(citation.quote.length).toBeGreaterThan(0);
      expect(citation.chunkId).toContain("chunk-");
    }
  });

  it("labels unreviewed records instead of presenting them as settled", () => {
    const answer = answerFromKnowledge("who owns rider alerts", store.claims);
    expect(answer.needsReview).toBe(true);
    expect(answer.answer).toContain("awaiting human review");
  });

  it("refuses to invent an answer when nothing matches", () => {
    const answer = answerFromKnowledge("What is the lunar catering menu?", store.claims);
    expect(answer.insufficientEvidence).toBe(true);
    expect(answer.citations).toHaveLength(0);
    expect(answer.answer).toContain("do not have an evidence-backed answer");
  });

  it("never returns finance knowledge to a caller that did not pass it", () => {
    const withoutFinance = store.claims.filter((claim) => claim.id !== "k-finance");
    const answer = answerFromKnowledge("sponsor budget", withoutFinance);
    expect(answer.claims.some((claim) => claim.id === "k-finance")).toBe(false);
  });
});
