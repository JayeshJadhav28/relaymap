import "server-only";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import { getFirebaseAdminApp } from "./admin";
import { firebaseAdminProjectId, hasFirebaseAdminConfig } from "./config";
import { AuthenticationError, type VerifiedFirebaseIdentity } from "./types";

export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

export type VerifyOptions = {
  /** Protected application operations require a verified email address. */
  requireVerifiedEmail?: boolean;
  /** Sensitive actions additionally check token revocation. */
  checkRevoked?: boolean;
};

export async function verifyFirebaseRequest(
  request: Request,
  options: VerifyOptions = {},
): Promise<VerifiedFirebaseIdentity> {
  if (!hasFirebaseAdminConfig) {
    throw new AuthenticationError(
      503,
      "AUTH_NOT_CONFIGURED",
      "Firebase Admin is not configured. Real-user authentication is unavailable.",
    );
  }
  const token = extractBearerToken(request);
  if (!token) {
    throw new AuthenticationError(401, "UNAUTHENTICATED", "A Firebase ID token is required.");
  }

  let decoded: DecodedIdToken;
  try {
    decoded = await getAuth(getFirebaseAdminApp()).verifyIdToken(
      token,
      options.checkRevoked ?? true,
    );
  } catch (error) {
    // Never log the token or the raw verification error, which can include it.
    // Distinguish a broken server credential from a bad caller token: a
    // malformed service-account key must not be reported as "expired token".
    const code =
      typeof error === "object" && error && "code" in error
        ? String((error as { code?: unknown }).code ?? "")
        : "";
    const message = error instanceof Error ? error.message : "";
    if (
      code.startsWith("app/") ||
      message.includes("Failed to parse private key") ||
      message.includes("credential")
    ) {
      throw new AuthenticationError(
        503,
        "AUTH_NOT_CONFIGURED",
        "Firebase Admin credentials are invalid. Check FIREBASE_ADMIN_PRIVATE_KEY and the project ID.",
      );
    }
    throw new AuthenticationError(401, "INVALID_TOKEN", "The Firebase ID token is invalid or expired.");
  }

  if (firebaseAdminProjectId && decoded.aud !== firebaseAdminProjectId) {
    throw new AuthenticationError(401, "WRONG_PROJECT", "The Firebase token belongs to a different project.");
  }
  if (!decoded.sub) {
    throw new AuthenticationError(401, "INVALID_TOKEN", "The Firebase token has no subject.");
  }
  if (options.requireVerifiedEmail && decoded.email_verified !== true) {
    throw new AuthenticationError(
      403,
      "EMAIL_NOT_VERIFIED",
      "Verify your email address before using the real workspace.",
    );
  }

  return {
    uid: decoded.sub,
    email: decoded.email ?? null,
    emailVerified: decoded.email_verified === true,
    displayName: typeof decoded.name === "string" ? decoded.name : null,
    token,
    claims: decoded as unknown as Record<string, unknown>,
  };
}
