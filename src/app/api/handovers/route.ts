import { jsonError, jsonOk, parseWithSchema, readJson } from "@/lib/api/http";
import { HandoverBodySchema } from "@/lib/api/schemas";
import { actorForRole, getCurrentRole } from "@/lib/demo/roles";
import { createHandover } from "@/lib/demo/service";
import { getStore } from "@/lib/demo/store";
import { getWorkspaceData } from "@/lib/demo/view";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const data = await getWorkspaceData();
  return jsonOk({
    role: data.role,
    handovers: data.handovers,
    acknowledgements: data.acknowledgements,
  });
}

export async function POST(request: Request) {
  const role = await getCurrentRole();
  const parsed = parseWithSchema(HandoverBodySchema, await readJson(request));
  if (!parsed.ok) return parsed.response;

  const result = createHandover(getStore(), {
    role,
    actor: actorForRole(role),
    audienceRole: parsed.data.audienceRole,
    title: parsed.data.title,
  });

  if (!result.ok) {
    return jsonError(result.status, result.code, result.message, result.fields);
  }

  return jsonOk(
    {
      message:
        "Draft handover assembled from the recipient role's permissions. Nothing is published until the lead publishes an immutable version.",
      handoverId: result.value.id,
      handover: result.value,
    },
    201,
  );
}
