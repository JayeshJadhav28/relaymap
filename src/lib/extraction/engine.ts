import type { Chunk, Source } from "@/lib/demo/types";
import { openQuestionRule } from "./rules/gaps";
import { dependencyRule } from "./rules/dependencies";
import {
  deploymentDecisionRule,
  explicitDecisionRule,
  missingRationaleRule,
} from "./rules/decisions";
import { ownershipGapRule, ownershipStatementRule } from "./rules/ownership";
import { blockerRule, knowledgeConcentrationRule } from "./rules/risks";
import { taskRule } from "./rules/tasks";
import type { ExtractionDraft, ExtractionRule } from "./types";

export type { ExtractionDraft, ExtractionRule, ExtractedFinding } from "./types";

/**
 * Rule order is part of the contract. More specific rules run before general
 * ones so, for example, an unassigned task is classified as an ownership gap
 * rather than a generic task.
 */
export const EXTRACTION_RULES: ExtractionRule[] = [
  ownershipGapRule,
  missingRationaleRule,
  knowledgeConcentrationRule,
  blockerRule,
  dependencyRule,
  deploymentDecisionRule,
  explicitDecisionRule,
  taskRule,
  ownershipStatementRule,
  openQuestionRule,
];

/**
 * Classifies a single chunk. Returns null when no supported rule matches.
 * Chunk-level classification keeps every quotation bound to one location.
 */
export function classifyChunk(source: Source, chunk: Chunk): ExtractionDraft | null {
  const text = chunk.content.trim();
  if (!text) return null;
  const rule = EXTRACTION_RULES.find((candidate) => candidate.matches(text));
  return rule ? rule.build(source, chunk) : null;
}

/**
 * Applies cross-chunk conflict detection. Only explicit disagreements on the
 * same subject key produce CONFLICTING. No claim is upgraded to APPROVED.
 */
export function applyConflictDetection(drafts: ExtractionDraft[]): ExtractionDraft[] {
  const deployments = drafts.filter(
    (draft) => draft.subjectKey === "deployment-target" && draft.attributes?.target,
  );
  const targets = new Set(deployments.map((draft) => draft.attributes?.target));
  if (targets.size > 1) {
    for (const draft of deployments) {
      draft.status = "CONFLICTING";
      draft.title = "Production deployment target is conflicting";
      draft.confidence = 0.4;
      draft.attributes = { ...draft.attributes, conflict: [...targets].sort().join(",") };
    }
  }
  return drafts;
}

export function extractDrafts(sources: Source[]): ExtractionDraft[] {
  const drafts: ExtractionDraft[] = [];
  const seen = new Set<string>();
  for (const source of sources) {
    for (const chunk of source.chunks) {
      const draft = classifyChunk(source, chunk);
      if (!draft) continue;
      const key = `${draft.sourceId}:${draft.chunkId}:${draft.type}:${draft.quote}`;
      if (seen.has(key)) continue;
      seen.add(key);
      drafts.push(draft);
    }
  }
  return applyConflictDetection(drafts);
}
