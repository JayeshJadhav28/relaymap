import type { Claim, Project, Role, Source } from "@/lib/demo/types";
import { assembleHandover, type AssemblyResult } from "@/lib/domain/handover";

export type ScribeDraft = {
  audienceRole: Role;
  assembly: AssemblyResult;
  approvedClaimCount: number;
  unresolvedClaimCount: number;
  conflicts: Claim[];
  missingEvidence: Claim[];
  blockingIssues: string[];
  /** A human must approve. The Scribe never publishes or approves. */
  readyForApproval: boolean;
  requiresHumanApproval: true;
};

/**
 * The Scribe prepares a draft from authorised records. It never publishes,
 * never approves, and never promotes an unresolved claim into a fact.
 */
export function buildScribeDraft(input: {
  project: Project;
  claims: Claim[];
  sources: Source[];
  audienceRole: Role;
}): ScribeDraft {
  const assembly = assembleHandover(input);
  const approvedClaimCount = assembly.sections.reduce(
    (total, section) => total + section.claims.length,
    0,
  );
  const conflicts = assembly.openQuestions.filter((claim) => claim.status === "CONFLICTING");
  const missingEvidence = assembly.openQuestions.filter(
    (claim) => claim.status === "MISSING_EVIDENCE",
  );

  const blockingIssues: string[] = [];
  if (approvedClaimCount === 0) {
    blockingIssues.push("No claim has been approved, so there is nothing factual to hand over.");
  }
  if (conflicts.length > 0) {
    blockingIssues.push(
      `${conflicts.length} conflicting claim(s) still need a human decision before publication.`,
    );
  }

  return {
    audienceRole: input.audienceRole,
    assembly,
    approvedClaimCount,
    unresolvedClaimCount: assembly.openQuestions.length,
    conflicts,
    missingEvidence,
    blockingIssues,
    readyForApproval: approvedClaimCount > 0,
    requiresHumanApproval: true,
  };
}
