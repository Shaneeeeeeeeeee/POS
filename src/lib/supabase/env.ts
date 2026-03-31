/**
 * Supabase project URL (Dashboard → Project Settings → API).
 */
export function getSupabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
}

/**
 * Public client key: classic anon JWT or newer "publishable" key from the dashboard.
 * Use one name consistently in .env.local, or set ANON and omit publishable.
 */
export function getSupabasePublishableKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
    ""
  );
}
