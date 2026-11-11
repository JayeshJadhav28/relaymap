import { baseDraft, cleanTitle } from "../shared";
import type { ExtractionRule } from "../types";

export const dependencyRule: ExtractionRule = {
  key: "dependency",
  matches: (text) => /depends on|dependency\s*:|blocked by|prerequisite/i.test(text),
  build: (source, chunk) => {
    const text = chunk.content.trim();
    return baseDraft(source, chunk, {
      type: "DEPENDENCY",
      title:
        cleanTitle(text.replace(/^.*?dependency\s*:\s*/i, "")) || "Dependency reported",
      description: text,
      status: "NEEDS_REVIEW",
      confidence: 0.7,
    });
  },
};
