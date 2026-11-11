"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-safe configuration only. The service-role key lives in a
 * server-only module and is never imported here.
 */
const publicUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
const publicKey = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "").trim();

export function isBrowserSupabaseConfigured(): boolean {
  return Boolean(publicUrl && publicKey);
}

export function createSupabaseBrowserClient() {
  if (!publicUrl || !publicKey) {
    throw new Error("Supabase public configuration is not set.");
  }
  return createBrowserClient(publicUrl, publicKey);
}
