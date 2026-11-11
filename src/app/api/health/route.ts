import { jsonOk } from "@/lib/api/http";
import { hasSupabasePublicConfig, isDemoMode } from "@/lib/supabase/config";
import { hasFirebaseAdminConfig, hasFirebasePublicConfig } from "@/lib/firebase/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Readiness probe. It reports whether the real path has all three required
 * configuration pieces; it never claims production readiness and never exposes
 * a credential. Demo availability is independent of cloud configuration.
 */
export async function GET() {
  const realConfigured =
    hasSupabasePublicConfig && hasFirebasePublicConfig && hasFirebaseAdminConfig;
  return jsonOk({
    status: "ok",
    product: "RelayMap",
    mode: realConfigured ? "real-and-demo" : "demo-only",
    demoAvailable: isDemoMode,
    real: {
      configured: realConfigured,
      supabasePublic: hasSupabasePublicConfig,
      firebasePublic: hasFirebasePublicConfig,
      firebaseAdmin: hasFirebaseAdminConfig,
    },
    time: new Date().toISOString(),
  });
}
