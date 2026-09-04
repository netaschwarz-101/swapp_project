"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { profileUpdateSchema } from "@/lib/validation/profile";

export type ProfileActionState = {
  error?: string;
  info?: string;
};

export async function updateProfile(
  _prevState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  // 1. auth check
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in." };

  // 2. zod parse — the avatar uploader submits an empty hidden input
  // (value="") when no avatar is set, which z.string().url() would
  // reject, so treat blank as "no avatar" (null) same as the field
  // starting out unset.
  const rawAvatar = formData.get("avatar_url");
  const parsed = profileUpdateSchema.safeParse({
    username: formData.get("username"),
    city: formData.get("city"),
    avatar_url: rawAvatar ? rawAvatar : null,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  // 3. authorization — none beyond "is authenticated": RLS's "users can
  // update their own profile" policy (0001_profiles.sql) scopes the
  // write below to auth.uid() = id regardless, this .eq() just makes
  // that explicit and gives a normal (not silently-empty) result.

  // 4. mutation
  const { error } = await supabase
    .from("profiles")
    .update(parsed.data)
    .eq("id", user.id);

  if (error) {
    // Postgres unique-violation on profiles.username (0001_profiles.sql).
    if (error.code === "23505") {
      return { error: "That username is already taken." };
    }
    return { error: "Couldn't update your profile. Please try again." };
  }

  // 5. revalidate — the nav bar (every page, via the root layout) shows
  // the username, and /profile itself needs the fresh values.
  revalidatePath("/", "layout");
  return { info: "Profile updated." };
}
