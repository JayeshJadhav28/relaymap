import { baseDraft, cleanTitle, firstMatch } from "../shared";
import type { ExtractionRule } from "../types";

const DEPLOYMENT_TARGET = /\b(vercel|netlify|render|railway|fly\.io|aws|azure)\b/i;

/**
 * A recorded decision with no stated reason is a gap, not an invented
 * rationale. The claim stays MISSING_EVIDENCE.
 */
export const missingRationaleRule: ExtractionRule = {
  key: "decision.missing-rationale",
  matches: (text) =>
    /rationale (?:is )?missing|does not record why|no (?:recorded )?rationale/i.test(text),
  build: (source, chunk) => {
    const text = chunk.content.trim();
    return baseDraft(source, chunk, {
      type: "DECISION",
      title: "Decision rationale is missing",
      description: text,
      status: "MISSING_EVIDENCE",
      confidence: 0.82,
      subjectKey: "decision-rationale",
    });
  },
};

export const deploymentDecisionRule: ExtractionRule = {
  key: "decision.deployment-target",
  matches: (text) => /deploy/i.test(text),
  build: (source, chunk) => {
    const text = chunk.content.trim();
    const target = firstMatch(text, DEPLOYMENT_TARGET)?.toLowerCase();
    return baseDraft(source, chunk, {
      type: "DECISION",
      title: target
        ? `Deployment target recorded as ${target}`
        : "Deployment target needs confirmation",
      description: text,
      status: "NEEDS_REVIEW",
      confidence: 0.62,
      subjectKey: "deployment-target",
      attributes: target ? { target } : {},
    });
  },
};

export const explicitDecisionRule: ExtractionRule = {
  key: "decision.explicit",
  matches: (text) => /decision\s*:/i.test(text),
  build: (source, chunk) => {
    const text = chunk.content.trim();
    return baseDraft(source, chunk, {
      type: "DECISION",
      title: cleanTitle(text.replace(/^.*?decision\s*:\s*/i, "")) || "Decision recorded",
      description: text,
      status: "NEEDS_REVIEW",
      confidence: 0.68,
      subjectKey: `decision:${cleanTitle(text).toLowerCase().slice(0, 40)}`,
    });
  },
};
