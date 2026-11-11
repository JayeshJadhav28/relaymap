"use client";

import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { getFirebaseClientAuth } from "./client";

export type AuthFailure = { code: string; message: string };

export function firebaseErrorMessage(error: unknown): string {
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
  switch (code) {
    case "auth/email-already-in-use":
      return "An account already exists for this email address.";
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/weak-password":
      return "Use a password with at least 8 characters.";
    case "auth/user-disabled":
      return "This account has been disabled. Contact the workspace administrator.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Email or password is incorrect.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a few minutes and try again.";
    case "auth/network-request-failed":
      return "The network request failed. Check your connection and try again.";
    case "auth/requires-recent-login":
      return "Sign in again before changing this account.";
    case "auth/operation-not-allowed":
      return "Email and password sign-in is not enabled for this Firebase project.";
    default:
      return error instanceof Error ? error.message : "Authentication failed.";
  }
}

export async function registerWithEmail(input: {
  fullName: string;
  email: string;
  password: string;
}): Promise<User> {
  const auth = getFirebaseClientAuth();
  const credential = await createUserWithEmailAndPassword(
    auth,
    input.email.trim().toLowerCase(),
    input.password,
  );
  await updateProfile(credential.user, { displayName: input.fullName.trim() });
  return credential.user;
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const credential = await signInWithEmailAndPassword(
    getFirebaseClientAuth(),
    email.trim().toLowerCase(),
    password,
  );
  return credential.user;
}

export async function signOutUser(): Promise<void> {
  await signOut(getFirebaseClientAuth());
}

export async function resendVerificationEmail(): Promise<void> {
  const user = getFirebaseClientAuth().currentUser;
  if (!user) throw new Error("No signed-in user.");
  await sendEmailVerification(user);
}

export async function sendPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(getFirebaseClientAuth(), email.trim().toLowerCase());
}

export async function reloadCurrentUser(): Promise<User | null> {
  const user = getFirebaseClientAuth().currentUser;
  if (!user) return null;
  await user.reload();
  return getFirebaseClientAuth().currentUser;
}

export async function getIdToken(forceRefresh = false): Promise<string | null> {
  const user = getFirebaseClientAuth().currentUser;
  if (!user) return null;
  return user.getIdToken(forceRefresh);
}

/** Reads the token payload for UI state only. The server always re-verifies. */
export function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const payload = token.split(".")[1];
    if (!payload) return {};
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = decodeURIComponent(
      Array.from(atob(normalized))
        .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`)
        .join(""),
    );
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function provisionSupabaseRole(token: string): Promise<void> {
  const response = await fetch("/api/auth/provision-supabase-claim", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    throw new Error(body?.error?.message ?? "Could not provision the Supabase role claim.");
  }
}

/**
 * Returns a token that contains `role: authenticated`, forcing a refresh first.
 * The client never treats this claim as an application permission.
 */
export async function ensureSupabaseRole(): Promise<string | null> {
  const user = getFirebaseClientAuth().currentUser;
  if (!user) return null;
  let token = await user.getIdToken(true);
  if (decodeJwtPayload(token).role !== "authenticated") {
    await provisionSupabaseRole(token);
    token = await user.getIdToken(true);
  }
  if (decodeJwtPayload(token).role !== "authenticated") {
    throw new Error(
      "The refreshed Firebase token does not contain the Supabase role claim. Try signing in again.",
    );
  }
  return token;
}
