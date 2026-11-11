"use client";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { firebasePublicConfig, hasFirebasePublicConfig } from "./config";

let cachedApp: FirebaseApp | null = null;
let cachedAuth: Auth | null = null;

export function getFirebaseClientApp(): FirebaseApp {
  if (!hasFirebasePublicConfig) {
    throw new Error("Firebase public configuration is not set.");
  }
  if (cachedApp) return cachedApp;
  cachedApp = getApps().length ? getApp() : initializeApp(firebasePublicConfig);
  return cachedApp;
}

export function getFirebaseClientAuth(): Auth {
  if (cachedAuth) return cachedAuth;
  cachedAuth = getAuth(getFirebaseClientApp());
  return cachedAuth;
}
