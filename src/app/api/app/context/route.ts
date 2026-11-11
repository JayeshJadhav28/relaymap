import { jsonOk } from "@/lib/api/http";
import { requireRealUser, authErrorResponse } from "@/lib/real/auth";
import { getRealContext } from "@/lib/real/context-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { supabase, appUser } = await requireRealUser(request);
    const context = await getRealContext(supabase, appUser);
    return jsonOk({
      source: "real" as const,
      user: context.user,
      organizations: context.organizations,
      projects: context.projects,
      needsSetup: context.organizations.length === 0,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
