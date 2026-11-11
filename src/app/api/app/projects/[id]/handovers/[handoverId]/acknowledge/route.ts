import { jsonError, jsonOk, parseWithSchema, readJson } from "@/lib/api/http";
import { RealAcknowledgeBodySchema } from "@/lib/api/real-schemas";
import { requireRealUser, authErrorResponse } from "@/lib/real/auth";
import { resolveProjectAccess } from "@/lib/real/context-service";
import { acknowledgeRealHandover } from "@/lib/real/handover-service";
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

    const parsed = parseWithSchema(RealAcknowledgeBodySchema, await readJson(request));
    if (!parsed.ok) return parsed.response;

    const acknowledgement = await acknowledgeRealHandover(supabase, {
      handoverId,
      projectId: id,
      organizationId: str(access.organization, "id"),
      role: access.role,
      appUserId: appUser.id,
      note: parsed.data.note,
    });

    return jsonOk({
      message:
        "Receipt acknowledged against the published version and recorded in the append-only audit trail.",
      acknowledgement,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
