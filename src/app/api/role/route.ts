import { RoleBodySchema } from "@/lib/api/schemas";
import { jsonError, jsonOk, parseWithSchema, readJson } from "@/lib/api/http";
import { ROLE_COOKIE, actorForRole } from "@/lib/demo/roles";
import { getStore } from "@/lib/demo/store";
import { ROLE_LABEL } from "@/lib/presentation";
import { isDemoMode } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isDemoMode) {
    return jsonError(
      403,
      "DEMO_ONLY",
      "Preview role switching is disabled outside demo mode. Production roles come from authenticated Supabase membership.",
    );
  }

  const parsed = parseWithSchema(RoleBodySchema, await readJson(request));
  if (!parsed.ok) return parsed.response;

  const role = parsed.data.role;
  getStore().audit.push({
    id: `evt-role-${crypto.randomUUID()}`,
    at: new Date().toISOString(),
    kind: "role.preview_changed",
    title: `Preview role changed to ${ROLE_LABEL[role]}`,
    actor: actorForRole(role),
  });

  const response = jsonOk({ role, message: `Preview role changed to ${ROLE_LABEL[role]}.` });
  response.cookies.set(ROLE_COOKIE, role, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}

export async function GET() {
  return jsonError(405, "METHOD_NOT_ALLOWED", "Use POST to change the preview role.");
}
