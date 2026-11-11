import { jsonOk, parseWithSchema, readJson } from "@/lib/api/http";
import { ProjectBodySchema } from "@/lib/api/real-schemas";
import { requireRealUser, authErrorResponse } from "@/lib/real/auth";
import { createProject } from "@/lib/real/admin-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { supabase } = await requireRealUser(request);
    const parsed = parseWithSchema(ProjectBodySchema, await readJson(request));
    if (!parsed.ok) return parsed.response;

    const projectId = await createProject(supabase, parsed.data);
    return jsonOk(
      {
        message:
          "Project created. The database assigned you the project lead role.",
        projectId,
      },
      201,
    );
  } catch (error) {
    return authErrorResponse(error);
  }
}
