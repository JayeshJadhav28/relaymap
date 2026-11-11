import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { asRow, rows, str } from "./mapping";
import type { AppUser } from "./auth";

export class WorkspaceAdminError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "WorkspaceAdminError";
    this.code = code;
    this.status = status;
  }
}

export type CreatedWorkspace = {
  organizationId: string;
  projectId: string;
};

function requireString(value: unknown, label: string, max: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length < 2 || text.length > max) {
    throw new WorkspaceAdminError(400, "VALIDATION_FAILED", `${label} must be 2–${max} characters.`);
  }
  return text;
}

/** Atomic organisation creation. The RPC decides the creator's role. */
export async function createOrganization(
  supabase: SupabaseClient,
  name: string,
): Promise<string> {
  const { data, error } = await supabase.rpc("create_organization_for_owner", {
    p_name: requireString(name, "Organisation name", 100),
  });
  if (error) throw error;
  if (typeof data !== "string") {
    throw new WorkspaceAdminError(503, "DATABASE_UNAVAILABLE", "Organisation creation returned no id.");
  }
  return data;
}

export async function createProject(
  supabase: SupabaseClient,
  input: { organizationId: string; name: string; description?: string },
): Promise<string> {
  const { data, error } = await supabase.rpc("create_project_for_owner", {
    p_organization_id: input.organizationId,
    p_name: requireString(input.name, "Project name", 120),
    p_description: (input.description ?? "").slice(0, 4000),
  });
  if (error) {
    if ((error.message ?? "").toLowerCase().includes("permission")) {
      throw new WorkspaceAdminError(
        403,
        "FORBIDDEN",
        "You cannot create a project in that organisation.",
      );
    }
    throw error;
  }
  if (typeof data !== "string") {
    throw new WorkspaceAdminError(503, "DATABASE_UNAVAILABLE", "Project creation returned no id.");
  }
  return data;
}

/** First-run setup: organisation and first project in one transaction. */
export async function bootstrapWorkspace(
  supabase: SupabaseClient,
  input: { organizationName: string; projectName: string; projectDescription?: string },
): Promise<CreatedWorkspace> {
  const { data, error } = await supabase.rpc("bootstrap_workspace", {
    p_organization_name: requireString(input.organizationName, "Organisation name", 100),
    p_project_name: requireString(input.projectName, "Project name", 120),
    p_project_description: (input.projectDescription ?? "").slice(0, 4000),
  });
  if (error) throw error;
  const row = rows(data)[0];
  if (!row) {
    throw new WorkspaceAdminError(503, "DATABASE_UNAVAILABLE", "Workspace setup returned no ids.");
  }
  return { organizationId: str(row, "organization_id"), projectId: str(row, "project_id") };
}

export type CreatedInvitation = {
  invitationId: string;
  email: string;
  role: string;
  clearance: "standard" | "finance";
  projectId: string | null;
  projectRole: string | null;
  expiresAt: string;
  /** Returned exactly once. Only its hash is stored. */
  token: string;
};

export async function createInvitation(
  supabase: SupabaseClient,
  input: {
    organizationId: string;
    email: string;
    role: "admin" | "manager" | "member" | "viewer";
    clearance: "standard" | "finance";
    projectId?: string;
    projectRole?:
      | "lead"
      | "reviewer"
      | "contributor"
      | "departed"
      | "incoming"
      | "viewer";
    appUserId: string;
    expiresInDays?: number;
  },
): Promise<CreatedInvitation> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new WorkspaceAdminError(400, "VALIDATION_FAILED", "Enter a valid email address.");
  }
  if ((input.projectId === undefined) !== (input.projectRole === undefined)) {
    throw new WorkspaceAdminError(
      400,
      "VALIDATION_FAILED",
      "Choose both a project and a project role, or neither.",
    );
  }

  if (input.projectId) {
    const project = await supabase
      .from("projects")
      .select("id, organization_id")
      .eq("id", input.projectId)
      .maybeSingle();
    if (project.error) throw project.error;
    if (
      !project.data ||
      str(project.data as Record<string, unknown>, "organization_id") !==
        input.organizationId
    ) {
      throw new WorkspaceAdminError(
        400,
        "VALIDATION_FAILED",
        "Choose a project inside this organisation.",
      );
    }
  }

  const days = Math.max(1, Math.min(30, input.expiresInDays ?? 7));
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  const existing = await supabase
    .from("invitations")
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq("email", email)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .limit(1)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) {
    throw new WorkspaceAdminError(
      409,
      "CONFLICT",
      "An unexpired invitation already exists for this email address. Revoke it before sending another.",
    );
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
  const invitationId = randomUUID();

  const { error } = await supabase.from("invitations").insert({
    id: invitationId,
    organization_id: input.organizationId,
    email,
    role: input.role,
    clearance: input.clearance,
    project_id: input.projectId ?? null,
    project_role: input.projectRole ?? null,
    token_hash: tokenHash,
    invited_by: input.appUserId,
    expires_at: expiresAt,
  });
  if (error) {
    if ((error.message ?? "").toLowerCase().includes("policy")) {
      throw new WorkspaceAdminError(
        403,
        "FORBIDDEN",
        "Only an organisation admin or manager can create invitations.",
      );
    }
    throw error;
  }

  return {
    invitationId,
    email,
    role: input.role,
    clearance: input.clearance,
    projectId: input.projectId ?? null,
    projectRole: input.projectRole ?? null,
    expiresAt,
    token,
  };
}

export type AcceptInvitationResult = {
  organizationId: string;
};

export async function acceptInvitation(
  supabase: SupabaseClient,
  token: string,
): Promise<AcceptInvitationResult> {
  if (typeof token !== "string" || token.trim().length < 16) {
    throw new WorkspaceAdminError(400, "VALIDATION_FAILED", "Invitation token is invalid.");
  }
  const { data, error } = await supabase.rpc("accept_invitation", {
    p_token: token.trim(),
  });
  if (error) {
    const message = error.message ?? "";
    if (message.includes("already been used")) {
      throw new WorkspaceAdminError(409, "CONFLICT", "Invitation has already been used.");
    }
    if (message.includes("expired")) {
      throw new WorkspaceAdminError(410, "EXPIRED", "Invitation has expired.");
    }
    if (message.includes("different email")) {
      throw new WorkspaceAdminError(
        403,
        "EMAIL_MISMATCH",
        "This invitation belongs to a different email address.",
      );
    }
    if (message.includes("not found")) {
      throw new WorkspaceAdminError(404, "NOT_FOUND", "Invitation not found.");
    }
    if (message.includes("verification")) {
      throw new WorkspaceAdminError(403, "EMAIL_NOT_VERIFIED", "Verify your email first.");
    }
    throw error;
  }
  if (typeof data !== "string") {
    throw new WorkspaceAdminError(503, "DATABASE_UNAVAILABLE", "Invitation acceptance failed.");
  }
  return { organizationId: data };
}

export async function listInvitations(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<
  {
    id: string;
    email: string;
    role: string;
    clearance: string;
    projectId: string | null;
    projectRole: string | null;
    expiresAt: string;
    acceptedAt: string | null;
  }[]
> {
  const { data, error } = await supabase
    .from("invitations")
    .select("id, email, role, clearance, project_id, project_role, expires_at, accepted_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return rows(data).map((row) => ({
    id: str(row, "id"),
    email: str(row, "email"),
    role: str(row, "role"),
    clearance: str(row, "clearance"),
    projectId: typeof row.project_id === "string" ? row.project_id : null,
    projectRole: typeof row.project_role === "string" ? row.project_role : null,
    expiresAt: str(row, "expires_at"),
    acceptedAt: typeof row.accepted_at === "string" ? row.accepted_at : null,
  }));
}

export async function updateDisplayName(
  supabase: SupabaseClient,
  displayName: string,
): Promise<AppUser> {
  const name = requireString(displayName, "Display name", 100);
  const { data, error } = await supabase.rpc("provision_app_user", { p_full_name: name });
  if (error) throw error;
  const row = asRow(Array.isArray(data) ? data[0] : data);
  if (!row.id) {
    throw new WorkspaceAdminError(503, "DATABASE_UNAVAILABLE", "Profile update failed.");
  }
  return {
    id: str(row, "id"),
    firebase_uid: str(row, "firebase_uid"),
    email: typeof row.email === "string" ? row.email : null,
    display_name: typeof row.display_name === "string" ? row.display_name : name,
    email_verified: row.email_verified === true,
  };
}
