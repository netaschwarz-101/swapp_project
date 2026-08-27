import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for use in Client Components (browser). Uses the public
 * anon key, which is safe to expose — see docs/security.md for why that's
 * safe *because of* Row Level Security.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
