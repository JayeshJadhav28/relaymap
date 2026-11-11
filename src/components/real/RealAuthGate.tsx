"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useFirebaseAuth } from "@/lib/firebase/auth-provider";
import { RealConfigNotice, RealLoading } from "@/components/real/states";
import { RealApiProvider } from "@/components/real/RealApiProvider";

export function RealAuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { configured, loading, user } = useFirebaseAuth();

  useEffect(() => {
    if (!configured || loading) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [configured, loading, user, router, pathname]);

  if (!configured) return <RealConfigNotice />;
  if (loading) return <RealLoading label="Checking your Firebase session…" />;
  if (!user) return <RealLoading label="Redirecting to sign in…" />;

  return <RealApiProvider>{children}</RealApiProvider>;
}
