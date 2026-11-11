import { jsonError, jsonOk } from "@/lib/api/http";
import { getCurrentRole } from "@/lib/demo/roles";
import { projectImpact } from "@/lib/demo/service";
import { getStore } from "@/lib/demo/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const store = getStore();

  if (id !== store.project.id) {
    return jsonError(404, "NOT_FOUND", "Project not found.");
  }

  const url = new URL(request.url);
  const claimId = url.searchParams.get("claimId");
  if (!claimId) {
    return jsonError(
      400,
      "VALIDATION_FAILED",
      "A claimId query parameter is required for bounded impact traversal.",
      { claimId: "Provide the claim to start traversal from." },
    );
  }

  const depthRaw = Number(url.searchParams.get("depth") ?? "3");
  const maxDepth = Number.isFinite(depthRaw) ? depthRaw : 3;
  const role = await getCurrentRole();

  const result = projectImpact(store, { claimId, role, maxDepth });
  if (!result.ok) {
    return jsonError(result.status, result.code, result.message, result.fields);
  }

  return jsonOk({
    projectId: id,
    role,
    startClaimId: result.value.startClaimId,
    maxDepth: Math.max(1, Math.min(5, Math.trunc(maxDepth))),
    nodes: result.value.nodes.map((node) => ({
      claimId: node.claim.id,
      title: node.claim.title,
      type: node.claim.type,
      status: node.claim.status,
      depth: node.depth,
      path: node.path,
      relation: node.relation,
    })),
    hiddenCount: result.value.hiddenCount,
    caveat:
      "This is a bounded traversal of recorded relationships, not a claim that every real-world consequence has been found.",
  });
}
