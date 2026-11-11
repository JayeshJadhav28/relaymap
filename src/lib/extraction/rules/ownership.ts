import { baseDraft, firstMatch } from "../shared";
import type { ExtractionRule } from "../types";

/**
 * An explicit "unassigned" statement is an ownership gap. It is a TASK
 * record whose evidence status is MISSING_EVIDENCE: the task exists, the
 * owner does not.
 */
export const ownershipGapRule: ExtractionRule = {
  key: "ownership.gap",
  matches: (text) =>
    /assignee\s*:\s*unassigned|owner\s*:\s*unassigned|no owner\b/i.test(text),
  build: (source, chunk) => {
    const text = chunk.content.trim();
    return baseDraft(source, chunk, {
      type: "TASK",
      title: "Ownership needs clarification",
      description: text,
      status: "MISSING_EVIDENCE",
      confidence: 0.98,
      subjectKey: "ownership-gap",
      attributes: { owner: "Unassigned" },
    });
  },
};

export const ownershipStatementRule: ExtractionRule = {
  key: "ownership.statement",
  matches: (text) => /\bmaintains\b|\bowns\b|\bresponsible for\b/i.test(text),
  build: (source, chunk) => {
    const text = chunk.content.trim();
    return baseDraft(source, chunk, {
      type: "OWNERSHIP",
      title: "Ownership statement",
      description: text,
      owner: firstMatch(text, /^([A-Z][a-z]+)\s+(?:maintains|owns|is responsible)/i),
      status: "NEEDS_REVIEW",
      confidence: 0.72,
    });
  },
};
