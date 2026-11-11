import { jsonError, jsonOk, parseWithSchema, readJson } from "@/lib/api/http";
import { ReviewBodySchema } from "@/lib/api/schemas";
import { actorForRole, getCurrentRole } from "@/lib/demo/roles";
import { reviewClaim } from "@/lib/demo/service";
import { getStore } from "@/lib/demo/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const role = await getCurrentRole();
  const { id } = await context.params;
  const parsed = parseWithSchema(ReviewBodySchema, await readJson(request));
  if (!parsed.ok) return parsed.response;

  const result = reviewClaim(getStore(), {
    claimId: id,
    action: parsed.data.action,
    role,
    actor: actorForRole(role),
    comment: parsed.data.comment,
    title: parsed.data.title,
    description: parsed.data.description,
    rationale: parsed.data.rationale,
  });

  if (!result.ok) {
    return jsonError(result.status, result.code, result.message, result.fields);
  }

  return jsonOk({
    message:
      parsed.data.action === "approve"
        ? "Claim approved after exact citation verification. The decision is recorded in the audit trail."
        : `Review action \"${parsed.data.action.replace(/_/g, " ")}\" recorded. Nothing was auto-approved.`,
    claim: result.value,
  });
}
