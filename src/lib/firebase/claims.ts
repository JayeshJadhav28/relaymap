import "server-only";
import { getAuth } from "firebase-admin/auth";
import { getFirebaseAdminApp } from "./admin";
import type { ProvisionClaimResult } from "./types";

const SUPABASE_POSTGRES_ROLE = "authenticated";

/**
 * Firebase replaces the whole custom-claims object on write, so every existing
 * claim is merged first. `role` is the PostgreSQL API role only. It is never an
 * organisation, project or review permission.
 */
export async function provisionSupabaseRoleClaim(uid: string): Promise<ProvisionClaimResult> {
  if (!uid) throw new Error("A verified Firebase UID is required.");
  const auth = getAuth(getFirebaseAdminApp());
  const user = await auth.getUser(uid);
  const existing = (user.customClaims ?? {}) as Record<string, unknown>;
  const preservedClaims = Object.keys(existing).filter((key) => key !== "role");

  const merged = { ...existing, role: SUPABASE_POSTGRES_ROLE };
  await auth.setCustomUserClaims(uid, merged);

  // Read back instead of trusting the write call.
  const verified = await auth.getUser(uid);
  const written = (verified.customClaims ?? {}) as Record<string, unknown>;
  if (written.role !== SUPABASE_POSTGRES_ROLE) {
    throw new Error("The Supabase role claim could not be verified after provisioning.");
  }
  for (const key of preservedClaims) {
    if (!(key in written)) {
      throw new Error(`Provisioning removed the existing custom claim "${key}".`);
    }
  }

  return {
    ok: true,
    role: SUPABASE_POSTGRES_ROLE,
    uid,
    preservedClaims,
  };
}

/**
 * Keeps the Firebase profile and the database display name in step. Without
 * this, the next verified token would silently overwrite the edited name.
 */
export async function updateFirebaseDisplayName(uid: string, displayName: string): Promise<void> {
  const auth = getAuth(getFirebaseAdminApp());
  await auth.updateUser(uid, { displayName: displayName.slice(0, 100) });
}
