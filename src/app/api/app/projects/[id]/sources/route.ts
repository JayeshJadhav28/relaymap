import { jsonError, jsonOk, parseWithSchema, readJson } from "@/lib/api/http";
import { RealSourceBodySchema } from "@/lib/api/real-schemas";
import { requireRealUser, authErrorResponse } from "@/lib/real/auth";
import { resolveProjectAccess } from "@/lib/real/context-service";
import { ingestSource } from "@/lib/real/source-service";
import { str } from "@/lib/real/mapping";
import { recordAudit } from "@/lib/real/workspace-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { supabase, appUser } = await requireRealUser(request);
    const access = await resolveProjectAccess(supabase, appUser, id);
    if (!access) {
      return jsonError(404, "NOT_FOUND", "Project not found or not visible to this identity.");
    }

    const parsed = parseWithSchema(RealSourceBodySchema, await readJson(request));
    if (!parsed.ok) return parsed.response;

    const result = await ingestSource(supabase, {
      filename: parsed.data.filename,
      content: parsed.data.content,
      contentBase64: parsed.data.contentBase64,
      access: parsed.data.access,
      organizationId: str(access.organization, "id"),
      projectId: id,
      role: access.role,
      clearance: access.clearance,
      appUser,
    });

    await recordAudit(supabase, {
      organizationId: str(access.organization, "id"),
      projectId: id,
      actorId: appUser.id,
      action: "source.added",
      entityType: "source",
      entityId: result.sourceId,
      title: `Source ingested: ${result.filename}`,
    });

    return jsonOk(
      {
        message: `${result.filename} ingested into private storage. ${result.claimIds.length} claim(s) extracted from ${result.chunks} chunk(s); ${result.conflicts} conflict group(s) detected. Nothing was auto-approved.`,
        ...result,
      },
      201,
    );
  } catch (error) {
    return authErrorResponse(error);
  }
}
