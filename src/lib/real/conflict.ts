import type { Claim } from "@/lib/demo/types";

/**
 * Demo parity: two deployment targets on the same project are a visible
 * conflict even when they arrived in separate uploads. The database remains the
 * system of record; this read-time reconciliation never invents evidence and
 * never overrides a human decision.
 */
export function reconcileDeploymentConflicts(claims: Claim[]): Claim[] {
  const group = claims.filter(
    (claim) => claim.subjectKey === "deployment-target" && claim.attributes?.target,
  );
  const targets = new Set(
    group
      .map((claim) => (claim.attributes?.target ?? "").trim().toLowerCase())
      .filter(Boolean),
  );
  if (targets.size <= 1) return claims;
  const joined = [...targets].sort().join(",");
  return claims.map((claim) => {
    if (!group.includes(claim)) return claim;
    if (["APPROVED", "REJECTED", "SUPERSEDED"].includes(claim.status)) return claim;
    return {
      ...claim,
      status: "CONFLICTING",
      evidenceStatus: "CONFLICTING",
      confidence: Math.min(claim.confidence, 0.4),
      attributes: { ...claim.attributes, conflict: joined },
    };
  });
}
