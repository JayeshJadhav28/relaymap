import { jsonError, jsonOk } from "@/lib/api/http";
import { BuddyQuestionBodySchema } from "@/lib/api/schemas";
import { getCurrentRole } from "@/lib/demo/roles";
import { askBuddy } from "@/lib/demo/service";
import { getStore } from "@/lib/demo/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const store = getStore();
  if (id !== store.project.id) {
    return jsonError(404, "NOT_FOUND", "Project not found or not visible to this role.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const parsed = BuddyQuestionBodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "VALIDATION_FAILED", "The request body is invalid.", {
      question: "Ask a question between 3 and 500 characters.",
    });
  }

  const role = await getCurrentRole();
  const result = askBuddy(store, { question: parsed.data.question, role });
  if (!result.ok) {
    return jsonError(result.status, result.code, result.message, result.fields);
  }

  return jsonOk(result.value);
}
