export type PostResult<T> = {
  ok: boolean;
  message: string;
  data?: T;
  fields?: Record<string, string>;
};

export async function postJson<T = unknown>(
  url: string,
  body: unknown,
): Promise<PostResult<T>> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as
      | { error?: { message?: string; fields?: Record<string, string> }; message?: string }
      | null;

    if (!response.ok) {
      return {
        ok: false,
        message: payload?.error?.message ?? `Request failed with status ${response.status}.`,
        fields: payload?.error?.fields,
      };
    }
    return {
      ok: true,
      message: payload?.message ?? "Saved.",
      data: payload as T,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "The request could not be completed.",
    };
  }
}
