"use client";

export type ApiFailure = {
  ok: false;
  status: number;
  code: string;
  message: string;
  fields?: Record<string, string>;
};

export type ApiSuccess<T> = { ok: true; data: T };

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export type RealContextResponse = {
  source: "real";
  user: {
    id: string;
    firebaseUid: string;
    email: string | null;
    displayName: string;
    emailVerified: boolean;
  };
  organizations: {
    id: string;
    name: string;
    role: "admin" | "manager" | "member" | "viewer";
    clearance: "standard" | "finance";
  }[];
  projects: {
    id: string;
    organizationId: string;
    organizationName: string;
    name: string;
    description: string;
    status: "active" | "archived";
    role: string;
  }[];
  needsSetup: boolean;
};

export async function realApi<T>(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<ApiResult<T>> {
  try {
    const response = await fetch(path, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
      cache: "no-store",
    });

    const body = (await response.json().catch(() => null)) as
      | { error?: { code?: string; message?: string; fields?: Record<string, string> } }
      | null;

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        code: body?.error?.code ?? `HTTP_${response.status}`,
        message:
          body?.error?.message ??
          (response.status === 401
            ? "Your session expired. Sign in again."
            : "The request failed."),
        fields: body?.error?.fields,
      };
    }
    return { ok: true, data: body as T };
  } catch {
    return {
      ok: false,
      status: 0,
      code: "NETWORK_ERROR",
      message:
        "The network request failed. Check your connection and try again. No demo data was substituted.",
    };
  }
}
