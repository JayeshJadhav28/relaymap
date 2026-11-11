import { baseDraft, cleanTitle, firstMatch } from "../shared";
import type { ExtractionRule } from "../types";

/**
 * Knowledge concentration is a risk signal, never a statement about a
 * person's productivity or understanding.
 */
export const knowledgeConcentrationRule: ExtractionRule = {
  key: "risk.knowledge-concentration",
  matches: (text) =>
    /only person|single point of failure|bus[- ]?factor|concentrated knowledge/i.test(text),
  build: (source, chunk) => {
    const text = chunk.content.trim();
    return baseDraft(source, chunk, {
      type: "RISK",
      title: "Knowledge concentration risk",
      description: text,
      status: "NEEDS_REVIEW",
      confidence: 0.9,
      subjectKey: "knowledge-concentration",
      owner: firstMatch(text, /(?:only person who knows|depends on)\s+([A-Z][a-z]+)/i),
    });
  },
};

export const blockerRule: ExtractionRule = {
  key: "risk.blocker",
  matches: (text) => /blocker\s*:/i.test(text),
  build: (source, chunk) => {
    const text = chunk.content.trim();
    return baseDraft(source, chunk, {
      type: "BLOCKER",
      title: cleanTitle(text.replace(/^.*?blocker\s*:\s*/i, "")) || "Blocker reported",
      description: text,
      status: "NEEDS_REVIEW",
      confidence: 0.75,
    });
  },
};
