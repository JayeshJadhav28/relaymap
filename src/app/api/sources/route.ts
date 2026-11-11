import { jsonError, jsonOk, parseWithSchema, readJson } from "@/lib/api/http";
import { SourceBodySchema } from "@/lib/api/schemas";
import { actorForRole, getCurrentRole } from "@/lib/demo/roles";
import { addSource } from "@/lib/demo/service";
import { getStore } from "@/lib/demo/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const role = await getCurrentRole();
  const parsed = parseWithSchema(SourceBodySchema, await readJson(request));
  if (!parsed.ok) return parsed.response;

  const result = await addSource(getStore(), {
    filename: parsed.data.filename,
    content: parsed.data.content,
    contentBase64: parsed.data.contentBase64,
    access: parsed.data.access,
    role,
    actor: actorForRole(role),
  });

  if (!result.ok) {
    return jsonError(result.status, result.code, result.message, result.fields);
  }

  return jsonOk(
    {
      message: `${result.value.source.title} ingested. ${result.value.claimIds.length} claim(s) extracted; ${result.value.conflicts} conflict(s) detected. Nothing was auto-approved.`,
      sourceId: result.value.source.id,
      claimIds: result.value.claimIds,
      conflicts: result.value.conflicts,
      chunks: result.value.source.chunks.length,
      hash: result.value.source.hash,
    },
    201,
  );
}
