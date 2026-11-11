/**
 * Handover assembly and immutable versioning.
 *
 * The handover is assembled from the recipient's permissions, never from the
 * author's. Approved claims become factual sections; unresolved claims are
 * surfaced separately as open questions and are never presented as facts.
 */
import type {
  Acknowledgement,
  Claim,
  ClaimType,
  Handover,
  HandoverSection,
  HandoverVersion,
  Project,
  Readiness,
  Role,
  Source,
} from "@/lib/demo/types";
import { redactClaimsForRole } from "./redaction";
import { sha256 } from "./hash";

export const HANDOVER_SECTIONS: Omit<HandoverSection, "claims">[] = [
  {
    key: "overview",
    title: "Project overview and current state",
    description: "What the project is and where it stands at handover.",
  },
  {
    key: "decisions",
    title: "Decisions and reasoning",
    description: "Approved decisions with their evidence and recorded rationale.",
  },
  {
    key: "tasks",
    title: "Outstanding work and next actions",
    description: "Approved tasks, owners, due dates and defined next actions.",
  },
  {
    key: "ownership",
    title: "Responsibilities and ownership",
    description: "Who owns which area and where ownership is missing.",
  },
  {
    key: "risks",
    title: "Risks, blockers and dependencies",
    description: "Known risks, operational blockers and cross-team dependencies.",
  },
  {
    key: "open",
    title: "Unresolved questions and missing context",
    description: "Items that need a human answer before they become handover facts.",
  },
];

const SECTION_BY_TYPE: Record<ClaimType, string> = {
  DECISION: "decisions",
  TASK: "tasks",
  NEXT_ACTION: "tasks",
  OWNERSHIP: "ownership",
  RISK: "risks",
  BLOCKER: "risks",
  DEPENDENCY: "risks",
  QUESTION: "open",
  MISSING_INFO: "open",
  RECURRING_PROBLEM: "open",
  NOTE: "overview",
};

export function sectionKeyForClaim(type: ClaimType): string {
  return SECTION_BY_TYPE[type];
}

export type AssemblyInput = {
  project: Project;
  claims: Claim[];
  sources: Source[];
  audienceRole: Role;
};

export type AssemblyResult = {
  sections: HandoverSection[];
  openQuestions: Claim[];
  includedClaimIds: string[];
  excludedCount: number;
  contentHash: string;
};

export function assembleHandover(input: AssemblyInput): AssemblyResult {
  const redacted = redactClaimsForRole(input.claims, input.sources, input.audienceRole);

  const approved = redacted.visible.filter((claim) => claim.status === "APPROVED");
  const unresolved = redacted.visible.filter(
    (claim) =>
      claim.status === "NEEDS_REVIEW" ||
      claim.status === "INFERRED" ||
      claim.status === "CONFLICTING" ||
      claim.status === "MISSING_EVIDENCE",
  );

  const sections = HANDOVER_SECTIONS.map((section) => ({
    ...section,
    claims: approved.filter((claim) => sectionKeyForClaim(claim.type) === section.key),
  }));

  const openQuestions = unresolved;

  const includedClaimIds = [
    ...sections.flatMap((section) => section.claims.map((claim) => claim.id)),
    ...openQuestions.map((claim) => claim.id),
  ];

  const contentHash = sha256(
    JSON.stringify({
      projectId: input.project.id,
      audienceRole: input.audienceRole,
      sections: sections.map((section) => ({
        key: section.key,
        claims: section.claims.map((claim) => ({
          id: claim.id,
          title: claim.title,
          description: claim.description,
          citations: claim.citations.map((citation) => ({
            sourceId: citation.sourceId,
            chunkId: citation.chunkId,
            quote: citation.quote,
            quoteHash: citation.quoteHash,
          })),
        })),
      })),
      openQuestions: openQuestions.map((claim) => claim.id),
    }),
  );

  return {
    sections,
    openQuestions,
    includedClaimIds,
    excludedCount: redacted.excludedCount,
    contentHash,
  };
}

export function nextVersionNumber(handover: Handover): number {
  return handover.versions.length + 1;
}

export function createHandoverVersion(input: {
  id: string;
  handover: Handover;
  audienceRole: Role;
  createdBy: string;
  createdAt: string;
  readiness: Readiness;
  assembly: AssemblyResult;
  approvedBy?: string;
  approvedAt?: string;
  publishedAt?: string;
}): HandoverVersion {
  return {
    id: input.id,
    handoverId: input.handover.id,
    version: nextVersionNumber(input.handover),
    audienceRole: input.audienceRole,
    createdAt: input.createdAt,
    createdBy: input.createdBy,
    approvedAt: input.approvedAt,
    approvedBy: input.approvedBy,
    publishedAt: input.publishedAt,
    // Deep snapshots: a published version must not change when a claim is later
    // edited or superseded in the live store.
    readiness: structuredClone(input.readiness),
    sections: structuredClone(input.assembly.sections),
    openQuestions: structuredClone(input.assembly.openQuestions),
    claimIds: [...input.assembly.includedClaimIds],
    excludedCount: input.assembly.excludedCount,
    contentHash: input.assembly.contentHash,
  };
}

export function publishHandover(handover: Handover, versionId: string, publishedAt: string): Handover {
  const version = handover.versions.find((item) => item.id === versionId);
  if (!version) throw new Error("Handover version not found.");
  if (version.publishedAt) throw new Error("A published handover version is immutable.");
  const immutableVersion: HandoverVersion = { ...version, publishedAt };
  return {
    ...handover,
    status: "published",
    currentVersionId: immutableVersion.id,
    versions: handover.versions.map((item) =>
      item.id === immutableVersion.id ? immutableVersion : item,
    ),
  };
}

export function acknowledgeHandover(input: {
  id: string;
  handover: Handover;
  versionId: string;
  acknowledgedBy: string;
  role: Role;
  note: string;
  at: string;
}): Acknowledgement {
  const version = input.handover.versions.find((item) => item.id === input.versionId);
  if (!version) throw new Error("Handover version not found.");
  if (!version.publishedAt) throw new Error("Only a published handover can be acknowledged.");
  return {
    id: input.id,
    handoverId: input.handover.id,
    versionId: input.versionId,
    acknowledgedBy: input.acknowledgedBy,
    role: input.role,
    note: input.note,
    at: input.at,
  };
}

export function latestVersion(handover: Handover): HandoverVersion | undefined {
  if (!handover.versions.length) return undefined;
  return [...handover.versions].sort((a, b) => b.version - a.version)[0];
}
