import { describe, expect, it } from "vitest";
import { createSeedStore } from "@/lib/demo/seed";
import { askBuddy, generateInterviewQuestions } from "@/lib/demo/service";

describe("interview generation service", () => {
  it("rejects non-reviewer roles", () => {
    const store = createSeedStore();
    const result = generateInterviewQuestions(store, {
      role: "incoming",
      actor: "Hemant Rai (incoming owner)",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("creates gap questions, audits them, and does not duplicate them", () => {
    const store = createSeedStore();
    const first = generateInterviewQuestions(store, {
      role: "lead",
      actor: "Meera Shah (project lead)",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.length).toBeGreaterThan(0);
    expect(store.audit.some((event) => event.kind === "interview.generated")).toBe(true);

    const second = generateInterviewQuestions(store, {
      role: "lead",
      actor: "Meera Shah (project lead)",
    });
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.value).toHaveLength(0);
  });
});

describe("buddy service", () => {
  it("answers only from claims visible to the asker", () => {
    const store = createSeedStore();

    const incoming = askBuddy(store, {
      question: "What is the sponsor budget?",
      role: "incoming",
    });
    expect(incoming.ok).toBe(true);
    if (incoming.ok) {
      expect(incoming.value.insufficientEvidence).toBe(true);
      expect(incoming.value.claims.some((claim) => claim.id === "k-finance")).toBe(false);
    }

    const lead = askBuddy(store, {
      question: "What is the sponsor commitment?",
      role: "lead",
    });
    expect(lead.ok).toBe(true);
    if (lead.ok) {
      expect(lead.value.claims.some((claim) => claim.id === "k-finance")).toBe(true);
      expect(lead.value.citations.length).toBeGreaterThan(0);
    }
  });

  it("rejects an empty question", () => {
    const store = createSeedStore();
    const result = askBuddy(store, { question: "  ", role: "lead" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });
});
