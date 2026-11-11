import { jsonError, jsonOk } from "@/lib/api/http";
import { actorForRole, getCurrentRole } from "@/lib/demo/roles";
import { publishHandover } from "@/lib/demo/service";
import { getStore } from "@/lib/demo/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const role = await getCurrentRole();
  const { id } = await context.params;

  const result = publishHandover(getStore(), {
    handoverId: id,
    role,
    actor: actorForRole(role),
  });

  if (!result.ok) {
    return jsonError(result.status, result.code, result.message, result.fields);
  }

  return jsonOk({
    message:
      "Handover version published. The claim set, readiness snapshot and content hash are now immutable.",
    handover: result.value,
  });
}
