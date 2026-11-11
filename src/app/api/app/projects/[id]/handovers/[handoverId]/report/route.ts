import { jsonError } from "@/lib/api/http";
import { requireRealUser, authErrorResponse } from "@/lib/real/auth";
import { buildRealHandoverReport } from "@/lib/real/handover-service";
import { loadWorkspace } from "@/lib/real/workspace-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; handoverId: string }> },
) {
  try {
    const { id, handoverId } = await context.params;
    const { supabase, appUser } = await requireRealUser(request);
    const snapshot = await loadWorkspace(supabase, appUser, id);
    if (!snapshot) {
      return jsonError(404, "NOT_FOUND", "Project not found or not visible to this identity.");
    }

    const report = await buildRealHandoverReport(supabase, {
      project: snapshot.project,
      projectId: id,
      handoverId,
    });
    if (!report) {
      return jsonError(404, "NOT_FOUND", "Handover not found.");
    }

    return new Response(report.html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${report.filename}"`,
        "Cache-Control": "no-store",
        "x-request-id": crypto.randomUUID(),
      },
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
