/**
 * Evidence verification against the in-memory/demo source graph.
 *
 * Mirrors the authoritative database trigger described in
 * documentation/architecture/EVIDENCE_VERIFICATION.md. Application checks
 * exist for clear errors and to avoid unnecessary writes; in production the
 * PostgreSQL trigger remains authoritative.
 */
import type { Claim, EvidenceStatus, Source } from "@/lib/demo/types";
import { validateCitation } from "./citations";

export type EvidenceVerification = {
  ok: boolean;
  errors: string[];
  verifiedCitationIds: string[];
};

export function verifyClaimEvidence(claim: Claim, sources: Source[]): EvidenceVerification {
  const errors: string[] = [];
  const verifiedCitationIds: string[] = [];

  if (claim.citations.length === 0) {
    return {
      ok: false,
      errors: ["A claim can only be approved when it has at least one verified citation."],
      verifiedCitationIds,
    };
  }

  const sourceById = new Map(sources.map((source) => [source.id, source]));

  for (const citation of claim.citations) {
    const source = sourceById.get(citation.sourceId);
    if (!source) {
      errors.push(`Citation ${citation.id}: source is missing or inaccessible.`);
      continue;
    }
    if (source.projectId !== claim.projectId) {
      errors.push(`Citation ${citation.id}: source belongs to a different project.`);
      continue;
    }
    const result = validateCitation(source, citation);
    if (!result.valid) {
      errors.push(`Citation ${citation.id}: ${result.reason}`);
      continue;
    }
    verifiedCitationIds.push(citation.id);
  }

  return { ok: errors.length === 0 && verifiedCitationIds.length > 0, errors, verifiedCitationIds };
}

export function claimHasVerifiedEvidence(claim: Claim, sources: Source[]): boolean {
  return verifyClaimEvidence(claim, sources).ok;
}

export function evidenceStatusFor(claim: Claim, sources: Source[]): EvidenceStatus {
  if (claim.citations.length === 0) return "MISSING_EVIDENCE";
  const verification = verifyClaimEvidence(claim, sources);
  if (!verification.ok) return "MISSING_EVIDENCE";
  if (claim.status === "CONFLICTING") return "CONFLICTING";
  if (claim.citations.length === 1) return "PARTIAL";
  return "SUPPORTED";
}
