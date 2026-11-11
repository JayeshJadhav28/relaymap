import "server-only";
import {
  applicationDefault,
  cert,
  getApp,
  getApps,
  initializeApp,
  type App,
} from "firebase-admin/app";
import {
  firebaseAdminClientEmail,
  firebaseAdminPrivateKey,
  firebaseAdminProjectId,
  hasFirebaseAdminConfig,
} from "./config";

const ADMIN_APP_NAME = "relaymap-admin";

const globalForFirebase = globalThis as unknown as {
  relayMapFirebaseAdminApp?: App;
};

/**
 * Firebase Admin is initialised once per server process. No Admin credential is
 * ever imported by a Client Component or placed in a NEXT_PUBLIC_* variable.
 */
export function getFirebaseAdminApp(): App {
  if (!hasFirebaseAdminConfig) {
    throw new Error("Firebase Admin credentials are not configured.");
  }
  if (globalForFirebase.relayMapFirebaseAdminApp) {
    return globalForFirebase.relayMapFirebaseAdminApp;
  }
  const existing = getApps().find((app) => app.name === ADMIN_APP_NAME);
  if (existing) {
    globalForFirebase.relayMapFirebaseAdminApp = existing;
    return existing;
  }

  const options =
    firebaseAdminProjectId && firebaseAdminClientEmail && firebaseAdminPrivateKey
      ? {
          credential: cert({
            projectId: firebaseAdminProjectId,
            clientEmail: firebaseAdminClientEmail,
            privateKey: firebaseAdminPrivateKey.replace(/\\n/g, "\n"),
          }),
          projectId: firebaseAdminProjectId,
        }
      : { credential: applicationDefault() };

  const app = initializeApp(options, ADMIN_APP_NAME);
  globalForFirebase.relayMapFirebaseAdminApp = app;
  return app;
}

export { getApp, ADMIN_APP_NAME };
