import { jsonError, jsonOk } from "@/lib/api/http";
import { requireRealUser, authErrorResponse } from "@/lib/real/auth";
import { resolveProjectAccess } from "@/lib/real/context-service";
import { publishRealHandover } from "@/lib/real/handover-service";
import { str } from "@/lib/real/mapping";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; handoverId: string }> },
) {
  try {
    const { id, handoverId } = await context.params;
    const { supabase, appUser } = await requireRealUser(request);
    const access = await resolveProjectAccess(supabase, appUser, id);
    if (!access) {
      return jsonError(404, "NOT_FOUND", "Project not found or not visible to this identity.");
    }

    const published = await publishRealHandover(supabase, {
      handoverId,
      projectId: id,
      organizationId: str(access.organization, "id"),
      role: access.role,
      appUserId: appUser.id,
    });

    return jsonOk({
      message:
        "Handover version published. The claim set, readiness snapshot and content hash are now immutable.",
      ...published,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
