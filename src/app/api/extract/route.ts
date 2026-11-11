import { jsonError, jsonOk, parseWithSchema, readJson } from "@/lib/api/http";
import { ExtractBodySchema } from "@/lib/api/schemas";
import { actorForRole, getCurrentRole } from "@/lib/demo/roles";
import { runExtraction } from "@/lib/demo/service";
import { getStore } from "@/lib/demo/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const role = await getCurrentRole();
  const parsed = parseWithSchema(ExtractBodySchema, await readJson(request));
  if (!parsed.ok) return parsed.response;

  const result = runExtraction(getStore(), {
    sourceIds: parsed.data.sourceId ? [parsed.data.sourceId] : undefined,
    role,
    actor: actorForRole(role),
  });

  if (!result.ok) {
    return jsonError(result.status, result.code, result.message, result.fields);
  }

  return jsonOk({
    message: `${result.value.added} claim(s) extracted from ${result.value.sourceIds.length} source(s). ${result.value.conflicts} conflict(s) flagged. No claim was auto-approved.`,
    ...result.value,
  });
}
