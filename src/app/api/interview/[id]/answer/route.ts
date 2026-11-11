import { jsonError, jsonOk, parseWithSchema, readJson } from "@/lib/api/http";
import { InterviewAnswerBodySchema } from "@/lib/api/schemas";
import { actorForRole, getCurrentRole } from "@/lib/demo/roles";
import { answerInterviewQuestion } from "@/lib/demo/service";
import { getStore } from "@/lib/demo/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const role = await getCurrentRole();
  const { id } = await context.params;
  const parsed = parseWithSchema(InterviewAnswerBodySchema, await readJson(request));
  if (!parsed.ok) return parsed.response;

  const result = answerInterviewQuestion(getStore(), {
    questionId: id,
    answer: parsed.data.answer,
    role,
    actor: actorForRole(role),
  });

  if (!result.ok) {
    return jsonError(result.status, result.code, result.message, result.fields);
  }

  return jsonOk({
    message:
      "Answer recorded as an attributable interview source. It must still be extracted and reviewed before it can enter a handover.",
    question: result.value.question,
    sourceId: result.value.source.id,
  });
}
