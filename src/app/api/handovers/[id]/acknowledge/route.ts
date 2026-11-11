import { jsonError, jsonOk, parseWithSchema, readJson } from "@/lib/api/http";
import { AcknowledgeBodySchema } from "@/lib/api/schemas";
import { actorForRole, getCurrentRole } from "@/lib/demo/roles";
import { acknowledgeHandover } from "@/lib/demo/service";
import { getStore } from "@/lib/demo/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const role = await getCurrentRole();
  const { id } = await context.params;
  const parsed = parseWithSchema(AcknowledgeBodySchema, await readJson(request));
  if (!parsed.ok) return parsed.response;

  const result = acknowledgeHandover(getStore(), {
    handoverId: id,
    role,
    actor: actorForRole(role),
    note: parsed.data.note,
  });

  if (!result.ok) {
    return jsonError(result.status, result.code, result.message, result.fields);
  }

  return jsonOk({
    message: "Receipt acknowledged against the published version and recorded in the audit trail.",
    acknowledgement: result.value,
  });
}
