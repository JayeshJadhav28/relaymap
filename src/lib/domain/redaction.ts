/**
 * Role-aware redaction.
 *
 * Adapted from relay.ts::redactForRole and getVisibleSources in
 * relay-knowledge-continuity (MIT). Copyright (c) 2026 Relay contributors.
 *
 * A claim is only visible when the role is explicitly allowed AND every
 * citation comes from a source the role may read. Partial redaction of a
 * claim's evidence is never performed because a claim with invisible evidence
 * would still disclose the restricted fact in its summary.
 */
import type { Claim, Role, Source } from "@/lib/demo/types";

export function canRoleAccessSource(source: Pick<Source, "allowedRoles">, role: Role): boolean {
  return source.allowedRoles.includes(role);
}

export function visibleSourcesForRole(sources: Source[], role: Role): Source[] {
  return sources.filter((source) => canRoleAccessSource(source, role));
}

export function visibleSourceIdsForRole(sources: Source[], role: Role): Set<string> {
  return new Set(visibleSourcesForRole(sources, role).map((source) => source.id));
}

export type RedactionResult = {
  visible: Claim[];
  excluded: Claim[];
  excludedCount: number;
};

export function redactClaimsForRole(claims: Claim[], sources: Source[], role: Role): RedactionResult {
  const allowedSources = visibleSourceIdsForRole(sources, role);
  const visible: Claim[] = [];
  const excluded: Claim[] = [];

  for (const claim of claims) {
    const roleAllowed = claim.allowedRoles.includes(role);
    const evidenceAllowed = claim.citations.every((citation) =>
      allowedSources.has(citation.sourceId),
    );
    if (roleAllowed && evidenceAllowed) {
      visible.push(claim);
    } else {
      excluded.push(claim);
    }
  }

  return { visible, excluded, excludedCount: excluded.length };
}

/**
 * Filters claims for an explicit set of readable sources. Used by handover
 * assembly where the recipient role has already been resolved.
 */
export function redactClaimsForSourceIds(claims: Claim[], allowedSourceIds: Set<string>): Claim[] {
  return claims.filter((claim) =>
    claim.citations.every((citation) => allowedSourceIds.has(citation.sourceId)),
  );
}
