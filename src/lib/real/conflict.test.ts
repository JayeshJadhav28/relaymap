import { describe, expect, it } from "vitest";
import type { Claim, VerificationStatus } from "@/lib/demo/types";
import { reconcileDeploymentConflicts } from "./conflict";

function claim(overrides: Partial<Claim> & Pick<Claim, "id">): Claim {
  return {
    projectId: "project-1",
    type: "DECISION",
    title: overrides.id,
    description: "",
    status: "INFERRED",
    evidenceStatus: "PARTIAL",
    confidence: 0.9,
    allowedRoles: ["lead", "reviewer", "treasurer", "incoming"],
    citations: [],
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

function deploymentClaim(
  id: string,
  target: string,
  status: VerificationStatus = "NEEDS_REVIEW",
): Claim {
  return claim({
    id,
    subjectKey: "deployment-target",
    attributes: { target },
    status,
  });
}

describe("deployment-target reconciliation", () => {
  it("leaves a single target untouched", () => {
    const claims = [deploymentClaim("a", "Vercel"), deploymentClaim("b", "Vercel")];
    expect(reconcileDeploymentConflicts(claims)).toBe(claims);
  });

  it("marks every unapproved deployment claim as conflicting", () => {
    const claims = [
      deploymentClaim("a", "Vercel"),
      deploymentClaim("b", "Netlify"),
      claim({ id: "other", title: "Unrelated" }),
    ];
    const result = reconcileDeploymentConflicts(claims);

    for (const id of ["a", "b"]) {
      const affected = result.find((item) => item.id === id);
      expect(affected?.status).toBe("CONFLICTING");
      expect(affected?.evidenceStatus).toBe("CONFLICTING");
      expect(affected?.confidence).toBe(0.4);
      expect(affected?.attributes?.conflict).toBe("netlify,vercel");
    }

    expect(result.find((item) => item.id === "other")?.status).toBe("INFERRED");
  });

  it("never overrides a human decision", () => {
    const claims = [
      deploymentClaim("approved", "Vercel", "APPROVED"),
      deploymentClaim("rejected", "Netlify", "REJECTED"),
      deploymentClaim("superseded", "Fly.io", "SUPERSEDED"),
      deploymentClaim("pending", "Netlify"),
    ];
    const result = reconcileDeploymentConflicts(claims);

    for (const id of ["approved", "rejected", "superseded"]) {
      expect(result.find((item) => item.id === id)?.status).toBe(
        claims.find((item) => item.id === id)?.status,
      );
    }
    expect(result.find((item) => item.id === "pending")?.status).toBe("CONFLICTING");
  });

  it("ignores blank targets and claims without a deployment subject", () => {
    const claims = [
      deploymentClaim("blank", "   "),
      deploymentClaim("real", "Vercel"),
      claim({ id: "no-subject", attributes: { target: "Netlify" } }),
    ];
    expect(reconcileDeploymentConflicts(claims)).toBe(claims);
  });

  it("trims and case-folds targets before comparing them", () => {
    const claims = [deploymentClaim("a", " Vercel "), deploymentClaim("b", "vercel")];
    expect(reconcileDeploymentConflicts(claims)).toBe(claims);
  });

  it("caps confidence without raising a lower value", () => {
    const claims = [
      deploymentClaim("low", "Vercel"),
      claim({
        id: "very-low",
        subjectKey: "deployment-target",
        attributes: { target: "Netlify" },
        confidence: 0.2,
      }),
    ];
    const result = reconcileDeploymentConflicts(claims);
    expect(result.find((item) => item.id === "very-low")?.confidence).toBe(0.2);
    expect(result.find((item) => item.id === "low")?.confidence).toBe(0.4);
  });
});
