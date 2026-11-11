import { jsonOk, parseWithSchema, readJson } from "@/lib/api/http";
import { ProfileBodySchema } from "@/lib/api/real-schemas";
import { requireRealUser, authErrorResponse } from "@/lib/real/auth";
import { updateDisplayName } from "@/lib/real/admin-service";
import { getRealContext, toRealUser } from "@/lib/real/context-service";
import { updateFirebaseDisplayName } from "@/lib/firebase/claims";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { supabase, appUser } = await requireRealUser(request);
    const context = await getRealContext(supabase, appUser);
    return jsonOk({
      user: context.user,
      organizations: context.organizations,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { identity, supabase } = await requireRealUser(request);
    const parsed = parseWithSchema(ProfileBodySchema, await readJson(request));
    if (!parsed.ok) return parsed.response;

    await updateFirebaseDisplayName(identity.uid, parsed.data.displayName);
    const updated = await updateDisplayName(supabase, parsed.data.displayName);

    return jsonOk({
      message: "Display name updated in Firebase and the workspace database.",
      user: toRealUser(updated),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
