import { jsonOk, parseWithSchema, readJson } from "@/lib/api/http";
import { OrganizationBodySchema } from "@/lib/api/real-schemas";
import { requireRealUser, authErrorResponse } from "@/lib/real/auth";
import { createOrganization } from "@/lib/real/admin-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { supabase } = await requireRealUser(request);
    const parsed = parseWithSchema(OrganizationBodySchema, await readJson(request));
    if (!parsed.ok) return parsed.response;

    const organizationId = await createOrganization(supabase, parsed.data.name);
    return jsonOk(
      {
        message:
          "Organisation created. The database assigned you the organisation admin role.",
        organizationId,
      },
      201,
    );
  } catch (error) {
    return authErrorResponse(error);
  }
}
