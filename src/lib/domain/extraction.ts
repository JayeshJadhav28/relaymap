/**
 * Legacy extraction facade.
 *
 * The rule engine now lives in `src/lib/extraction/`. This module keeps the
 * original public surface (`extractFindings`, `draftToClaim`,
 * `toClaimTypeCategory`) so existing callers and the preserved upstream test
 * continue to work without behavioural change.
 *
 * Adapted from relay.ts::extractFindings in relay-knowledge-continuity (MIT).
 * Copyright (c) 2026 Relay contributors.
 */
import type { Claim, ClaimType } from "@/lib/demo/types";
import type { ExtractionDraft, ExtractedFinding } from "@/lib/extraction/types";

export type { ExtractionDraft, ExtractedFinding } from "@/lib/extraction/types";
export { applyConflictDetection, classifyChunk, extractDrafts } from "@/lib/extraction/engine";

/** Legacy shape retained for the original demo tests. */
export function extractFindings(
  records: { id: string; filename: string; content: string }[],
): ExtractedFinding[] {
  const candidates: ExtractedFinding[] = [];
  for (const record of records) {
    const lines = record.content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    lines.forEach((line, index) => {
      if (/assignee\s*:\s*unassigned|owner\s*:\s*unassigned|no owner/i.test(line)) {
        candidates.push({
          title: "Ownership needs clarification",
          category: "Unassigned task",
          description: line,
          status: "MISSING_EVIDENCE",
          confidence: 0.98,
          quote: line,
          location: `${record.filename} · line ${index + 1}`,
          sourceId: record.id,
        });
      } else if (/why (?:this|the|that) (?:decision|option)|rationale (?:is )?missing|does not record why/i.test(line)) {
        candidates.push({
          title: "Decision rationale is missing",
          category: "Decision",
          description: line,
          status: "MISSING_EVIDENCE",
          confidence: 0.82,
          quote: line,
          location: `${record.filename} · line ${index + 1}`,
          sourceId: record.id,
        });
      } else if (/deployment|deploy(?:ment)? target|decision:|blocker:|dependency:|only person|single point/i.test(line)) {
        candidates.push({
          title: /deploy/i.test(line)
            ? "Deployment target needs confirmation"
            : line.slice(0, 90),
          category: /deploy/i.test(line) ? "Technical decision" : "Project knowledge",
          description: line,
          status: "INFERRED",
          confidence: 0.58,
          quote: line,
          location: `${record.filename} · line ${index + 1}`,
          sourceId: record.id,
        });
      }
    });
  }
  const deployments = candidates.filter((item) => /deploy/i.test(item.title));
  const targets = new Set(
    deployments
      .map(
        (item) =>
          item.description.match(/\b(vercel|netlify|render|railway)\b/i)?.[1]?.toLowerCase(),
      )
      .filter(Boolean),
  );
  if (targets.size > 1) {
    for (const item of deployments) {
      item.status = "CONFLICTING";
      item.title = "Production deployment target is conflicting";
      item.confidence = 0.4;
    }
  }
  return candidates;
}

export function toClaimTypeCategory(type: ClaimType): string {
  const labels: Record<ClaimType, string> = {
    DECISION: "Decision",
    TASK: "Task",
    OWNERSHIP: "Ownership",
    DEPENDENCY: "Dependency",
    RISK: "Risk",
    BLOCKER: "Blocker",
    QUESTION: "Question",
    NEXT_ACTION: "Next action",
    MISSING_INFO: "Missing information",
    RECURRING_PROBLEM: "Recurring problem",
    NOTE: "Note",
  };
  return labels[type];
}

export function draftToClaim(
  draft: ExtractionDraft,
  claimId: string,
  projectId: string,
  now: string,
): Claim {
  return {
    id: claimId,
    projectId,
    type: draft.type,
    title: draft.title,
    description: draft.description,
    rationale: draft.rationale,
    owner: draft.owner,
    dueDate: draft.dueDate,
    priority: draft.priority ?? "medium",
    subjectKey: draft.subjectKey,
    attributes: draft.attributes,
    status: draft.status === "CONFLICTING" ? "CONFLICTING" : draft.status,
    evidenceStatus:
      draft.status === "MISSING_EVIDENCE"
        ? "MISSING_EVIDENCE"
        : draft.status === "CONFLICTING"
          ? "CONFLICTING"
          : "SUPPORTED",
    confidence: draft.confidence,
    allowedRoles: ["lead", "reviewer", "treasurer", "incoming"],
    citations: [],
    createdAt: now,
    updatedAt: now,
  };
}
