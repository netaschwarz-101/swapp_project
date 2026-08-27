import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client for use in Server Components and Server Actions. Reads
 * the current request's session cookies so every query/mutation runs as
 * the actual signed-in user — this is what makes Row Level Security see
 * the right `auth.uid()`.
 *
 * Must be created fresh per request (never module-level singleton).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component (not a Server Action / Route
            // Handler) — cookies can't be set here. Harmless as long as
            // proxy.ts is also refreshing the session (it is).
          }
        },
      },
    },
  );
}
