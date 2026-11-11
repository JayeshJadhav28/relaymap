import type {
  ClaimType,
  EvidenceStatus,
  Role,
  VerificationStatus,
} from "@/lib/demo/types";

export const ROLE_LABEL: Record<Role, string> = {
  lead: "Project lead",
  reviewer: "Reviewer",
  treasurer: "Treasurer",
  incoming: "Incoming owner",
};

export const ROLE_CAPTION: Record<Role, string> = {
  lead: "Full project access, can review, generate and publish handovers.",
  reviewer: "Can read project material and approve or reject claims.",
  treasurer: "Includes the synthetic finance source; read-only review access.",
  incoming: "Receives only published handover material for the incoming role.",
};

export const STATUS_LABEL: Record<VerificationStatus, string> = {
  APPROVED: "Approved",
  INFERRED: "Inferred",
  NEEDS_REVIEW: "Needs review",
  CONFLICTING: "Conflicting",
  MISSING_EVIDENCE: "Missing evidence",
  REJECTED: "Rejected",
  SUPERSEDED: "Superseded",
};

export const STATUS_TONE: Record<VerificationStatus, string> = {
  APPROVED: "positive",
  INFERRED: "warn",
  NEEDS_REVIEW: "neutral",
  CONFLICTING: "danger",
  MISSING_EVIDENCE: "danger",
  REJECTED: "muted",
  SUPERSEDED: "muted",
};

export const EVIDENCE_LABEL: Record<EvidenceStatus, string> = {
  SUPPORTED: "Supported",
  PARTIAL: "Partial evidence",
  MISSING_EVIDENCE: "Missing evidence",
  CONFLICTING: "Conflicting evidence",
};

export const CLAIM_TYPE_LABEL: Record<ClaimType, string> = {
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

export function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

export function formatDay(iso: string | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function shortHash(hash: string): string {
  return hash.replace(/^sha256:/, "").slice(0, 12);
}
