import { jsonError, jsonOk, parseWithSchema, readJson } from "@/lib/api/http";
import { RealHandoverBodySchema } from "@/lib/api/real-schemas";
import { requireRealUser, authErrorResponse } from "@/lib/real/auth";
import { createRealHandover } from "@/lib/real/handover-service";
import { loadWorkspace } from "@/lib/real/workspace-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { supabase, appUser } = await requireRealUser(request);
    const parsed = parseWithSchema(RealHandoverBodySchema, await readJson(request));
    if (!parsed.ok) return parsed.response;

    const snapshot = await loadWorkspace(supabase, appUser, id);
    if (!snapshot) {
      return jsonError(404, "NOT_FOUND", "Project not found or not visible to this identity.");
    }

    const created = await createRealHandover(supabase, {
      snapshot,
      audienceRole: parsed.data.audienceRole,
      title: parsed.data.title,
      appUserId: appUser.id,
    });

    return jsonOk(
      {
        message:
          "Draft assembled from the recipient role's permissions. Nothing is published until the project lead seals an immutable version.",
        ...created,
      },
      201,
    );
  } catch (error) {
    return authErrorResponse(error);
  }
}
