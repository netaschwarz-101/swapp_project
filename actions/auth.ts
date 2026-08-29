"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { loginSchema, signupSchema } from "@/lib/validation/profile";

export type AuthActionState = {
  error?: string;
  info?: string;
  /** Set when login failed specifically because the account's email
   * isn't confirmed yet — lets the login form offer a resend instead of
   * just saying "wrong password". */
  needsConfirmation?: boolean;
  email?: string;
};

async function emailRedirectTo() {
  const origin = (await headers()).get("origin");
  return origin ? `${origin}/auth/confirm` : undefined;
}

export async function signup(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  // 1. zod parse (no auth check needed — this action creates the account)
  const parsed = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    username: formData.get("username"),
    city: formData.get("city"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { email, password, username, city } = parsed.data;

  // 2. mutation — profiles row is created by a DB trigger reading this metadata
  //
  // emailRedirectTo tells Supabase where to send the browser after the
  // confirmation link is clicked and verified — pointed at our own
  // route handler (app/auth/confirm/route.ts) so it lands with a `code`
  // param we can exchange for a session, instead of Supabase's default
  // of redirecting to the bare Site URL. Must be on the Supabase
  // project's Redirect URLs allowlist.
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username, city },
      emailRedirectTo: await emailRedirectTo(),
    },
  });

  if (error) {
    // Postgres unique-violation on profiles.username surfaces here too.
    if (error.message.toLowerCase().includes("already registered")) {
      return { error: "An account with this email already exists." };
    }
    return { error: error.message };
  }

  if (!data.session) {
    // Email confirmation is required by the Supabase project settings.
    // NOTE: if this email already has a pending (unconfirmed) signup,
    // Supabase's anti-enumeration behavior means calling signUp() again
    // silently does *not* send a fresh email — this message shows either
    // way, so it can't be used to tell whether a new email actually went
    // out. Use "Resend confirmation email" on the login page instead,
    // which calls the dedicated resend() action below.
    return {
      info: "Account created — check your email to confirm it, then log in.",
    };
  }

  revalidatePath("/", "layout");
  redirect("/");
}

/**
 * Explicitly re-sends the signup confirmation email. Distinct from
 * calling signUp() again: Supabase's resend() is the documented way to
 * get a fresh confirmation email for an existing, still-unconfirmed
 * account — signUp() on an email that already exists does not
 * necessarily send anything, to avoid leaking which emails are
 * registered.
 */
export async function resendConfirmation(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = loginSchema.shape.email.safeParse(formData.get("email"));
  if (!parsed.success) {
    return { error: "Enter a valid email address" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data,
    options: { emailRedirectTo: await emailRedirectTo() },
  });

  if (error) {
    if (error.code === "over_email_send_rate_limit") {
      return {
        error:
          "Too many requests — Supabase's built-in mailer is rate-limited. Wait a few minutes and try again.",
      };
    }
    return { error: error.message };
  }

  return { info: "Confirmation email sent — check your inbox (and spam)." };
}

export async function login(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === "email_not_confirmed") {
      return {
        error: "You haven't confirmed your email yet.",
        needsConfirmation: true,
        email: parsed.data.email,
      };
    }
    return { error: "Incorrect email or password." };
  }

  revalidatePath("/", "layout");
  const next = formData.get("next");
  redirect(typeof next === "string" && next.startsWith("/") ? next : "/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}
