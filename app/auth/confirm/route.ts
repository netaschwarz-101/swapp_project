import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  } else if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Missing/expired/invalid link — send them to login with a message
  // instead of a bare error page.
  return NextResponse.redirect(
    `${origin}/login?error=confirmation_failed`,
  );
}
