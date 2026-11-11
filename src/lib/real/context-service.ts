import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  asRow,
  num,
  rows,
  str,
} from "./mapping";
import {
  orgRoleToProjectRole,
  type OrganizationRole,
  type ProjectRole,
  type RealOrganization,
  type RealProjectSummary,
  type RealUser,
  type RealWorkspaceContext,
} from "./types";
import type { AppUser } from "./auth";

const ORG_ROLES: OrganizationRole[] = ["admin", "manager", "member", "viewer"];
const PROJECT_ROLES: ProjectRole[] = [
  "lead",
  "reviewer",
  "contributor",
  "departed",
  "incoming",
  "viewer",
];

function asOrgRole(value: string): OrganizationRole {
  return ORG_ROLES.includes(value as OrganizationRole)
    ? (value as OrganizationRole)
    : "member";
}

function asProjectRole(value: string | undefined): ProjectRole | null {
  return value && PROJECT_ROLES.includes(value as ProjectRole)
    ? (value as ProjectRole)
    : null;
}

export function toRealUser(appUser: AppUser): RealUser {
  return {
    id: appUser.id,
    firebaseUid: appUser.firebase_uid,
    email: appUser.email,
    displayName: appUser.display_name || appUser.email || "Workspace member",
    emailVerified: appUser.email_verified,
  };
}

export async function getRealContext(
  supabase: SupabaseClient,
  appUser: AppUser,
): Promise<RealWorkspaceContext> {
  const [membershipsResult, organizationsResult, projectsResult, projectMembersResult] =
    await Promise.all([
      supabase
        .from("organization_members")
        .select("organization_id, role, clearance")
        .eq("user_id", appUser.id),
      supabase.from("organizations").select("id, name").order("name", { ascending: true }),
      supabase
        .from("projects")
        .select("id, organization_id, name, description, status, updated_at")
        .order("updated_at", { ascending: false }),
      supabase
        .from("project_members")
        .select("project_id, role")
        .eq("user_id", appUser.id),
    ]);

  if (membershipsResult.error || organizationsResult.error || projectsResult.error) {
    throw new Error("context_unavailable");
  }

  const memberships = rows(membershipsResult.data);
  const organizationsById = new Map(
    rows(organizationsResult.data).map((row) => [str(row, "id"), str(row, "name")]),
  );
  const membershipByOrg = new Map<
    string,
    { role: OrganizationRole; clearance: "standard" | "finance" }
  >(
    memberships.map((row) => [
      str(row, "organization_id"),
      {
        role: asOrgRole(str(row, "role", "member")),
        clearance:
          str(row, "clearance", "standard") === "finance" ? "finance" : "standard",
      },
    ]),
  );
  const projectRoleById = new Map(
    rows(projectMembersResult.data).map((row) => [
      str(row, "project_id"),
      asProjectRole(str(row, "role")),
    ]),
  );

  const organizations: RealOrganization[] = memberships
    .map((row) => {
      const id = str(row, "organization_id");
      const membership = membershipByOrg.get(id);
      if (!membership) return null;
      return {
        id,
        name: organizationsById.get(id) ?? "Organisation",
        role: membership.role,
        clearance: membership.clearance,
      } satisfies RealOrganization;
    })
    .filter((value): value is RealOrganization => Boolean(value))
    .sort((a, b) => a.name.localeCompare(b.name));

  const projects: RealProjectSummary[] = rows(projectsResult.data)
    .map((row) => {
      const id = str(row, "id");
      const organizationId = str(row, "organization_id");
      const membership = membershipByOrg.get(organizationId);
      if (!membership) return null;
      const role = projectRoleById.get(id) ?? orgRoleToProjectRole(membership.role);
      return {
        id,
        organizationId,
        organizationName: organizationsById.get(organizationId) ?? "Organisation",
        name: str(row, "name"),
        description: str(row, "description"),
        status: str(row, "status") === "archived" ? "archived" : "active",
        role,
      } satisfies RealProjectSummary;
    })
    .filter((value): value is RealProjectSummary => Boolean(value));

  return {
    user: toRealUser(appUser),
    organizations,
    projects,
  };
}

export type ProjectAccess = {
  project: ReturnType<typeof asRow>;
  organization: ReturnType<typeof asRow>;
  role: ProjectRole;
  orgRole: OrganizationRole;
  clearance: "standard" | "finance";
};

export async function resolveProjectAccess(
  supabase: SupabaseClient,
  appUser: AppUser,
  projectId: string,
): Promise<ProjectAccess | null> {
  const projectResult = await supabase
    .from("projects")
    .select("id, organization_id, name, description, status, owner_id, created_at")
    .eq("id", projectId)
    .maybeSingle();
  if (projectResult.error || !projectResult.data) return null;

  const project = asRow(projectResult.data);
  const organizationId = str(project, "organization_id");

  const [orgResult, membershipResult, projectMembershipResult] = await Promise.all([
    supabase.from("organizations").select("id, name").eq("id", organizationId).maybeSingle(),
    supabase
      .from("organization_members")
      .select("role, clearance")
      .eq("organization_id", organizationId)
      .eq("user_id", appUser.id)
      .maybeSingle(),
    supabase
      .from("project_members")
      .select("role")
      .eq("project_id", projectId)
      .eq("user_id", appUser.id)
      .maybeSingle(),
  ]);

  if (!orgResult.data || !membershipResult.data) return null;

  const orgRole = asOrgRole(str(asRow(membershipResult.data), "role", "member"));
  const clearance =
    str(asRow(membershipResult.data), "clearance", "standard") === "finance"
      ? "finance"
      : "standard";
  const role =
    asProjectRole(
      projectMembershipResult.data
        ? str(asRow(projectMembershipResult.data), "role")
        : undefined,
    ) ?? orgRoleToProjectRole(orgRole);

  return {
    project,
    organization: asRow(orgResult.data),
    role,
    orgRole,
    clearance,
  };
}

export function projectAccessId(access: ProjectAccess): string {
  return str(access.project, "id");
}

export function projectAccessUpdatedScore(access: ProjectAccess): number {
  return num(access.project, "updated_at");
}
