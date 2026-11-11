import type { Claim } from "@/lib/demo/types";

export type GapKind =
  | "missing_rationale"
  | "ownership"
  | "conflict"
  | "missing_evidence"
  | "unresolved_question"
  | "knowledge_concentration";

export type GapQuestion = {
  claimId?: string;
  gap: GapKind;
  question: string;
  rationale: string;
};

function normalise(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").replace(/[?.!]+$/, "").trim();
}

/**
 * The Interviewer asks one focused question per identified gap. It does not
 * answer on the departing member's behalf and it never asks for secrets.
 */
export function generateGapQuestions(
  claims: Claim[],
  existingQuestions: string[] = [],
): GapQuestion[] {
  const seen = new Set(existingQuestions.map(normalise));
  const questions: GapQuestion[] = [];

  const push = (question: GapQuestion) => {
    const key = normalise(question.question);
    if (seen.has(key)) return;
    seen.add(key);
    questions.push(question);
  };

  for (const claim of claims) {
    if (claim.status === "REJECTED" || claim.status === "SUPERSEDED") continue;

    if (claim.status === "CONFLICTING") {
      push({
        claimId: claim.id,
        gap: "conflict",
        question: `Which record is current for "${claim.title}", and why was the other one changed?`,
        rationale:
          "Two or more source records disagree. A human must choose the current position and record the reason.",
      });
      continue;
    }

    if (claim.type === "DECISION" && (claim.status === "MISSING_EVIDENCE" || !claim.rationale)) {
      push({
        claimId: claim.id,
        gap: "missing_rationale",
        question: `Why was "${claim.title}" chosen, and which alternatives were considered?`,
        rationale:
          "The source records the decision but not the reasoning. The reason must not be guessed.",
      });
      continue;
    }

    if (claim.type === "TASK" && (!claim.owner || /unassigned/i.test(claim.owner))) {
      push({
        claimId: claim.id,
        gap: "ownership",
        question: `Who will own "${claim.title}" after the handover?`,
        rationale: "The task is recorded without a confirmed owner.",
      });
      continue;
    }

    if (claim.type === "RISK" && claim.subjectKey === "knowledge-concentration") {
      push({
        claimId: claim.id,
        gap: "knowledge_concentration",
        question: `What is the recovery procedure if the person who currently holds this knowledge is unavailable?`,
        rationale:
          "Knowledge is concentrated in one person. A backup procedure reduces the transfer risk.",
      });
      continue;
    }

    if (claim.type === "QUESTION") {
      push({
        claimId: claim.id,
        gap: "unresolved_question",
        question: claim.title.endsWith("?") ? claim.title : `${claim.title}?`,
        rationale: "The source records an open question that no later record answers.",
      });
      continue;
    }

    if (claim.status === "MISSING_EVIDENCE") {
      push({
        claimId: claim.id,
        gap: "missing_evidence",
        question: `Which document or record supports "${claim.title}"?`,
        rationale: "The claim currently has no verifiable evidence.",
      });
    }
  }

  return questions;
}
