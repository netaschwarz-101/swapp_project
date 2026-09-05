import { type EmailOtpType } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Consumes the link from Supabase's confirmation email (signup, magic
 * link, password recovery, etc.) and exchanges it for a real session.
 *
 * This route is the target of the email link — `actions/auth.ts` sets
 * `emailRedirectTo` on signUp() to point here, so the confirmation email
 * (still Supabase's default template — editing the template body
 * requires custom SMTP to be configured, which this project doesn't use)
 * ends up sending the browser to Supabase's own hosted `/auth/v1/verify`
 * first, which verifies the token and then redirects here with a `code`
 * param (PKCE). `token_hash`/`type` is also handled as a fallback, since
 * that's what a direct, custom-template link would use instead.
 *
 * A Route Handler can't rely on `lib/supabase/server.ts`'s cookie
 * handling the way a Server Action or Server Component can — that client
 * writes cookies via `next/headers`'s `cookies().set()`, which does not
 * reliably attach to a `NextResponse` object built and returned
 * separately, the way this handler needs to for a redirect. The earlier
 * version of this route used that client, which meant
 * `exchangeCodeForSession()`/`verifyOtp()` succeeded — the account really
 * was confirmed — but the session cookie never actually reached the
 * browser, so the redirect landed the user on the target page still
 * logged out. This version builds the redirect response first and writes
 * cookies directly onto it (`response.cookies.set(...)`), the same
 * pattern `lib/supabase/proxy.ts` already uses for exactly this reason.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  const response = NextResponse.redirect(`${origin}${next}`);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return response;
  } else if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) return response;
  }

  // Missing/expired/invalid link — send them to login with a message
  // instead of a bare error page.
  return NextResponse.redirect(`${origin}/login?error=confirmation_failed`);
}
