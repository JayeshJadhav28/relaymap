import { jsonError, jsonOk } from "@/lib/api/http";
import { requireRealUser, authErrorResponse } from "@/lib/real/auth";
import { loadWorkspace } from "@/lib/real/workspace-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { supabase, appUser } = await requireRealUser(request);
    const snapshot = await loadWorkspace(supabase, appUser, id);
    if (!snapshot) {
      return jsonError(
        404,
        "NOT_FOUND",
        "Project not found or not visible to this identity. No demo data was substituted.",
      );
    }
    return jsonOk({ source: "real" as const, snapshot });
  } catch (error) {
    return authErrorResponse(error);
  }
}
