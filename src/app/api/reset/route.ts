import { jsonError, jsonOk } from "@/lib/api/http";
import { resetStore } from "@/lib/demo/store";
import { isDemoMode } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  if (!isDemoMode) {
    return jsonError(
      403,
      "DEMO_ONLY",
      "The synthetic demo reset is disabled outside demo mode.",
    );
  }

  resetStore();
  return jsonOk({ message: "Synthetic demo reset. Original fixtures, reviews and audit events restored." });
}
