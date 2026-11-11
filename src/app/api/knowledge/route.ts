import { jsonOk } from "@/lib/api/http";
import { getWorkspaceData } from "@/lib/demo/view";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const data = await getWorkspaceData();
  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const status = url.searchParams.get("status");
  const query = (url.searchParams.get("q") ?? "").toLowerCase();

  const claims = data.claims.filter((claim) => {
    if (type && claim.type !== type) return false;
    if (status && claim.status !== status) return false;
    if (!query) return true;
    return `${claim.title} ${claim.description}`.toLowerCase().includes(query);
  });

  return jsonOk({
    role: data.role,
    projectId: data.project.id,
    claims,
    excludedCount: data.excludedCount,
  });
}
