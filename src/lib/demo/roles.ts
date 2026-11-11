import { cookies } from "next/headers";
import { isDemoMode } from "@/lib/supabase/config";
import { DEFAULT_ROLE, isRole, type Role } from "./types";

export const ROLE_COOKIE = "relay_role";

/**
 * Least-privilege fallback when no authenticated identity resolver is wired.
 * Real Supabase membership resolution is Round 3 work; until then a configured
 * deployment must not inherit demo permissions.
 */
export const UNRESOLVED_ROLE: Role = "incoming";

export type RoleCapabilities = {
  canUpload: boolean;
  canReview: boolean;
  canManage: boolean;
  canAcknowledge: boolean;
};

export function capabilitiesFor(role: Role): RoleCapabilities {
  return {
    canUpload: role === "lead" || role === "reviewer",
    canReview: role === "lead" || role === "reviewer",
    canManage: role === "lead",
    canAcknowledge: role === "incoming",
  };
}

export function actorForRole(role: Role): string {
  switch (role) {
    case "lead":
      return "Meera Shah (project lead)";
    case "reviewer":
      return "Riya Kapoor (reviewer)";
    case "treasurer":
      return "Dev Patel (treasurer)";
    case "incoming":
      return "Hemant Rai (incoming owner)";
  }
}

export async function getCurrentRole(): Promise<Role> {
  // `relay_role` is a preview affordance for the synthetic demo. It is not an
  // authentication credential and must never grant production permissions.
  if (!isDemoMode) return UNRESOLVED_ROLE;

  const jar = await cookies();
  const value = jar.get(ROLE_COOKIE)?.value;
  return isRole(value) ? value : DEFAULT_ROLE;
}
