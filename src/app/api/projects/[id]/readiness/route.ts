import { jsonError, jsonOk } from "@/lib/api/http";
import { getWorkspaceData } from "@/lib/demo/view";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const data = await getWorkspaceData();

  if (id !== data.project.id) {
    return jsonError(404, "NOT_FOUND", "Project not found or not visible to this role.");
  }

  return jsonOk({
    projectId: data.project.id,
    role: data.role,
    score: data.readiness.score,
    components: data.readiness.components,
    reasons: data.readiness.reasons,
    caveat:
      data.readiness.caveat ??
      "A readiness score is a signal, not a guarantee of successful knowledge transfer.",
    computedAt: new Date().toISOString(),
  });
}
