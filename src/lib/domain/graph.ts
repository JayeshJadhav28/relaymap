/**
 * Graph relationship rules and bounded impact traversal.
 *
 * Concepts studied from ECHO (no licence; conceptual reference only) and
 * independently reimplemented for PostgreSQL-compatible relationship data.
 */
import type {
  Claim,
  ClaimType,
  ImpactNode,
  Relation,
  Relationship,
} from "@/lib/demo/types";

export const RELATION_ALLOWLIST: Record<Relation, { from: ClaimType[]; to: ClaimType[] }> = {
  DEPENDS_ON: {
    from: ["TASK", "NEXT_ACTION", "QUESTION", "DEPENDENCY"],
    to: ["TASK", "NEXT_ACTION", "DECISION"],
  },
  AFFECTS: {
    from: ["DECISION", "RISK", "BLOCKER", "DEPENDENCY", "RECURRING_PROBLEM"],
    to: [
      "DECISION",
      "TASK",
      "NEXT_ACTION",
      "RISK",
      "BLOCKER",
      "DEPENDENCY",
      "OWNERSHIP",
      "QUESTION",
    ],
  },
  OWNS: { from: ["OWNERSHIP"], to: ["TASK", "DECISION", "RISK", "DEPENDENCY"] },
  WORKED_ON: { from: ["OWNERSHIP"], to: ["TASK", "DECISION"] },
  SUPERSEDES: { from: ["DECISION"], to: ["DECISION"] },
  PART_OF: { from: ["TASK", "NEXT_ACTION"], to: ["TASK", "DECISION"] },
  ABOUT: {
    from: [
      "DECISION",
      "TASK",
      "OWNERSHIP",
      "DEPENDENCY",
      "RISK",
      "BLOCKER",
      "QUESTION",
      "NEXT_ACTION",
      "MISSING_INFO",
      "RECURRING_PROBLEM",
      "NOTE",
    ],
    to: ["DECISION", "TASK", "RISK", "DEPENDENCY", "QUESTION", "RECURRING_PROBLEM"],
  },
  SUPPORTED_BY: {
    from: [
      "DECISION",
      "TASK",
      "OWNERSHIP",
      "DEPENDENCY",
      "RISK",
      "BLOCKER",
      "QUESTION",
      "NEXT_ACTION",
      "MISSING_INFO",
      "RECURRING_PROBLEM",
      "NOTE",
    ],
    to: ["DECISION", "TASK", "RISK", "DEPENDENCY", "QUESTION"],
  },
  BLOCKS: { from: ["RISK", "BLOCKER", "DEPENDENCY"], to: ["TASK", "DECISION", "NEXT_ACTION"] },
  RELATES_TO: {
    from: [
      "DECISION",
      "TASK",
      "OWNERSHIP",
      "DEPENDENCY",
      "RISK",
      "BLOCKER",
      "QUESTION",
      "NEXT_ACTION",
      "MISSING_INFO",
      "RECURRING_PROBLEM",
      "NOTE",
    ],
    to: [
      "DECISION",
      "TASK",
      "OWNERSHIP",
      "DEPENDENCY",
      "RISK",
      "BLOCKER",
      "QUESTION",
      "NEXT_ACTION",
      "MISSING_INFO",
      "RECURRING_PROBLEM",
      "NOTE",
    ],
  },
};

export const IMPACT_RELATIONS: Relation[] = ["AFFECTS", "DEPENDS_ON", "BLOCKS"];

export type RelationshipCandidate = {
  projectId: string;
  fromClaimId: string;
  toClaimId: string;
  relation: Relation;
};

export type RelationshipValidation = { valid: boolean; reason?: string };

export function validateRelationship(
  candidate: RelationshipCandidate,
  claims: Claim[],
  existing: Relationship[] = [],
): RelationshipValidation {
  const byId = new Map(claims.map((claim) => [claim.id, claim]));
  const from = byId.get(candidate.fromClaimId);
  const to = byId.get(candidate.toClaimId);

  if (!from || !to) return { valid: false, reason: "Both claims must exist." };
  if (from.projectId !== candidate.projectId || to.projectId !== candidate.projectId) {
    return { valid: false, reason: "Both claims must belong to the same project." };
  }
  if (candidate.fromClaimId === candidate.toClaimId) {
    return { valid: false, reason: "A claim cannot relate to itself." };
  }

  const rule = RELATION_ALLOWLIST[candidate.relation];
  if (!rule) return { valid: false, reason: "Unknown relationship type." };
  if (!rule.from.includes(from.type)) {
    return {
      valid: false,
      reason: `${candidate.relation} cannot start from a ${from.type} claim.`,
    };
  }
  if (!rule.to.includes(to.type)) {
    return {
      valid: false,
      reason: `${candidate.relation} cannot point at a ${to.type} claim.`,
    };
  }

  const duplicate = existing.some(
    (edge) =>
      edge.fromClaimId === candidate.fromClaimId &&
      edge.toClaimId === candidate.toClaimId &&
      edge.relation === candidate.relation,
  );
  if (duplicate) return { valid: false, reason: "That relationship already exists." };

  if (wouldCreateCycle(candidate, existing)) {
    return { valid: false, reason: "That relationship would create a cycle." };
  }

  return { valid: true };
}

export type SupersessionResult =
  | { ok: true; claims: Claim[]; relationship: Relationship }
  | { ok: false; reason: string };

/**
 * Marks a claim as superseded by a later decision. The supersession edge is
 * returned alongside the updated array so a caller can persist both, matching
 * the database rule that `superseded_by` requires a SUPERSEDES edge.
 */
export function supersedeClaim(input: {
  claims: Claim[];
  claimId: string;
  replacementId: string;
  relationshipId: string;
  at: string;
  confidence?: number;
}): SupersessionResult {
  const target = input.claims.find((claim) => claim.id === input.claimId);
  const replacement = input.claims.find((claim) => claim.id === input.replacementId);

  if (!target || !replacement) {
    return { ok: false, reason: "Both claims must exist." };
  }
  if (target.id === replacement.id) {
    return { ok: false, reason: "A claim cannot supersede itself." };
  }
  if (target.projectId !== replacement.projectId) {
    return { ok: false, reason: "Both claims must belong to the same project." };
  }
  if (target.type !== "DECISION" || replacement.type !== "DECISION") {
    return { ok: false, reason: "Only a decision can supersede another decision." };
  }
  if (target.status === "SUPERSEDED") {
    return { ok: false, reason: "That claim has already been superseded." };
  }
  if (replacement.status === "REJECTED" || replacement.status === "SUPERSEDED") {
    return { ok: false, reason: "The replacement claim must be an active record." };
  }

  const relationship: Relationship = {
    id: input.relationshipId,
    projectId: target.projectId,
    fromClaimId: replacement.id,
    toClaimId: target.id,
    relation: "SUPERSEDES",
    confidence: input.confidence ?? 1,
    createdAt: input.at,
  };

  const claims = input.claims.map((claim) =>
    claim.id === target.id
      ? {
          ...claim,
          status: "SUPERSEDED" as const,
          supersededBy: replacement.id,
          updatedAt: input.at,
        }
      : claim,
  );

  return { ok: true, claims, relationship };
}

const CYCLE_RELATIONS: Relation[] = ["DEPENDS_ON", "PART_OF", "SUPERSEDES", "BLOCKS"];export function wouldCreateCycle(
  candidate: Pick<Relationship, "fromClaimId" | "toClaimId" | "relation">,
  existing: Relationship[],
): boolean {
  if (!CYCLE_RELATIONS.includes(candidate.relation)) return false;

  const adjacency = new Map<string, string[]>();
  for (const edge of existing) {
    if (!CYCLE_RELATIONS.includes(edge.relation)) continue;
    const list = adjacency.get(edge.fromClaimId) ?? [];
    list.push(edge.toClaimId);
    adjacency.set(edge.fromClaimId, list);
  }
  const list = adjacency.get(candidate.fromClaimId) ?? [];
  list.push(candidate.toClaimId);
  adjacency.set(candidate.fromClaimId, list);

  // A cycle exists when the proposed destination can already reach the origin.
  const stack = [candidate.toClaimId];
  const seen = new Set<string>();
  while (stack.length) {
    const current = stack.pop()!;
    if (current === candidate.fromClaimId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    stack.push(...(adjacency.get(current) ?? []));
  }
  return false;
}

/**
 * Bounded breadth-first traversal over impact-bearing relationships.
 * The returned path is the supporting relationship path, not a claim that the
 * real world must behave this way.
 */
export function traverseImpact(
  startClaimId: string,
  relationships: Relationship[],
  maxDepth = 3,
): ImpactNode[] {
  const outgoing = new Map<string, Relationship[]>();
  for (const edge of relationships) {
    if (!IMPACT_RELATIONS.includes(edge.relation)) continue;
    const list = outgoing.get(edge.fromClaimId) ?? [];
    list.push(edge);
    outgoing.set(edge.fromClaimId, list);
  }

  const results: ImpactNode[] = [];
  const bestDepth = new Map<string, number>();
  const queue: { claimId: string; depth: number; path: string[] }[] = [
    { claimId: startClaimId, depth: 0, path: [startClaimId] },
  ];

  while (queue.length) {
    const current = queue.shift()!;
    if (current.depth >= maxDepth) continue;
    for (const edge of outgoing.get(current.claimId) ?? []) {
      if (current.path.includes(edge.toClaimId)) continue;
      const depth = current.depth + 1;
      const path = [...current.path, edge.toClaimId];
      const previous = bestDepth.get(edge.toClaimId);
      if (previous !== undefined && previous <= depth) continue;
      bestDepth.set(edge.toClaimId, depth);
      results.push({
        claimId: edge.toClaimId,
        depth,
        path,
        relation: edge.relation,
        viaClaimId: current.claimId,
      });
      queue.push({ claimId: edge.toClaimId, depth, path });
    }
  }

  return results.sort((a, b) => a.depth - b.depth || a.claimId.localeCompare(b.claimId));
}
