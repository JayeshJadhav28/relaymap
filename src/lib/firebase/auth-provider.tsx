"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { getFirebaseClientAuth } from "./client";
import { hasFirebasePublicConfig } from "./config";
import {
  ensureSupabaseRole,
  reloadCurrentUser,
  resendVerificationEmail,
  signOutUser,
} from "./auth";

type AuthContextValue = {
  configured: boolean;
  loading: boolean;
  user: User | null;
  emailVerified: boolean;
  /** Returns a token with the Supabase role claim, never persisted in React state. */
  getAccessToken: () => Promise<string | null>;
  refreshUser: () => Promise<User | null>;
  resendVerification: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function FirebaseAuthProvider({ children }: { children: ReactNode }) {
  const configured = hasFirebasePublicConfig;
  const [loading, setLoading] = useState(configured);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (!configured) return;
    return onAuthStateChanged(getFirebaseClientAuth(), (next) => {
      setUser(next);
      setLoading(false);
    });
  }, [configured]);

  const refreshUser = useCallback(async () => {
    const next = await reloadCurrentUser();
    setUser(next);
    return next;
  }, []);

  const getAccessToken = useCallback(async () => {
    if (!user) return null;
    return ensureSupabaseRole();
  }, [user]);

  const resendVerification = useCallback(async () => {
    await resendVerificationEmail();
  }, []);

  const signOut = useCallback(async () => {
    await signOutUser();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      configured,
      loading,
      user,
      emailVerified: Boolean(user?.emailVerified),
      getAccessToken,
      refreshUser,
      resendVerification,
      signOut,
    }),
    [configured, loading, user, getAccessToken, refreshUser, resendVerification, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useFirebaseAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useFirebaseAuth must be used inside FirebaseAuthProvider.");
  return value;
}
