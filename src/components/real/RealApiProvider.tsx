"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useFirebaseAuth } from "@/lib/firebase/auth-provider";
import { realApi, type ApiResult } from "@/lib/real/client";

type RealApiContextValue = {
  call: <T>(path: string, init?: RequestInit) => Promise<ApiResult<T>>;
};

const RealApiContext = createContext<RealApiContextValue | null>(null);

export function RealApiProvider({ children }: { children: ReactNode }) {
  const { getAccessToken } = useFirebaseAuth();

  const call = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<ApiResult<T>> => {
      let token: string | null = null;
      try {
        token = await getAccessToken();
      } catch (error) {
        return {
          ok: false,
          status: 401,
          code: "TOKEN_REFRESH_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "A Supabase-ready Firebase token could not be obtained.",
        };
      }
      if (!token) {
        return {
          ok: false,
          status: 401,
          code: "UNAUTHENTICATED",
          message: "Sign in with a verified Firebase account to use the real workspace.",
        };
      }
      return realApi<T>(token, path, init);
    },
    [getAccessToken],
  );

  const value = useMemo(() => ({ call }), [call]);
  return <RealApiContext.Provider value={value}>{children}</RealApiContext.Provider>;
}

export function useRealApi(): RealApiContextValue {
  const value = useContext(RealApiContext);
  if (!value) throw new Error("useRealApi must be used inside RealApiProvider.");
  return value;
}
