import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  hasSupabasePublicConfig,
  supabasePublishableKey,
  supabaseUrl,
} from "./config";

export async function createSupabaseServerClient() {
  if (!hasSupabasePublicConfig) {
    throw new Error("Supabase public configuration is not set.");
  }
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components cannot write cookies. The proxy refreshes them.
        }
      },
    },
  });
}

export async function getSupabaseUser() {
  if (!hasSupabasePublicConfig) return null;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
