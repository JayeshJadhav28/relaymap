import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/http";
import { createRequestSupabaseClient } from "@/lib/supabase/request-client";
import { hasSupabasePublicConfig } from "@/lib/supabase/config";
import { verifyFirebaseRequest } from "@/lib/firebase/verify-token";
import { AuthenticationError, type VerifiedFirebaseIdentity } from "@/lib/firebase/types";

export type AppUser = {
  id: string;
  firebase_uid: string;
  email: string | null;
  display_name: string | null;
  email_verified: boolean;
};

export type RealRequestContext = {
  identity: VerifiedFirebaseIdentity;
  supabase: SupabaseClient;
  appUser: AppUser;
};

function normaliseAppUser(data: unknown): AppUser | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  const value = row as Record<string, unknown>;
  if (typeof value.id !== "string" || typeof value.firebase_uid !== "string") return null;
  return {
    id: value.id,
    firebase_uid: value.firebase_uid,
    email: typeof value.email === "string" ? value.email : null,
    display_name: typeof value.display_name === "string" ? value.display_name : null,
    email_verified: value.email_verified === true,
  };
}

/**
 * Verifies Firebase identity, then creates a request-scoped Supabase client and
 * idempotently provisions the internal app_users/profile rows through a
 * security-definer RPC that reads identity from the JWT only.
 */
export async function requireRealUser(request: Request): Promise<RealRequestContext> {
  const identity = await verifyFirebaseRequest(request, {
    checkRevoked: true,
  });

  if (!hasSupabasePublicConfig) {
    throw new AuthenticationError(
      503,
      "SUPABASE_NOT_CONFIGURED",
      "Supabase is not configured. Real workspace data is unavailable.",
    );
  }

  const supabase = createRequestSupabaseClient(identity.token);
  const { data, error } = await supabase.rpc("provision_app_user", {
    p_full_name: identity.displayName,
  });
  if (error) {
    throw new AuthenticationError(
      503,
      "PROVISION_FAILED",
      "The application profile could not be provisioned. Check that the Firebase identity migration has been applied.",
    );
  }
  const appUser = normaliseAppUser(data);
  if (!appUser) {
    throw new AuthenticationError(
      503,
      "PROVISION_FAILED",
      "The application profile response was invalid.",
    );
  }
  return { identity, supabase, appUser };
}

export function authErrorResponse(error: unknown): NextResponse {
  if (error instanceof AuthenticationError) {
    return jsonError(error.status, error.code, error.message);
  }
  if (error && typeof error === "object") {
    const candidate = error as { status?: unknown; code?: unknown; message?: unknown };
    if (
      typeof candidate.status === "number" &&
      typeof candidate.code === "string" &&
      typeof candidate.message === "string"
    ) {
      return jsonError(candidate.status, candidate.code, candidate.message);
    }
    const message = typeof candidate.message === "string" ? candidate.message : "";
    if (
      message.includes("row-level security") ||
      message.includes("permission denied") ||
      message.includes("violates row-level security")
    ) {
      return jsonError(
        403,
        "FORBIDDEN",
        "Your workspace role does not permit that action.",
      );
    }
  }
  return jsonError(
    503,
    "SERVICE_UNAVAILABLE",
    "The real workspace is temporarily unavailable. No demo data was substituted.",
  );
}

export function dbErrorResponse(): NextResponse {
  // Database details are deliberately not echoed to the browser.
  return jsonError(
    503,
    "DATABASE_UNAVAILABLE",
    "The workspace database could not complete the request. Try again or contact the workspace administrator.",
  );
}
