import { jsonError, jsonOk } from "@/lib/api/http";
import { provisionSupabaseRoleClaim } from "@/lib/firebase/claims";
import { verifyFirebaseRequest } from "@/lib/firebase/verify-token";
import { AuthenticationError } from "@/lib/firebase/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Adds the PostgreSQL `authenticated` role claim to the caller's Firebase
 * custom claims. The UID is read only from the verified token; the request body
 * is never used for identity. Existing custom claims are preserved.
 *
 * `role: "authenticated"` is a Supabase API role, never an app permission.
 */
export async function POST(request: Request) {
  try {
    const identity = await verifyFirebaseRequest(request, {
      checkRevoked: true,
    });
    const result = await provisionSupabaseRoleClaim(identity.uid);
    return jsonOk({
      ...result,
      message:
        "The Supabase API role claim is set. Force-refresh the Firebase ID token before calling Supabase.",
      tokenRefreshRequired: true,
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return jsonError(error.status, error.code, error.message);
    }
    return jsonError(
      503,
      "CLAIM_PROVISIONING_FAILED",
      "Firebase Admin could not set the Supabase role claim. Check the Admin service account configuration.",
    );
  }
}
