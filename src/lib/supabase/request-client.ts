import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  hasSupabasePublicConfig,
  supabasePublishableKey,
  supabaseUrl,
} from "./config";

/**
 * A request-scoped client. It forwards the caller's Firebase ID token through
 * Supabase's `accessToken` callback and never caches it across requests. The
 * secret/service-role key is deliberately not used here.
 */
export function createRequestSupabaseClient(accessToken: string): SupabaseClient {
  if (!hasSupabasePublicConfig) {
    throw new Error("Supabase public configuration is not set.");
  }
  return createClient(supabaseUrl, supabasePublishableKey, {
    accessToken: async () => accessToken,
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
