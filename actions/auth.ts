"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { loginSchema, signupSchema } from "@/lib/validation/profile";

export type AuthActionState = {
  error?: string;
  info?: string;
};

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
  // of redirecting to the bare Site URL. Read from the request's own
  // `origin` header rather than an env var so this is correct on every
  // deployment (preview URLs, production) without extra configuration.
  // Must be on the Supabase project's Redirect URLs allowlist.
  const origin = (await headers()).get("origin");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username, city },
      emailRedirectTo: origin ? `${origin}/auth/confirm` : undefined,
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
    return {
      info: "Account created — check your email to confirm it, then log in.",
    };
  }

  revalidatePath("/", "layout");
  redirect("/");
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
