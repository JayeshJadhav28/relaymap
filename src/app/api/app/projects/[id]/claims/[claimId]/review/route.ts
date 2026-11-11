import { jsonError, jsonOk, parseWithSchema, readJson } from "@/lib/api/http";
import { RealReviewBodySchema } from "@/lib/api/real-schemas";
import { requireRealUser, authErrorResponse } from "@/lib/real/auth";
import { resolveProjectAccess } from "@/lib/real/context-service";
import { reviewRealClaim } from "@/lib/real/review-service";
import { str } from "@/lib/real/mapping";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; claimId: string }> },
) {
  try {
    const { id, claimId } = await context.params;
    const { supabase, appUser } = await requireRealUser(request);
    const access = await resolveProjectAccess(supabase, appUser, id);
    if (!access) {
      return jsonError(404, "NOT_FOUND", "Project not found or not visible to this identity.");
    }

    const parsed = parseWithSchema(RealReviewBodySchema, await readJson(request));
    if (!parsed.ok) return parsed.response;

    const claim = await reviewRealClaim(supabase, {
      claimId,
      projectId: id,
      organizationId: str(access.organization, "id"),
      role: access.role,
      appUserId: appUser.id,
      action: parsed.data.action,
      comment: parsed.data.comment,
      title: parsed.data.title,
      description: parsed.data.description,
      rationale: parsed.data.rationale,
    });

    return jsonOk({
      message:
        parsed.data.action === "approve"
          ? "Claim approved after exact, chunk-bound citation verification. The decision is recorded in the append-only audit trail."
          : `Review action "${parsed.data.action.replace(/_/g, " ")}" recorded. Nothing was auto-approved.`,
      claim,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
