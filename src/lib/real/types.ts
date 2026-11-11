import type {
  Acknowledgement,
  AuditEvent,
  Claim,
  Handover,
  Project,
  Readiness,
  ReviewRecord,
  Role,
  Source,
} from "@/lib/demo/types";

export type ProjectRole =
  | "lead"
  | "reviewer"
  | "contributor"
  | "departed"
  | "incoming"
  | "viewer";

export type OrganizationRole = "admin" | "manager" | "member" | "viewer";

export type RealCapabilities = {
  canContribute: boolean;
  canReview: boolean;
  canLead: boolean;
  canPublish: boolean;
  canAcknowledge: boolean;
};

export type RealUser = {
  id: string;
  firebaseUid: string;
  email: string | null;
  displayName: string;
  emailVerified: boolean;
};

export type RealOrganization = {
  id: string;
  name: string;
  role: OrganizationRole;
  clearance: "standard" | "finance";
};

export type RealProjectSummary = {
  id: string;
  organizationId: string;
  organizationName: string;
  name: string;
  description: string;
  status: "active" | "archived";
  role: ProjectRole;
};

export type RealWorkspaceContext = {
  user: RealUser;
  organizations: RealOrganization[];
  projects: RealProjectSummary[];
};

export type RealWorkspaceSnapshot = {
  context: RealWorkspaceContext;
  project: Project;
  organization: RealOrganization;
  role: ProjectRole;
  capabilities: RealCapabilities;
  sources: Source[];
  claims: Claim[];
  allClaimCount: number;
  excludedCount: number;
  queue: Claim[];
  reviews: ReviewRecord[];
  handovers: Handover[];
  acknowledgements: Acknowledgement[];
  audit: AuditEvent[];
  readiness: Readiness;
};

export const PROJECT_ROLE_LABEL: Record<ProjectRole, string> = {
  lead: "Project lead",
  reviewer: "Reviewer",
  contributor: "Contributor",
  departed: "Departed member",
  incoming: "Incoming owner",
  viewer: "Viewer",
};

export function capabilitiesForProjectRole(role: ProjectRole): RealCapabilities {
  const lead = role === "lead";
  const canReview = lead || role === "reviewer";
  return {
    canContribute: canReview || role === "contributor",
    canReview,
    canLead: lead,
    canPublish: lead,
    canAcknowledge: role === "incoming",
  };
}

export function roleToDemoRole(role: ProjectRole): Role {
  switch (role) {
    case "lead":
      return "lead";
    case "reviewer":
      return "reviewer";
    case "contributor":
      return "reviewer";
    default:
      return "incoming";
  }
}

export function orgRoleToProjectRole(role: OrganizationRole): ProjectRole {
  switch (role) {
    case "admin":
    case "manager":
      return "lead";
    case "viewer":
      return "viewer";
    default:
      return "contributor";
  }
}
