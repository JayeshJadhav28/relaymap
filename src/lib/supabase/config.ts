/**
 * Environment validation and Supabase configuration.
 *
 * No credential is ever logged or exposed to the browser except the public URL
 * and publishable key. SUPABASE_SECRET_KEY is server-only.
 *
 * `NEXT_PUBLIC_*` values must be read with static dot access so Next.js can
 * inline them into the browser bundle. Dynamic `process.env[name]` lookups are
 * not inlined and read as undefined in the browser.
 */
function trimmed(value: string | undefined): string {
  return (value ?? "").trim();
}

export const supabaseUrl = trimmed(process.env.NEXT_PUBLIC_SUPABASE_URL);
export const supabasePublishableKey = trimmed(
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);
export const supabaseSecretKey = trimmed(process.env.SUPABASE_SECRET_KEY);

export const hasSupabasePublicConfig = Boolean(supabaseUrl && supabasePublishableKey);
export const hasSupabaseServerConfig = Boolean(supabaseUrl && supabaseSecretKey);

/**
 * The synthetic demo is an isolated, in-memory workspace. It is always
 * available unless explicitly disabled with `RELAY_DEMO_MODE=false`, and it
 * never depends on cloud credentials. Cloud configuration only enables the
 * separate real path under `/app`; the two stores never share rows.
 */
export const isDemoMode = trimmed(process.env.RELAY_DEMO_MODE).toLowerCase() !== "false";

export function supabaseConfigStatus(): {
  publicConfigured: boolean;
  serverConfigured: boolean;
  demoMode: boolean;
} {
  return {
    publicConfigured: hasSupabasePublicConfig,
    serverConfigured: hasSupabaseServerConfig,
    demoMode: isDemoMode,
  };
}
