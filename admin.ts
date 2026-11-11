import "server-only";
import { createClient } from "@supabase/supabase-js";
import { hasSupabaseServerConfig, supabaseSecretKey, supabaseUrl } from "@/lib/supabase/config";

export function createSupabaseAdminClient() {
  if (!hasSupabaseServerConfig) throw new Error("Supabase server key is not configured.");
  return createClient(supabaseUrl, supabaseSecretKey, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
}
