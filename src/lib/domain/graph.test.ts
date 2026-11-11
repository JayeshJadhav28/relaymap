import { describe, expect, it } from "vitest";
import { createSeedStore } from "@/lib/demo/seed";
import {
  supersedeClaim,
  traverseImpact,
  validateRelationship,
  wouldCreateCycle,
} from "./graph";

describe("relationship graph", () => {
  const store = createSeedStore();
  const claims = store.claims;

  it("accepts an allowlisted relationship between claims in one project", () => {
    const result = validateRelationship(
      {
        projectId: store.project.id,
        fromClaimId: "k-deploy",
        toClaimId: "k-next-riya",
        relation: "AFFECTS",
      },
      claims,
      store.relationships,
    );
    expect(result.valid).toBe(true);
  });

  it("rejects self-edges and cross-project claims", () => {
    expect(
      validateRelationship(
        {
          projectId: store.project.id,
          fromClaimId: "k-deploy",
          toClaimId: "k-deploy",
          relation: "RELATES_TO",
        },
        claims,
      ).valid,
    ).toBe(false);

    expect(
      validateRelationship(
        {
          projectId: "proj-other",
          fromClaimId: "k-deploy",
          toClaimId: "k-owner",
          relation: "AFFECTS",
        },
        claims,
      ).valid,
    ).toBe(false);
  });

  it("rejects relationship types that are not allowed for the claim types", () => {
    const result = validateRelationship(
      {
        projectId: store.project.id,
        fromClaimId: "k-owner",
        toClaimId: "k-deploy",
        relation: "OWNS",
      },
      claims,
    );
    expect(result.valid).toBe(false);
  });

  it("rejects duplicate edges", () => {
    const result = validateRelationship(
      {
        projectId: store.project.id,
        fromClaimId: "k-deploy",
        toClaimId: "k-task-deploy",
        relation: "AFFECTS",
      },
      claims,
      store.relationships,
    );
    expect(result.valid).toBe(false);
  });

  it("detects a dependency cycle", () => {
    expect(
      wouldCreateCycle(
        {
          fromClaimId: "k-task-backup",
          toClaimId: "k-owner",
          relation: "DEPENDS_ON",
        },
        store.relationships,
      ),
    ).toBe(true);
  });

  it("traverses only impact relations and respects depth", () => {
    const shallow = traverseImpact("k-deploy", store.relationships, 1);
    expect(shallow.map((node) => node.claimId)).toContain("k-task-deploy");
    expect(shallow.every((node) => node.depth === 1)).toBe(true);

    const deep = traverseImpact("k-deploy", store.relationships, 3);
    expect(deep.map((node) => node.claimId)).toContain("k-task-backup");
    expect(deep.every((node) => node.depth <= 3)).toBe(true);
  });

  it("is deterministic", () => {
    expect(traverseImpact("k-deploy", store.relationships, 3)).toEqual(
      traverseImpact("k-deploy", store.relationships, 3),
    );
  });

  it("supersedes a decision and records the replacement edge", () => {
    const result = supersedeClaim({
      claims: store.claims,
      claimId: "k-deploy",
      replacementId: "k-task-deploy",
      relationshipId: "rel-supersede-test",
      at: "2026-11-10T00:00:00.000Z",
    });
    // A TASK cannot replace a DECISION; the type rule must reject it.
    expect(result.ok).toBe(false);

    const valid = supersedeClaim({
      claims: store.claims,
      claimId: "k-deploy",
      replacementId: "k-rationale",
      relationshipId: "rel-supersede-test",
      at: "2026-11-10T00:00:00.000Z",
    });
    expect(valid.ok).toBe(true);
    if (!valid.ok) return;
    expect(valid.relationship.relation).toBe("SUPERSEDES");
    expect(valid.relationship.fromClaimId).toBe("k-rationale");
    expect(valid.relationship.toClaimId).toBe("k-deploy");
    const replaced = valid.claims.find((claim) => claim.id === "k-deploy")!;
    expect(replaced.status).toBe("SUPERSEDED");
    expect(replaced.supersededBy).toBe("k-rationale");
  });

  it("rejects self-supersession and superseded replacements", () => {
    expect(
      supersedeClaim({
        claims: store.claims,
        claimId: "k-deploy",
        replacementId: "k-deploy",
        relationshipId: "rel-self",
        at: "2026-11-10T00:00:00.000Z",
      }).ok,
    ).toBe(false);

    const superseded = store.claims.map((claim) =>
      claim.id === "k-rationale"
        ? { ...claim, status: "SUPERSEDED" as const }
        : claim,
    );
    expect(
      supersedeClaim({
        claims: superseded,
        claimId: "k-deploy",
        replacementId: "k-rationale",
        relationshipId: "rel-dead",
        at: "2026-11-10T00:00:00.000Z",
      }).ok,
    ).toBe(false);
  });
});
