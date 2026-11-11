import { jsonOk, parseWithSchema, readJson } from "@/lib/api/http";
import { BootstrapBodySchema } from "@/lib/api/real-schemas";
import { requireRealUser, authErrorResponse } from "@/lib/real/auth";
import { bootstrapWorkspace } from "@/lib/real/admin-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * First-run setup for the real workspace. The database derives the creator's
 * admin/lead roles; the client cannot supply them.
 */
export async function POST(request: Request) {
  try {
    const { supabase } = await requireRealUser(request);
    const parsed = parseWithSchema(BootstrapBodySchema, await readJson(request));
    if (!parsed.ok) return parsed.response;

    const created = await bootstrapWorkspace(supabase, parsed.data);
    return jsonOk(
      {
        message:
          "Workspace created. You are the organisation admin and project lead; both roles were assigned by the database, not the client.",
        ...created,
      },
      201,
    );
  } catch (error) {
    return authErrorResponse(error);
  }
}
