import { describe, expect, it } from "vitest";
import {
  PROJECT_ROLE_LABEL,
  capabilitiesForProjectRole,
  orgRoleToProjectRole,
  roleToDemoRole,
  type ProjectRole,
} from "./types";

const ROLES: ProjectRole[] = [
  "lead",
  "reviewer",
  "contributor",
  "departed",
  "incoming",
  "viewer",
];

describe("real project roles", () => {
  it("labels every project role", () => {
    for (const role of ROLES) {
      expect(PROJECT_ROLE_LABEL[role].length).toBeGreaterThan(0);
    }
  });

  it("grants lead everything and only incoming acknowledgement", () => {
    expect(capabilitiesForProjectRole("lead")).toEqual({
      canContribute: true,
      canReview: true,
      canLead: true,
      canPublish: true,
      canAcknowledge: false,
    });

    for (const role of ROLES) {
      const capabilities = capabilitiesForProjectRole(role);
      if (role !== "incoming") expect(capabilities.canAcknowledge).toBe(false);
      if (role !== "lead") expect(capabilities.canPublish).toBe(false);
    }
  });

  it("keeps departed and viewer members read-only", () => {
    for (const role of ["departed", "viewer"] as const) {
      expect(capabilitiesForProjectRole(role)).toEqual({
        canContribute: false,
        canReview: false,
        canLead: false,
        canPublish: false,
        canAcknowledge: false,
      });
    }
  });

  it("maps project roles onto the shared demo permission model", () => {
    expect(roleToDemoRole("lead")).toBe("lead");
    expect(roleToDemoRole("reviewer")).toBe("reviewer");
    expect(roleToDemoRole("contributor")).toBe("reviewer");
    expect(roleToDemoRole("incoming")).toBe("incoming");
    expect(roleToDemoRole("departed")).toBe("incoming");
    expect(roleToDemoRole("viewer")).toBe("incoming");
  });

  it("derives an implied project role from organisation membership", () => {
    expect(orgRoleToProjectRole("admin")).toBe("lead");
    expect(orgRoleToProjectRole("manager")).toBe("lead");
    expect(orgRoleToProjectRole("member")).toBe("contributor");
    expect(orgRoleToProjectRole("viewer")).toBe("viewer");
  });
});
