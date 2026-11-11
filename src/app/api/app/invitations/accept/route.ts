import { jsonOk, parseWithSchema, readJson } from "@/lib/api/http";
import { AcceptInvitationBodySchema } from "@/lib/api/real-schemas";
import { requireRealUser, authErrorResponse } from "@/lib/real/auth";
import { acceptInvitation } from "@/lib/real/admin-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { supabase } = await requireRealUser(request);
    const parsed = parseWithSchema(AcceptInvitationBodySchema, await readJson(request));
    if (!parsed.ok) return parsed.response;

    const result = await acceptInvitation(supabase, parsed.data.token);
    return jsonOk({
      message:
        "Invitation accepted. Your organisation role was assigned from the single-use invitation, not from the request body.",
      ...result,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
