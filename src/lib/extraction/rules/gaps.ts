import { baseDraft, cleanTitle } from "../shared";
import type { ExtractionRule } from "../types";

/**
 * A trailing question mark marks an unresolved question. It is a gap that a
 * human must answer; it is never resolved by the extractor.
 */
export const openQuestionRule: ExtractionRule = {
  key: "gap.open-question",
  matches: (text) => /\?\s*$/.test(text),
  build: (source, chunk) => {
    const text = chunk.content.trim();
    return baseDraft(source, chunk, {
      type: "QUESTION",
      title: cleanTitle(text.replace(/\?+\s*$/, "")) || "Open question",
      description: text,
      status: "NEEDS_REVIEW",
      confidence: 0.55,
    });
  },
};
