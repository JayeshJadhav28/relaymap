import { jsonOk, parseWithSchema, readJson } from "@/lib/api/http";
import { InvitationBodySchema } from "@/lib/api/real-schemas";
import { requireRealUser, authErrorResponse } from "@/lib/real/auth";
import { createInvitation, listInvitations } from "@/lib/real/admin-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { supabase } = await requireRealUser(request);
    const invitations = await listInvitations(supabase, id);
    return jsonOk({ invitations });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { supabase, appUser } = await requireRealUser(request);
    const parsed = parseWithSchema(InvitationBodySchema, await readJson(request));
    if (!parsed.ok) return parsed.response;

    const invitation = await createInvitation(supabase, {
      organizationId: id,
      email: parsed.data.email,
      role: parsed.data.role,
      clearance: parsed.data.clearance,
      projectId: parsed.data.projectId,
      projectRole: parsed.data.projectRole,
      expiresInDays: parsed.data.expiresInDays,
      appUserId: appUser.id,
    });

    return jsonOk(
      {
        message:
          "Invitation created. The token is shown once and stored only as a SHA-256 hash. Share the link directly with the invitee.",
        invitation: {
          id: invitation.invitationId,
          email: invitation.email,
          role: invitation.role,
          clearance: invitation.clearance,
          projectId: invitation.projectId,
          projectRole: invitation.projectRole,
          expiresAt: invitation.expiresAt,
        },
        token: invitation.token,
        invitePath: `/app/invitations/accept#token=${encodeURIComponent(invitation.token)}`,
      },
      201,
    );
  } catch (error) {
    return authErrorResponse(error);
  }
}
