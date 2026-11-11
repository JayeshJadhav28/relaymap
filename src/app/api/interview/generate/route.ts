import { jsonError, jsonOk } from "@/lib/api/http";
import { actorForRole, getCurrentRole } from "@/lib/demo/roles";
import { generateInterviewQuestions } from "@/lib/demo/service";
import { getStore } from "@/lib/demo/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const role = await getCurrentRole();
  const result = generateInterviewQuestions(getStore(), {
    role,
    actor: actorForRole(role),
  });

  if (!result.ok) {
    return jsonError(result.status, result.code, result.message, result.fields);
  }

  return jsonOk(
    {
      message:
        result.value.length === 0
          ? "No new gap questions were found. Existing questions already cover the visible claims."
          : `${result.value.length} focused question(s) generated from unresolved gaps. Answers become attributable sources and still require extraction and review.`,
      questions: result.value,
    },
    result.value.length === 0 ? 200 : 201,
  );
}
