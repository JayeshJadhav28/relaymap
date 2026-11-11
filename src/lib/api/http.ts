import { NextResponse } from "next/server";
import type { ZodType } from "zod";

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
    requestId: string;
  };
};

export function requestId(): string {
  return crypto.randomUUID();
}

export function jsonOk<T>(data: T, status = 200): NextResponse<T> {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "x-request-id": requestId(),
    },
  });
}

export function jsonError(
  status: number,
  code: string,
  message: string,
  fields?: Record<string, string>,
): NextResponse<ApiErrorBody> {
  return NextResponse.json(
    { error: { code, message, fields, requestId: requestId() } },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "x-request-id": requestId(),
      },
    },
  );
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function parseWithSchema<T>(
  schema: ZodType<T>,
  value: unknown,
): { ok: true; data: T } | { ok: false; response: NextResponse<ApiErrorBody> } {
  const result = schema.safeParse(value);
  if (result.success) return { ok: true, data: result.data };
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    fields[issue.path.join(".") || "body"] = issue.message;
  }
  return {
    ok: false,
    response: jsonError(400, "VALIDATION_FAILED", "The request body is invalid.", fields),
  };
}
