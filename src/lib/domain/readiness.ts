/**
 * Deterministic handover readiness.
 *
 * Adapted from relay.ts::calculateReadiness in relay-knowledge-continuity
 * (MIT). Copyright (c) 2026 Relay contributors.
 *
 * RelayMap uses the brief's fixed 25/25/15/15/10/10 rubric. Every component
 * returns the points earned, the maximum, and a human-readable reason. The
 * score is a signal, never a guarantee of successful knowledge transfer.
 */
import type {
  Acknowledgement,
  Claim,
  Handover,
  Readiness,
  ReadinessComponent,
  Source,
} from "@/lib/demo/types";
import { validateClaimCitations } from "./citations";

export const READINESS_WEIGHTS = {
  evidenceCoverage: 25,
  reviewCompletion: 25,
  ownershipCoverage: 15,
  conflictResolution: 15,
  criticalNextActions: 10,
  acknowledgement: 10,
} as const;

export const READINESS_CAVEAT =
  "A readiness score is a signal, not a guarantee of successful knowledge transfer.";

export type ReadinessInput = {
  claims: Claim[];
  sources: Source[];
  handovers: Handover[];
  acknowledgements: Acknowledgement[];
};

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function component(
  key: keyof typeof READINESS_WEIGHTS,
  label: string,
  earned: number,
  reason: string,
): ReadinessComponent {
  const max = READINESS_WEIGHTS[key];
  const bounded = Math.max(0, Math.min(max, round(earned)));
  return { key, label, earned: bounded, max, reason };
}

function isActive(claim: Claim): boolean {
  return claim.status !== "REJECTED" && claim.status !== "SUPERSEDED";
}

function isOpen(claim: Claim): boolean {
  return (
    claim.status === "NEEDS_REVIEW" ||
    claim.status === "INFERRED" ||
    claim.status === "CONFLICTING" ||
    claim.status === "MISSING_EVIDENCE"
  );
}

export function calculateReadiness(input: ReadinessInput): Readiness {
  const active = input.claims.filter(isActive);
  const total = active.length;

  if (total === 0) {
    return {
      score: 0,
      components: [
        component("evidenceCoverage", "Evidence coverage", 0, "No accessible claims exist."),
        component("reviewCompletion", "Review completion", 0, "No claims are available for review."),
        component("ownershipCoverage", "Ownership coverage", 0, "No tasks are available."),
        component("conflictResolution", "Conflict resolution", 0, "No conflicts can be assessed."),
        component("criticalNextActions", "Critical next actions", 0, "No next actions are defined."),
        component("acknowledgement", "Acknowledgement", 0, "No handover has been acknowledged."),
      ],
      reasons: ["No accessible knowledge has been reviewed yet."],
      caveat: READINESS_CAVEAT,
    };
  }

  const withValidEvidence = active.filter((claim) => {
    if (claim.citations.length === 0) return false;
    return (
      validateClaimCitations(claim, input.sources).valid &&
      claim.citations.some((citation) => citation.verification === "VERIFIED")
    );
  }).length;
  const evidenceEarned =
    (withValidEvidence / total) * READINESS_WEIGHTS.evidenceCoverage;

  const approved = active.filter((claim) => claim.status === "APPROVED").length;
  const reviewEarned = (approved / total) * READINESS_WEIGHTS.reviewCompletion;

  const tasks = active.filter(
    (claim) => claim.type === "TASK" || claim.type === "NEXT_ACTION",
  );
  const ownedTasks = tasks.filter((claim) => Boolean(claim.owner)).length;
  const ownershipEarned = tasks.length
    ? (ownedTasks / tasks.length) * READINESS_WEIGHTS.ownershipCoverage
    : READINESS_WEIGHTS.ownershipCoverage;

  const unresolved = active.filter(
    (claim) =>
      claim.status === "CONFLICTING" ||
      claim.status === "MISSING_EVIDENCE" ||
      claim.evidenceStatus === "CONFLICTING" ||
      claim.evidenceStatus === "MISSING_EVIDENCE",
  );
  const conflictRatio = unresolved.length / total;
  const conflictEarned =
    (1 - conflictRatio) * READINESS_WEIGHTS.conflictResolution;

  const actions = active.filter(
    (claim) => claim.type === "NEXT_ACTION" || claim.type === "TASK",
  );
  const actionable = actions.filter(
    (claim) => Boolean(claim.owner) && Boolean(claim.dueDate),
  ).length;
  const actionEarned = actions.length
    ? (actionable / actions.length) * READINESS_WEIGHTS.criticalNextActions
    : READINESS_WEIGHTS.criticalNextActions;

  const published = input.handovers.filter(
    (handover) => handover.status === "published" && handover.currentVersionId,
  );
  const acknowledged = published.filter((handover) =>
    input.acknowledgements.some(
      (ack) =>
        ack.handoverId === handover.id &&
        ack.versionId === handover.currentVersionId,
    ),
  ).length;
  const acknowledgementEarned = published.length
    ? (acknowledged / published.length) * READINESS_WEIGHTS.acknowledgement
    : 0;

  const components: ReadinessComponent[] = [
    component(
      "evidenceCoverage",
      "Evidence coverage",
      evidenceEarned,
      `${withValidEvidence} of ${total} accessible claims have exact, chunk-bound evidence.`,
    ),
    component(
      "reviewCompletion",
      "Review completion",
      reviewEarned,
      `${approved} of ${total} accessible claims have been approved by a reviewer.`,
    ),
    component(
      "ownershipCoverage",
      "Ownership coverage",
      ownershipEarned,
      `${ownedTasks} of ${tasks.length} tasks have a named owner.`,
    ),
    component(
      "conflictResolution",
      "Conflict resolution",
      conflictEarned,
      `${unresolved.length} of ${total} claims are still conflicting or missing evidence.`,
    ),
    component(
      "criticalNextActions",
      "Critical next actions",
      actionEarned,
      `${actionable} of ${actions.length} tasks have both an owner and a due date.`,
    ),
    component(
      "acknowledgement",
      "Acknowledgement",
      acknowledgementEarned,
      published.length
        ? `${acknowledged} of ${published.length} published handovers have been acknowledged.`
        : "No handover has been published yet.",
    ),
  ];

  const reasons = components.map((item) => item.reason);
  const openCount = active.filter(isOpen).length;
  if (openCount > 0) {
    reasons.push(`${openCount} claim(s) still require a human decision before the handover is complete.`);
  }
  reasons.push(READINESS_CAVEAT);

  const score = Math.round(
    Math.max(0, Math.min(100, components.reduce((sum, item) => sum + item.earned, 0))),
  );

  return { score, components, reasons, caveat: READINESS_CAVEAT };
}
