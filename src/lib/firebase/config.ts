import type { FirebasePublicConfig } from "./types";

/**
 * `process.env.NEXT_PUBLIC_*` must be referenced with static dot access.
 *
 * Next.js replaces those literals in the browser bundle at build time. Dynamic
 * access such as `process.env[name]` is never inlined, so it evaluates to
 * undefined in the browser and the real sign-in form silently disappears even
 * though the server sees the variables.
 */
function trimmed(value: string | undefined): string {
  return (value ?? "").trim();
}

const projectId = trimmed(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);

export const firebasePublicConfig: FirebasePublicConfig = {
  apiKey: trimmed(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
  authDomain:
    trimmed(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN) ||
    (projectId ? `${projectId}.firebaseapp.com` : ""),
  projectId,
  appId: trimmed(process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
  messagingSenderId: trimmed(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
};

/** Browser-safe configuration only. Admin credentials live in `admin.ts`. */
export const hasFirebasePublicConfig = Boolean(
  firebasePublicConfig.apiKey &&
    firebasePublicConfig.authDomain &&
    firebasePublicConfig.projectId &&
    firebasePublicConfig.appId,
);

export const firebaseAdminProjectId = trimmed(process.env.FIREBASE_ADMIN_PROJECT_ID);
export const firebaseAdminClientEmail = trimmed(process.env.FIREBASE_ADMIN_CLIENT_EMAIL);
export const firebaseAdminPrivateKey = trimmed(process.env.FIREBASE_ADMIN_PRIVATE_KEY);
export const googleApplicationCredentials = trimmed(
  process.env.GOOGLE_APPLICATION_CREDENTIALS,
);

export const hasFirebaseAdminConfig = Boolean(
  (firebaseAdminProjectId && firebaseAdminClientEmail && firebaseAdminPrivateKey) ||
    googleApplicationCredentials,
);

export function firebaseSetupStatus(): {
  publicConfigured: boolean;
  adminConfigured: boolean;
} {
  return {
    publicConfigured: hasFirebasePublicConfig,
    adminConfigured: hasFirebaseAdminConfig,
  };
}
