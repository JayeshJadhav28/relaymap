import "server-only";
import { createClient } from "@supabase/supabase-js";
import {
  hasSupabaseServerConfig,
  supabaseSecretKey,
  supabaseUrl,
} from "./config";

/**
 * Service-role client. Only for migrations, username lookup and explicitly
 * privileged server operations. Never import this from a Client Component.
 */
export function createSupabaseAdminClient() {
  if (!hasSupabaseServerConfig) {
    throw new Error("Supabase server key is not configured.");
  }
  return createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
